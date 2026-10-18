"""Repositorio sobre DynamoDB. Los nombres de tabla llegan por variables de entorno (CDK).

Claves (ver infra/cdk/lib/data-stack.ts):
  users          id
  categories     id
  nominees       id                    GSI byCategory: categoryId + createdAt
  elections      code
  memberships    electionCode + userId GSI byUser: userId + electionCode
  answers        userId + categoryId   respuesta actual
  answerHistory  userCategory + version  cada guardado ("<updatedAt>#<sufijo>")
  snapshots      electionCode + userCategory  foto de cierre
"""

import os
import secrets
from collections.abc import Iterator, Mapping
from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr, Key

from . import Item

# Atributos que solo existen para las claves y no forman parte de la respuesta
_ANSWER_KEY_FIELDS = ("userCategory", "version", "electionCode")


def _user_category(user_id: str, category_id: str) -> str:
    return f"{user_id}#{category_id}"


def _clean_answer(item: Item) -> Item:
    return {k: v for k, v in item.items() if k not in _ANSWER_KEY_FIELDS}


class DynamoRepository:
    def __init__(self, table_names: Mapping[str, str], resource: Any | None = None) -> None:
        self._resource = resource or boto3.resource("dynamodb")
        self._client = self._resource.meta.client
        self._names = dict(table_names)
        self._tables = {key: self._resource.Table(name) for key, name in self._names.items()}

    @classmethod
    def from_environment(cls) -> "DynamoRepository":
        return cls(
            {
                "users": os.environ["USERS_TABLE"],
                "categories": os.environ["CATEGORIES_TABLE"],
                "nominees": os.environ["NOMINEES_TABLE"],
                "elections": os.environ["ELECTIONS_TABLE"],
                "memberships": os.environ["MEMBERSHIPS_TABLE"],
                "answers": os.environ["ANSWERS_TABLE"],
                "answerHistory": os.environ["ANSWER_HISTORY_TABLE"],
                "snapshots": os.environ["SNAPSHOTS_TABLE"],
            }
        )

    def _items(self, operation: str, table: str, **kwargs: Any) -> Iterator[Item]:
        paginator = self._client.get_paginator(operation)
        for page in paginator.paginate(TableName=self._names[table], **kwargs):
            yield from page["Items"]

    # Usuarios ------------------------------------------------------------------------

    def get_user(self, user_id: str) -> Item | None:
        return self._tables["users"].get_item(Key={"id": user_id}).get("Item")

    def list_users(self) -> list[Item]:
        return list(self._items("scan", "users"))

    def put_user(self, user: Item) -> None:
        self._tables["users"].put_item(Item=user)

    # Catalogo ------------------------------------------------------------------------

    def list_categories(self) -> list[Item]:
        return list(self._items("scan", "categories"))

    def get_category(self, category_id: str) -> Item | None:
        return self._tables["categories"].get_item(Key={"id": category_id}).get("Item")

    def put_category(self, category: Item) -> None:
        self._tables["categories"].put_item(Item=category)

    def delete_category(self, category_id: str) -> None:
        nominees = self.list_nominees(category_id)
        with self._tables["nominees"].batch_writer() as batch:
            for nominee in nominees:
                batch.delete_item(Key={"id": nominee["id"]})
        self._tables["categories"].delete_item(Key={"id": category_id})

    def list_nominees(self, category_id: str | None = None) -> list[Item]:
        if category_id is None:
            nominees = list(self._items("scan", "nominees"))
            return sorted(nominees, key=lambda n: n["createdAt"])
        return list(
            self._items(
                "query",
                "nominees",
                IndexName="byCategory",
                KeyConditionExpression=Key("categoryId").eq(category_id),
            )
        )

    def get_nominee(self, nominee_id: str) -> Item | None:
        return self._tables["nominees"].get_item(Key={"id": nominee_id}).get("Item")

    def put_nominee(self, nominee: Item) -> None:
        self._tables["nominees"].put_item(Item=nominee)

    # Votaciones ----------------------------------------------------------------------

    def list_elections(self) -> list[Item]:
        return list(self._items("scan", "elections"))

    def get_election(self, code: str) -> Item | None:
        return self._tables["elections"].get_item(Key={"code": code}).get("Item")

    def create_election(self, election: Item) -> bool:
        table = self._tables["elections"]
        try:
            table.put_item(Item=election, ConditionExpression=Attr("code").not_exists())
        except table.meta.client.exceptions.ConditionalCheckFailedException:
            return False
        return True

    def list_member_ids(self, code: str) -> list[str]:
        return [
            item["userId"]
            for item in self._items(
                "query", "memberships", KeyConditionExpression=Key("electionCode").eq(code)
            )
        ]

    def list_member_codes(self, user_id: str) -> list[str]:
        return [
            item["electionCode"]
            for item in self._items(
                "query",
                "memberships",
                IndexName="byUser",
                KeyConditionExpression=Key("userId").eq(user_id),
            )
        ]

    def add_membership(self, code: str, user_id: str, joined_at: str) -> None:
        self._tables["memberships"].put_item(
            Item={"electionCode": code, "userId": user_id, "joinedAt": joined_at}
        )

    def remove_membership(self, code: str, user_id: str) -> None:
        self._tables["memberships"].delete_item(Key={"electionCode": code, "userId": user_id})

    # Respuestas ----------------------------------------------------------------------

    def list_current_answers(self, user_id: str) -> list[Item]:
        return list(
            self._items("query", "answers", KeyConditionExpression=Key("userId").eq(user_id))
        )

    def save_answer(self, answer: Item) -> None:
        version = {
            **answer,
            "userCategory": _user_category(answer["userId"], answer["categoryId"]),
            # El sufijo evita choques si dos guardados caen en el mismo milisegundo
            "version": f"{answer['updatedAt']}#{secrets.token_hex(4)}",
        }
        self._client.transact_write_items(
            TransactItems=[
                {"Put": {"TableName": self._names["answers"], "Item": answer}},
                {"Put": {"TableName": self._names["answerHistory"], "Item": version}},
            ]
        )

    def latest_answers_before(
        self, user_ids: list[str], category_ids: list[str], before: str
    ) -> list[Item]:
        # "<before>" < "<before>#sufijo": las versiones guardadas justo al cierre quedan fuera
        table = self._tables["answerHistory"]
        answers = []
        for user_id in user_ids:
            for category_id in category_ids:
                items = table.query(
                    KeyConditionExpression=Key("userCategory").eq(
                        _user_category(user_id, category_id)
                    )
                    & Key("version").lt(before),
                    ScanIndexForward=False,
                    Limit=1,
                )["Items"]
                answers.extend(_clean_answer(item) for item in items)
        return answers

    # Fotos de cierre -----------------------------------------------------------------

    def save_snapshot(self, code: str, taken_at: str, answers: list[Item]) -> bool:
        elections = self._tables["elections"]
        if "snapshotTakenAt" in (self.get_election(code) or {}):
            return False
        # Primero las respuestas y despues la marca: si algo falla a mitad, se reintenta
        # completo y las escrituras son idempotentes.
        with self._tables["snapshots"].batch_writer() as batch:
            for answer in answers:
                batch.put_item(
                    Item={
                        **answer,
                        "electionCode": code,
                        "userCategory": _user_category(answer["userId"], answer["categoryId"]),
                    }
                )
        try:
            elections.update_item(
                Key={"code": code},
                UpdateExpression="SET snapshotTakenAt = :takenAt",
                ConditionExpression=Attr("snapshotTakenAt").not_exists(),
                ExpressionAttributeValues={":takenAt": taken_at},
            )
        except elections.meta.client.exceptions.ConditionalCheckFailedException:
            return False
        return True

    def get_snapshot_answers(self, code: str) -> list[Item]:
        return [
            _clean_answer(item)
            for item in self._items(
                "query", "snapshots", KeyConditionExpression=Key("electionCode").eq(code)
            )
        ]
