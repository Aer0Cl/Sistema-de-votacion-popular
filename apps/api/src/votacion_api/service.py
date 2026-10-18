"""Casos de uso del backend. Implementa el contrato VotingApi de apps/web/src/api/types.ts
con las mismas reglas que la API simulada del front (apps/web/src/api/mockApi.ts).

Los logs registran quien hizo que operacion, nunca el contenido de un voto.
"""

import secrets
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from aws_lambda_powertools import Logger

from .domain.clock import normalize_iso, parse_iso, to_iso
from .domain.rules import (
    VOTING_METHODS,
    election_status,
    is_category_locked,
    normalize_election_code,
    slug_id,
    tally_election,
    validate_answer_choice,
    validate_category_name,
    validate_new_election,
    validate_new_nominees,
    validate_new_user,
    validate_nominee_name,
)
from .errors import ApiError
from .repository import Item, Repository

logger = Logger(child=True)

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8
CATALOG_ADMIN_MESSAGE = "Solo los administradores gestionan el catalogo."
USERS_ADMIN_MESSAGE = "Solo los administradores pueden crear usuarios."


def _public_nominee(nominee: Item) -> Item:
    return {k: v for k, v in nominee.items() if k != "createdAt"}


def _choice(answer: Item) -> Item:
    if "nomineeId" in answer:
        return {"nomineeId": answer["nomineeId"]}
    return {"ranking": list(answer["ranking"])}


class VotingService:
    def __init__(
        self,
        repository: Repository,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        generate_code: Callable[[], str] | None = None,
    ) -> None:
        self.repo = repository
        self.now = now
        self.generate_code = generate_code or (
            lambda: "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        )

    # --- helpers --------------------------------------------------------------------

    def _me(self, user_id: str) -> Item:
        user = self.repo.get_user(user_id) if user_id else None
        if user is None:
            raise ApiError(401, "Debes iniciar sesion.")
        return user

    def _require_admin(self, user_id: str, message: str) -> Item:
        user = self._me(user_id)
        if user.get("role") != "admin":
            raise ApiError(403, message)
        return user

    def _status(self, election: Item) -> str:
        return election_status(election["closesAt"], self.now())

    def _find_election(self, code: str) -> Item:
        election = self.repo.get_election(normalize_election_code(code))
        if election is None:
            raise ApiError(404, "No existe una votacion con ese identificador.")
        return self._ensure_snapshot(election)

    def _ensure_snapshot(self, election: Item) -> Item:
        """Toma la foto si la votacion cerro y aun no la tiene (respaldo del proceso programado)."""
        if self._status(election) == "open" or "snapshotTakenAt" in election:
            return election
        self.take_snapshot(election)
        return self.repo.get_election(election["code"]) or election

    def _find_category(self, category_id: str) -> Item:
        category = self.repo.get_category(category_id)
        if category is None:
            raise ApiError(404, "La categoria no existe.")
        return category

    def _find_nominee(self, nominee_id: str) -> Item:
        nominee = self.repo.get_nominee(nominee_id)
        if nominee is None:
            raise ApiError(404, "El nominado no existe.")
        return nominee

    def _summary(self, election: Item, user_id: str, members: list[str] | None = None) -> Item:
        members = self.repo.list_member_ids(election["code"]) if members is None else members
        return {
            "code": election["code"],
            "name": election["name"],
            "closesAt": election["closesAt"],
            "status": self._status(election),
            "categoryIds": list(election["categoryIds"]),
            "memberCount": len(members),
            "isMember": user_id in members,
            "isAdmin": user_id in election["adminIds"],
        }

    def _categories_with_nominees(self, category_ids: list[str]) -> list[Item]:
        nominees = self.repo.list_nominees()
        result = []
        for category_id in category_ids:
            category = self.repo.get_category(category_id)
            if category is None:
                continue
            result.append(
                {
                    **category,
                    "nominees": [
                        _public_nominee(n) for n in nominees if n["categoryId"] == category_id
                    ],
                }
            )
        return result

    def _catalog_entry(self, category_id: str, elections: list[Item] | None = None) -> Item:
        elections = self.repo.list_elections() if elections is None else elections
        [category] = self._categories_with_nominees([category_id])
        used = sum(1 for e in elections if category_id in e["categoryIds"])
        return {**category, "usedInElections": used, "locked": used > 0}

    def _require_unlocked(self, category_id: str, action: str) -> None:
        if is_category_locked(category_id, self.repo.list_elections()):
            raise ApiError(409, f"La categoria ya se usa en una votacion: no se puede {action}.")

    # --- fotos de cierre ------------------------------------------------------------

    def take_snapshot(self, election: Item) -> bool:
        members = self.repo.list_member_ids(election["code"])
        answers = self.repo.latest_answers_before(
            members, list(election["categoryIds"]), election["closesAt"]
        )
        taken = self.repo.save_snapshot(election["code"], to_iso(self.now()), answers)
        if taken:
            logger.info(
                "Foto de cierre tomada",
                extra={
                    "action": "snapshot.taken",
                    "electionCode": election["code"],
                    "members": len(members),
                    "answers": len(answers),
                },
            )
        return taken

    def take_pending_snapshots(self) -> int:
        taken = 0
        for election in self.repo.list_elections():
            if self._status(election) == "closed" and "snapshotTakenAt" not in election:
                taken += int(self.take_snapshot(election))
        return taken

    # --- usuarios -------------------------------------------------------------------

    def get_me(self, user_id: str) -> Item:
        return self._me(user_id)

    def list_users(self) -> list[Item]:
        return sorted(self.repo.list_users(), key=lambda u: u["id"])

    def create_user(self, admin_id: str, data: Item) -> Item:
        """Alta de votante o administrador hasta integrar Cognito (luego el id sera el sub)."""
        self._require_admin(admin_id, USERS_ADMIN_MESSAGE)
        error = validate_new_user(data)
        if error:
            raise ApiError(400, error)

        user = {"displayName": data["displayName"].strip(), "role": data["role"]}
        if data.get("id") is not None:
            user["id"] = data["id"]
            if not self.repo.create_user(user):
                raise ApiError(409, "Ya existe un usuario con ese id.")
        else:
            taken = {u["id"] for u in self.repo.list_users()}
            for _ in range(5):
                user["id"] = slug_id(f"u-{user['displayName']}", taken)
                if self.repo.create_user(user):
                    break
                taken.add(user["id"])  # otro administrador lo creo al mismo tiempo
            else:
                raise ApiError(503, "No se pudo generar un id unico; intenta de nuevo.")

        logger.info(
            "Usuario creado",
            extra={"action": "user.created", "createdUserId": user["id"], "role": user["role"]},
        )
        return user

    # --- votaciones -----------------------------------------------------------------

    def list_my_elections(self, user_id: str) -> list[Item]:
        self._me(user_id)
        member_codes = set(self.repo.list_member_codes(user_id))
        mine = [
            self._ensure_snapshot(e)
            for e in self.repo.list_elections()
            if e["code"] in member_codes or user_id in e["adminIds"]
        ]
        summaries = [self._summary(e, user_id) for e in mine]
        # Abiertas primero; dentro de cada grupo, por fecha de cierre
        return sorted(summaries, key=lambda s: (s["status"] != "open", s["closesAt"]))

    def preview_election(self, user_id: str, code: str) -> Item:
        self._me(user_id)
        election = self._find_election(code)
        return {
            "code": election["code"],
            "name": election["name"],
            "closesAt": election["closesAt"],
            "status": self._status(election),
            "categoryCount": len(election["categoryIds"]),
        }

    def join_election(self, user_id: str, code: str) -> Item:
        self._me(user_id)
        election = self._find_election(code)
        members = self.repo.list_member_ids(election["code"])
        if user_id in members:
            return self._summary(election, user_id, members)
        if self._status(election) == "closed":
            raise ApiError(409, "La votacion ya cerro; no se puede unir.")
        self.repo.add_membership(election["code"], user_id, to_iso(self.now()))
        logger.info(
            "Usuario unido a votacion",
            extra={"action": "membership.joined", "electionCode": election["code"]},
        )
        return self._summary(election, user_id)

    def leave_election(self, user_id: str, code: str) -> Item | None:
        self._me(user_id)
        election = self._find_election(code)
        if user_id not in self.repo.list_member_ids(election["code"]):
            raise ApiError(409, "No participas en esta votacion.")
        if self._status(election) == "closed":
            raise ApiError(409, "La votacion ya cerro; tus respuestas quedaron registradas.")
        # Las respuestas se conservan: son compartidas con las otras votaciones del usuario
        self.repo.remove_membership(election["code"], user_id)
        logger.info(
            "Usuario abandono votacion",
            extra={"action": "membership.left", "electionCode": election["code"]},
        )
        return self._summary(election, user_id) if user_id in election["adminIds"] else None

    def get_election(self, user_id: str, code: str) -> Item:
        self._me(user_id)
        election = self._find_election(code)
        members = self.repo.list_member_ids(election["code"])
        if user_id not in members and user_id not in election["adminIds"]:
            raise ApiError(403, "Debes unirte a la votacion para verla.")

        category_ids = set(election["categoryIds"])
        if self._status(election) == "closed":
            source = self.repo.get_snapshot_answers(election["code"])
        else:
            source = self.repo.list_current_answers(user_id)
        my_answers = [
            a for a in source if a["userId"] == user_id and a["categoryId"] in category_ids
        ]

        return {
            **self._summary(election, user_id, members),
            "categories": self._categories_with_nominees(list(election["categoryIds"])),
            "myAnswers": my_answers,
        }

    def create_election(self, user_id: str, data: Item) -> Item:
        self._require_admin(user_id, "Solo los administradores pueden crear votaciones.")
        errors = validate_new_election(
            data, self.repo.list_categories(), self.repo.list_nominees(), self.now()
        )
        if errors:
            raise ApiError(400, " ".join(errors))

        election = {
            "name": data["name"].strip(),
            "closesAt": normalize_iso(data["closesAt"]),
            "categoryIds": list(dict.fromkeys(data["categoryIds"])),
            "adminIds": [user_id],
            "createdAt": to_iso(self.now()),
        }
        for _ in range(10):
            election["code"] = self.generate_code()
            if self.repo.create_election(election):
                logger.info(
                    "Votacion creada",
                    extra={
                        "action": "election.created",
                        "electionCode": election["code"],
                        "categories": len(election["categoryIds"]),
                        "closesAt": election["closesAt"],
                    },
                )
                return self._summary(election, user_id, [])
        raise ApiError(503, "No se pudo generar un identificador unico; intenta de nuevo.")

    # --- respuestas -----------------------------------------------------------------

    def get_my_answers(self, user_id: str) -> list[Item]:
        self._me(user_id)
        return self.repo.list_current_answers(user_id)

    def save_answer(self, user_id: str, category_id: str, choice: Item) -> Item:
        self._me(user_id)
        category = self._find_category(category_id)
        error = validate_answer_choice(category, self.repo.list_nominees(category_id), choice)
        if error:
            raise ApiError(400, error)

        member_codes = set(self.repo.list_member_codes(user_id))
        open_elections = [
            e["code"]
            for e in self.repo.list_elections()
            if e["code"] in member_codes
            and self._status(e) == "open"
            and category_id in e["categoryIds"]
        ]
        if not open_elections:
            raise ApiError(
                403, "No participas en ninguna votacion abierta que incluya esta categoria."
            )

        answer = {
            **_choice(choice),
            "userId": user_id,
            "categoryId": category_id,
            "updatedAt": to_iso(self.now()),
        }
        self.repo.save_answer(answer)
        logger.info(
            "Respuesta guardada",
            extra={
                "action": "answer.saved",
                "categoryId": category_id,
                "openElections": open_elections,
            },
        )
        return answer

    def get_results(self, user_id: str, code: str) -> Item:
        self._me(user_id)
        election = self._find_election(code)
        if user_id not in election["adminIds"]:
            raise ApiError(
                403, "Solo los administradores de la votacion pueden ver los resultados."
            )

        members = self.repo.list_member_ids(election["code"])
        category_ids = set(election["categoryIds"])
        snapshot_taken_at = election.get("snapshotTakenAt")
        if snapshot_taken_at:
            answers = self.repo.get_snapshot_answers(election["code"])
        else:
            answers = [
                a
                for member in members
                for a in self.repo.list_current_answers(member)
                if a["categoryId"] in category_ids
            ]

        categories = self._categories_with_nominees(list(election["categoryIds"]))
        nominees = [n for c in categories for n in c["nominees"]]
        result: Item = {
            "code": election["code"],
            "name": election["name"],
            "status": self._status(election),
            "closesAt": election["closesAt"],
            "memberCount": len(members),
            "categories": categories,
            "results": tally_election(categories, nominees, answers),
        }
        if snapshot_taken_at:
            result["snapshotTakenAt"] = snapshot_taken_at
        logger.info(
            "Resultados consultados",
            extra={"action": "results.viewed", "electionCode": election["code"]},
        )
        return result

    # --- catalogo -------------------------------------------------------------------

    def list_catalog(self, user_id: str) -> list[Item]:
        self._require_admin(user_id, CATALOG_ADMIN_MESSAGE)
        elections = self.repo.list_elections()
        return [self._catalog_entry(c["id"], elections) for c in self.repo.list_categories()]

    def _new_nominees(self, category_id: str, items: list[Item]) -> list[Item]:
        """Valida el lote completo y arma los registros; no escribe nada."""
        nominees = self.repo.list_nominees()
        error = validate_new_nominees(category_id, items, nominees)
        if error:
            raise ApiError(400, error)
        taken = {n["id"] for n in nominees}
        # Los nominados se ordenan por createdAt (GSI byCategory): cada uno nuevo va un
        # milisegundo despues del anterior, y el primero despues del ultimo de la categoria
        start = self.now()
        existing = [parse_iso(n["createdAt"]) for n in nominees if n["categoryId"] == category_id]
        if existing:
            start = max(start, max(existing) + timedelta(milliseconds=1))
        records = []
        for position, item in enumerate(items):
            nominee_id = slug_id(f"{category_id}-{item['name']}", taken)
            taken.add(nominee_id)
            records.append(
                {
                    "id": nominee_id,
                    "categoryId": category_id,
                    **_clean_nominee(item),
                    "createdAt": to_iso(start + timedelta(milliseconds=position)),
                }
            )
        return records

    def _save_nominees(self, category_id: str, records: list[Item]) -> None:
        for record in records:
            self.repo.put_nominee(record)
        if records:
            logger.info(
                "Nominados agregados",
                extra={
                    "action": "nominee.created",
                    "categoryId": category_id,
                    "nomineeIds": [r["id"] for r in records],
                },
            )

    def create_category(self, user_id: str, data: Item) -> Item:
        """Crea la categoria y, si vienen, sus nominados (data["nominees"], opcional)."""
        self._require_admin(user_id, CATALOG_ADMIN_MESSAGE)
        catalog = self.repo.list_categories()
        error = validate_category_name(data["name"], catalog)
        if error:
            raise ApiError(400, error)
        if data["votingMethod"] not in VOTING_METHODS:
            raise ApiError(400, "El metodo de votacion no es valido.")
        category_id = slug_id(data["name"], {c["id"] for c in catalog})
        # Se valida todo antes de escribir, para no dejar una categoria a medias
        records = self._new_nominees(category_id, data.get("nominees") or [])
        self.repo.put_category(
            {"id": category_id, "name": data["name"].strip(), "votingMethod": data["votingMethod"]}
        )
        logger.info(
            "Categoria creada",
            extra={
                "action": "category.created",
                "categoryId": category_id,
                "nominees": len(records),
            },
        )
        self._save_nominees(category_id, records)
        return self._catalog_entry(category_id)

    def update_category(self, user_id: str, category_id: str, data: Item) -> Item:
        self._require_admin(user_id, CATALOG_ADMIN_MESSAGE)
        category = self._find_category(category_id)
        error = validate_category_name(data["name"], self.repo.list_categories(), category_id)
        if error:
            raise ApiError(400, error)
        if data["votingMethod"] not in VOTING_METHODS:
            raise ApiError(400, "El metodo de votacion no es valido.")
        if data["votingMethod"] != category["votingMethod"]:
            self._require_unlocked(category_id, "cambiar su metodo de votacion")
        self.repo.put_category(
            {**category, "name": data["name"].strip(), "votingMethod": data["votingMethod"]}
        )
        logger.info(
            "Categoria editada", extra={"action": "category.updated", "categoryId": category_id}
        )
        return self._catalog_entry(category_id)

    def delete_category(self, user_id: str, category_id: str) -> None:
        self._require_admin(user_id, CATALOG_ADMIN_MESSAGE)
        self._find_category(category_id)
        self._require_unlocked(category_id, "eliminar")
        self.repo.delete_category(category_id)
        logger.info(
            "Categoria eliminada", extra={"action": "category.deleted", "categoryId": category_id}
        )

    def add_nominee(self, user_id: str, category_id: str, data: Item) -> Item:
        return self.add_nominees(user_id, category_id, [data])

    def add_nominees(self, user_id: str, category_id: str, items: list[Item]) -> Item:
        """Asigna uno o varios nominados nuevos a una categoria; todos o ninguno."""
        self._require_admin(user_id, CATALOG_ADMIN_MESSAGE)
        self._find_category(category_id)
        self._require_unlocked(category_id, "agregar nominados")
        if not items:
            raise ApiError(400, "Indica al menos un nominado.")
        self._save_nominees(category_id, self._new_nominees(category_id, items))
        return self._catalog_entry(category_id)

    def update_nominee(self, user_id: str, nominee_id: str, data: Item) -> Item:
        self._require_admin(user_id, CATALOG_ADMIN_MESSAGE)
        nominee = self._find_nominee(nominee_id)
        error = validate_nominee_name(
            data["name"], nominee["categoryId"], self.repo.list_nominees(), nominee_id
        )
        if error:
            raise ApiError(400, error)
        updated = {
            "id": nominee["id"],
            "categoryId": nominee["categoryId"],
            "createdAt": nominee["createdAt"],
            **_clean_nominee(data),
        }
        self.repo.put_nominee(updated)
        logger.info(
            "Nominado editado", extra={"action": "nominee.updated", "nomineeId": nominee_id}
        )
        return self._catalog_entry(nominee["categoryId"])


def _clean_nominee(data: Item) -> dict[str, Any]:
    description = (data.get("description") or "").strip()
    return {"name": data["name"].strip(), **({"description": description} if description else {})}
