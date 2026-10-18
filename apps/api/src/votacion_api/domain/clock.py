"""Fechas en ISO 8601 UTC con milisegundos ("2027-03-01T00:00:00.000Z").

Todas las fechas se guardan con este formato: asi se pueden comparar como texto, que es
lo que hacen las claves de ordenamiento de DynamoDB.
"""

from datetime import UTC, datetime


def to_iso(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    """Acepta cualquier ISO 8601 con zona; lanza ValueError si no es valido."""
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("La fecha debe incluir zona horaria.")
    return parsed


def normalize_iso(value: str) -> str:
    return to_iso(parse_iso(value))
