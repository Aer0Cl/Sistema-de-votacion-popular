"""Algoritmos de conteo. Port de packages/voting-core (plurality.ts, instantRunoff.ts).

Los resultados usan las mismas claves camelCase que el front para serializarse tal cual.
"""

from collections.abc import Callable, Iterable, Sequence
from typing import Any


def tally_plurality(nominees: Iterable[str], ballots: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Mayoria simple; un empate en el primer lugar da varios ganadores."""
    tally = dict.fromkeys(dict.fromkeys(nominees), 0)
    total = 0
    invalid = 0
    for ballot in ballots:
        total += 1
        nominee = ballot.get("nomineeId")
        if nominee in tally:
            tally[nominee] += 1
        else:
            invalid += 1

    max_votes = max(tally.values(), default=0)
    winners = [] if max_votes == 0 else [n for n, votes in tally.items() if votes == max_votes]
    return {"totalBallots": total, "invalidBallots": invalid, "tally": tally, "winners": winners}


def tally_instant_runoff(
    nominees: Iterable[str], ballots: Sequence[dict[str, Any]]
) -> dict[str, Any]:
    """Segunda vuelta instantanea.

    Cada papeleta cuenta para su preferencia mas alta que siga en carrera. Gana quien supere
    el 50% de las papeletas activas; si nadie lo logra se elimina al de menos votos.
    Desempate para el ultimo lugar: rondas anteriores (hacia atras), luego menciones totales,
    luego el id mayor. Si todos los que quedan empatan, son co-ganadores.
    """
    remaining = list(dict.fromkeys(nominees))
    candidates = set(remaining)
    # Copia sin desconocidos ni repetidos; las papeletas originales no se modifican
    preferences = [
        list(dict.fromkeys(n for n in ballot.get("ranking", []) if n in candidates))
        for ballot in ballots
    ]

    rounds: list[dict[str, Any]] = []
    winners: list[str] = []

    while remaining:
        tally = dict.fromkeys(remaining, 0)
        exhausted = 0
        for ranking in preferences:
            choice = next((n for n in ranking if n in tally), None)
            if choice is None:
                exhausted += 1
            else:
                tally[choice] += 1

        active = len(preferences) - exhausted
        current: dict[str, Any] = {
            "round": len(rounds) + 1,
            "tally": tally,
            "activeBallots": active,
            "exhaustedBallots": exhausted,
            "eliminated": [],
        }
        rounds.append(current)

        if active == 0:
            break

        max_votes = max(tally.values())
        min_votes = min(tally.values())
        if max_votes * 2 > active:
            winners = [n for n in remaining if tally[n] == max_votes]
            break
        if max_votes == min_votes:
            winners = list(remaining)
            break

        lowest = [n for n in remaining if tally[n] == min_votes]
        eliminated, rule = _break_tie_for_last(lowest, rounds, preferences)
        current["eliminated"] = [eliminated]
        if rule:
            current["tieBreak"] = rule
        remaining.remove(eliminated)

    return {"totalBallots": len(ballots), "winners": winners, "rounds": rounds}


def _break_tie_for_last(
    tied: list[str], rounds: list[dict[str, Any]], preferences: list[list[str]]
) -> tuple[str, str | None]:
    if len(tied) == 1:
        return tied[0], None

    pending = tied
    # La ronda actual es la ultima; se compara desde la anterior hacia atras
    for index in range(len(rounds) - 2, -1, -1):
        if len(pending) == 1:
            break
        previous = rounds[index]["tally"]
        pending = _keep_lowest(pending, lambda n, tally=previous: tally.get(n, 0))
    if len(pending) == 1:
        return pending[0], "previous-rounds"

    pending = _keep_lowest(pending, lambda n: sum(1 for ranking in preferences if n in ranking))
    if len(pending) == 1:
        return pending[0], "total-mentions"

    return sorted(pending, reverse=True)[0], "id-order"


def _keep_lowest(nominees: list[str], score: Callable[[str], int]) -> list[str]:
    lowest = min(score(n) for n in nominees)
    return [n for n in nominees if score(n) == lowest]
