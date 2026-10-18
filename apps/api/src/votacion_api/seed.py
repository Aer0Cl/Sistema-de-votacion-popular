"""Carga inicial: catalogo de docs/Categorias Oscar.txt y usuarios de prueba.

Uso (con credenciales de AWS de la cuenta destino):
    uv run python -m votacion_api.seed --stage dev [--region us-east-1]

Es idempotente: no sobrescribe categorias, nominados ni usuarios que ya existan, asi que
no pisa lo que los administradores hayan editado.
"""

import argparse
import sys
from datetime import UTC, datetime, timedelta

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

from .domain.clock import to_iso

CATEGORIES = [
    ("mejor-pelicula", "Mejor película"),
    ("mejor-direccion", "Mejor dirección"),
    ("mejor-actor", "Mejor actor"),
    ("mejor-actriz", "Mejor actriz"),
    ("mejor-actor-reparto", "Mejor actor de reparto"),
    ("mejor-actriz-reparto", "Mejor actriz de reparto"),
    ("mejor-guion-original", "Mejor guion original"),
    ("mejor-guion-adaptado", "Mejor guion adaptado"),
    ("mejor-pelicula-animacion", "Mejor película de animación"),
    ("mejor-pelicula-internacional", "Mejor película internacional"),
    ("mejor-casting", "Mejor dirección de casting"),
    ("mejor-documental", "Mejor documental"),
    ("mejor-corto-documental", "Mejor cortometraje documental"),
    ("mejor-corto-accion-real", "Mejor cortometraje de acción real"),
    ("mejor-corto-animacion", "Mejor cortometraje de animación"),
    ("mejor-banda-sonora", "Mejor banda sonora original"),
    ("mejor-cancion", "Mejor canción original"),
    ("mejor-sonido", "Mejor sonido"),
    ("mejor-diseno-produccion", "Mejor diseño de producción"),
    ("mejor-fotografia", "Mejor fotografía"),
    ("mejor-maquillaje", "Mejor maquillaje y peluquería"),
    ("mejor-vestuario", "Mejor diseño de vestuario"),
    ("mejor-montaje", "Mejor montaje / edición"),
    ("mejores-efectos-visuales", "Mejores efectos visuales"),
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


def seed_items(now: datetime) -> dict[str, list[dict[str, str]]]:
    categories = []
    nominees = []
    for index, (category_id, name) in enumerate(CATEGORIES):
        method = "ranked" if category_id == "mejor-pelicula" else "plurality"
        categories.append({"id": category_id, "name": name, "votingMethod": method})
        names = BEST_PICTURE if method == "ranked" else [f"Nominado {n}" for n in range(1, 6)]
        for position, nominee_name in enumerate(names):
            # createdAt creciente para conservar el orden de los nominados
            created_at = now + timedelta(milliseconds=index * 10 + position)
            nominees.append(
                {
                    "id": f"{category_id}-{position + 1}",
                    "categoryId": category_id,
                    "name": nominee_name,
                    "createdAt": to_iso(created_at),
                }
            )
    return {"categories": categories, "nominees": nominees, "users": DEV_USERS}


def put_if_absent(table, item: dict[str, str]) -> bool:
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
