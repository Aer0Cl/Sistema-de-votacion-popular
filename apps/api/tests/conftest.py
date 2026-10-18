from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import boto3
import pytest
from moto import mock_aws

from votacion_api.domain.clock import to_iso
from votacion_api.repository.dynamo import DynamoRepository
from votacion_api.repository.memory import MemoryRepository
from votacion_api.service import VotingService

START = datetime(2027, 2, 1, tzinfo=UTC)
DAY = timedelta(days=1)

# Mismo esquema de claves que infra/cdk/lib/data-stack.ts
TABLES = {
    "users": {"keys": [("id", "HASH")]},
    "categories": {"keys": [("id", "HASH")]},
    "nominees": {
        "keys": [("id", "HASH")],
        "gsi": {"byCategory": [("categoryId", "HASH"), ("createdAt", "RANGE")]},
    },
    "elections": {"keys": [("code", "HASH")]},
    "memberships": {
        "keys": [("electionCode", "HASH"), ("userId", "RANGE")],
        "gsi": {"byUser": [("userId", "HASH"), ("electionCode", "RANGE")]},
    },
    "answers": {"keys": [("userId", "HASH"), ("categoryId", "RANGE")]},
    "answerHistory": {"keys": [("userCategory", "HASH"), ("version", "RANGE")]},
    "snapshots": {"keys": [("electionCode", "HASH"), ("userCategory", "RANGE")]},
}


def create_tables(resource) -> dict[str, str]:
    names = {}
    for kind, spec in TABLES.items():
        name = f"votacion-test-{kind}"
        indexes = spec.get("gsi", {})
        attributes = {attr for attr, _ in spec["keys"]}
        for keys in indexes.values():
            attributes |= {attr for attr, _ in keys}
        options = {}
        if indexes:
            options["GlobalSecondaryIndexes"] = [
                {
                    "IndexName": index,
                    "KeySchema": [{"AttributeName": a, "KeyType": t} for a, t in keys],
                    "Projection": {"ProjectionType": "ALL"},
                }
                for index, keys in indexes.items()
            ]
        resource.create_table(
            TableName=name,
            BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": a, "KeyType": t} for a, t in spec["keys"]],
            AttributeDefinitions=[{"AttributeName": a, "AttributeType": "S"} for a in attributes],
            **options,
        )
        names[kind] = name
    return names


class Clock:
    def __init__(self, start: datetime = START) -> None:
        self.current = start

    def __call__(self) -> datetime:
        return self.current

    def advance(self, days: float) -> None:
        self.current += DAY * days


@pytest.fixture(params=["memory", "dynamo"])
def repo(request, monkeypatch) -> Iterator:
    if request.param == "memory":
        yield MemoryRepository()
        return
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    with mock_aws():
        resource = boto3.resource("dynamodb", region_name="us-east-1")
        yield DynamoRepository(create_tables(resource), resource)


def seed(repo) -> None:
    """Catalogo minimo y dos votaciones: A cierra el dia 10, B el dia 20."""
    repo_users = [
        {"id": "admin", "displayName": "Admin", "role": "admin"},
        {"id": "ana", "displayName": "Ana", "role": "voter"},
        {"id": "beto", "displayName": "Beto", "role": "voter"},
    ]
    categories = [
        {"id": "pelicula", "name": "Mejor pelicula", "votingMethod": "ranked", "year": 2027},
        {"id": "actor", "name": "Mejor actor", "votingMethod": "plurality", "year": 2027},
        {"id": "actriz", "name": "Mejor actriz", "votingMethod": "plurality", "year": 2027},
    ]
    nominees = [
        ("p1", "pelicula"),
        ("p2", "pelicula"),
        ("p3", "pelicula"),
        ("a1", "actor"),
        ("a2", "actor"),
        ("x1", "actriz"),
        ("x2", "actriz"),
    ]
    for user in repo_users:
        repo.put_user(user)
    for category in categories:
        repo.put_category(category)
    for position, (nominee_id, category_id) in enumerate(nominees):
        repo.put_nominee(
            {
                "id": nominee_id,
                "categoryId": category_id,
                "name": nominee_id,
                "createdAt": to_iso(START + timedelta(milliseconds=position)),
            }
        )
    for code, closes_in, category_ids in [
        ("AAAAAA", 10, ["pelicula", "actor"]),
        ("BBBBBB", 20, ["pelicula", "actriz"]),
    ]:
        repo.create_election(
            {
                "code": code,
                "name": code,
                "closesAt": to_iso(START + DAY * closes_in),
                "categoryIds": category_ids,
                "adminIds": ["admin"],
                "createdAt": to_iso(START),
            }
        )


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def service(repo, clock) -> VotingService:
    seed(repo)
    return VotingService(repo, now=clock)
