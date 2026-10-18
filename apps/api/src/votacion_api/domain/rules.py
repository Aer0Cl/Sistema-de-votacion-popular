"""Reglas de votaciones y catalogo. Port de voting-core (election.ts, catalog.ts, results.ts).

Los mensajes de error son los mismos que muestra el front.
"""

import re
import unicodedata
from collections.abc import Iterable
from datetime import datetime
from typing import Any

from .clock import parse_iso
from .tally import tally_instant_runoff, tally_plurality

ELECTION_CODE_PATTERN = re.compile(r"^[A-Z0-9]{6,8}$")
MIN_CATEGORIES = 2
MAX_CATEGORIES = 24
MIN_NOMINEES = 2
# Por ahora los rankings deben ordenar a todos los nominados
REQUIRE_COMPLETE_RANKING = True
VOTING_METHODS = ("plurality", "ranked")


def normalize_election_code(code: str) -> str:
    return code.strip().upper()


def is_valid_election_code(code: str) -> bool:
    return bool(ELECTION_CODE_PATTERN.fullmatch(normalize_election_code(code)))


def election_status(closes_at: str, now: datetime) -> str:
    return "open" if now < parse_iso(closes_at) else "closed"


def validate_new_election(
    data: dict[str, Any],
    catalog: list[dict[str, Any]],
    nominees: list[dict[str, Any]],
    now: datetime,
) -> list[str]:
    errors: list[str] = []

    if not data["name"].strip():
        errors.append("La votacion necesita un nombre.")

    try:
        if parse_iso(data["closesAt"]) <= now:
            errors.append("La fecha de termino debe ser futura.")
    except ValueError:
        errors.append("La fecha de termino no es valida.")

    category_ids = set(data["categoryIds"])
    if not MIN_CATEGORIES <= len(category_ids) <= MAX_CATEGORIES:
        errors.append(f"Elige entre {MIN_CATEGORIES} y {MAX_CATEGORIES} categorias.")

    known = {category["id"] for category in catalog}
    if category_ids - known:
        errors.append("Hay categorias que no existen en el catalogo.")

    without_nominees = [
        category["name"]
        for category in catalog
        if category["id"] in category_ids
        and sum(1 for n in nominees if n["categoryId"] == category["id"]) < MIN_NOMINEES
    ]
    if without_nominees:
        errors.append(
            f"Estas categorias necesitan al menos {MIN_NOMINEES} nominados: "
            f"{', '.join(without_nominees)}."
        )

    return errors


def validate_answer_choice(
    category: dict[str, Any],
    nominees: list[dict[str, Any]],
    choice: dict[str, Any],
    require_complete_ranking: bool = REQUIRE_COMPLETE_RANKING,
) -> str | None:
    ids = {n["id"] for n in nominees if n["categoryId"] == category["id"]}

    if category["votingMethod"] == "plurality":
        nominee_id = choice.get("nomineeId")
        if not isinstance(nominee_id, str):
            return "Esta categoria se responde eligiendo un nominado."
        return None if nominee_id in ids else "El nominado no pertenece a la categoria."

    ranking = choice.get("ranking")
    if not isinstance(ranking, list) or not all(isinstance(n, str) for n in ranking):
        return "Esta categoria se responde ordenando a los nominados."
    if not ranking:
        return "El ranking debe tener al menos un nominado."
    if len(set(ranking)) != len(ranking):
        return "El ranking tiene nominados repetidos."
    if any(n not in ids for n in ranking):
        return "El ranking incluye nominados que no pertenecen a la categoria."
    if require_complete_ranking and len(ranking) != len(ids):
        return "El ranking debe ordenar a todos los nominados."
    return None


def snapshot_answers(
    history: Iterable[dict[str, Any]],
    closes_at: str,
    category_ids: Iterable[str],
    member_ids: Iterable[str],
) -> list[dict[str, Any]]:
    """Para cada participante y categoria, la ultima version guardada antes del cierre."""
    limit = parse_iso(closes_at)
    members = set(member_ids)
    categories = set(category_ids)
    latest: dict[tuple[str, str], dict[str, Any]] = {}

    for answer in history:
        updated_at = parse_iso(answer["updatedAt"])
        if (
            updated_at >= limit
            or answer["userId"] not in members
            or answer["categoryId"] not in categories
        ):
            continue
        key = (answer["userId"], answer["categoryId"])
        current = latest.get(key)
        if current is None or parse_iso(current["updatedAt"]) <= updated_at:
            latest[key] = answer

    return list(latest.values())


def tally_election(
    categories: list[dict[str, Any]],
    nominees: list[dict[str, Any]],
    answers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    results = []
    for category in categories:
        nominee_ids = [n["id"] for n in nominees if n["categoryId"] == category["id"]]
        category_answers = [a for a in answers if a["categoryId"] == category["id"]]
        if category["votingMethod"] == "plurality":
            ballots = [a for a in category_answers if "nomineeId" in a]
            result = tally_plurality(nominee_ids, ballots)
        else:
            ballots = [a for a in category_answers if "ranking" in a]
            result = tally_instant_runoff(nominee_ids, ballots)
        results.append(
            {
                "categoryId": category["id"],
                "votingMethod": category["votingMethod"],
                "result": result,
            }
        )
    return results


# --- Catalogo ---------------------------------------------------------------------------


def is_category_locked(category_id: str, elections: Iterable[dict[str, Any]]) -> bool:
    """En uso en alguna votacion: no se elimina, no cambia de metodo ni recibe nominados."""
    return any(category_id in election["categoryIds"] for election in elections)


def _same_name(a: str, b: str) -> bool:
    return a.strip().casefold() == b.strip().casefold()


def validate_category_name(
    name: str, catalog: list[dict[str, Any]], exclude_id: str | None = None
) -> str | None:
    if not name.strip():
        return "La categoria necesita un nombre."
    if any(c["id"] != exclude_id and _same_name(c["name"], name) for c in catalog):
        return "Ya existe una categoria con ese nombre."
    return None


def validate_nominee_name(
    name: str,
    category_id: str,
    nominees: list[dict[str, Any]],
    exclude_id: str | None = None,
) -> str | None:
    if not name.strip():
        return "El nominado necesita un nombre."
    if any(
        n["categoryId"] == category_id and n["id"] != exclude_id and _same_name(n["name"], name)
        for n in nominees
    ):
        return "Ya existe un nominado con ese nombre en la categoria."
    return None


def slug_id(name: str, taken: set[str]) -> str:
    """Id legible a partir del nombre ("Mejor direccion" -> "mejor-direccion"), unico."""
    ascii_name = "".join(
        ch for ch in unicodedata.normalize("NFD", name) if not unicodedata.combining(ch)
    )
    base = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-") or "item"
    candidate = base
    suffix = 2
    while candidate in taken:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate
