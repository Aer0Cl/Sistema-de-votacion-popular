"""Carga inicial: catalogo de docs/Categorias Oscar.txt y usuarios de prueba.

Uso (con credenciales de AWS de la cuenta destino):
    uv run python -m votacion_api.seed --stage dev [--region us-east-1]

Es idempotente: no sobrescribe categorias, nominados ni usuarios que ya existan, asi que
no pisa lo que los administradores hayan editado.
"""

import argparse
import sys
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

from .domain.clock import to_iso
from .domain.rules import category_id

# Edicion 2026 (incluye la nueva categoria de casting). Los ids combinan nombre y año, igual
# que los que genera la API: "mejor-pelicula-2026"
SEED_YEAR = 2026
BEST_PICTURE_CATEGORY = "Mejor película"

CATEGORIES = [
    "Mejor película",
    "Mejor dirección",
    "Mejor actor",
    "Mejor actriz",
    "Mejor actor de reparto",
    "Mejor actriz de reparto",
    "Mejor guion original",
    "Mejor guion adaptado",
    "Mejor película de animación",
    "Mejor película internacional",
    "Mejor dirección de casting",
    "Mejor documental",
    "Mejor cortometraje documental",
    "Mejor cortometraje de acción real",
    "Mejor cortometraje de animación",
    "Mejor banda sonora original",
    "Mejor canción original",
    "Mejor sonido",
    "Mejor diseño de producción",
    "Mejor fotografía",
    "Mejor maquillaje y peluquería",
    "Mejor diseño de vestuario",
    "Mejor montaje / edición",
    "Mejores efectos visuales",
]

BEST_PICTURE = [
    "The Shawshank Redemption",
    "The Godfather",
    "The Dark Knight",
    "Pulp Fiction",
    "Parasite",
]

# Usuarios de prueba hasta integrar Cognito (solo stage dev)
DEV_USERS = [
    {"id": "u-alice", "displayName": "Alice (admin)", "role": "admin"},
    {"id": "u-bob", "displayName": "Bob", "role": "voter"},
    {"id": "u-carla", "displayName": "Carla", "role": "voter"},
    {"id": "u-diego", "displayName": "Diego", "role": "voter"},
]


def seed_items(now: datetime) -> dict[str, list[dict[str, Any]]]:
    categories = []
    nominees = []
    taken: set[str] = set()
    for index, name in enumerate(CATEGORIES):
        new_id = category_id(name, SEED_YEAR, taken)
        taken.add(new_id)
        method = "ranked" if name == BEST_PICTURE_CATEGORY else "plurality"
        categories.append({"id": new_id, "name": name, "votingMethod": method, "year": SEED_YEAR})
        names = BEST_PICTURE if method == "ranked" else [f"Nominado {n}" for n in range(1, 6)]
        for position, nominee_name in enumerate(names):
            # createdAt creciente para conservar el orden de los nominados
            created_at = now + timedelta(milliseconds=index * 10 + position)
            nominees.append(
                {
                    "id": f"{new_id}-{position + 1}",
                    "categoryId": new_id,
                    "name": nominee_name,
                    "createdAt": to_iso(created_at),
                }
            )
    return {"categories": categories, "nominees": nominees, "users": DEV_USERS}


def put_if_absent(table, item: dict[str, Any]) -> bool:
    try:
        table.put_item(Item=item, ConditionExpression=Attr("id").not_exists())
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        return False
    return True


def seed(stage: str, region: str | None) -> dict[str, int]:
    resource = boto3.resource("dynamodb", region_name=region)
    items = seed_items(datetime.now(UTC))
    created = {}
    for kind, rows in items.items():
        table = resource.Table(f"votacion-{stage}-{kind}")
        created[kind] = sum(put_if_absent(table, row) for row in rows)
    return created


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", default="dev")
    parser.add_argument("--region", default=None)
    args = parser.parse_args()

    try:
        created = seed(args.stage, args.region)
    except ClientError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    for kind, count in created.items():
        print(f"{kind}: {count} nuevos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
