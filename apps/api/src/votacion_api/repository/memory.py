"""Repositorio en memoria para tests y desarrollo local."""

import copy

from ..domain.rules import snapshot_answers
from . import Item, user_item


class MemoryRepository:
    def __init__(self) -> None:
        self.users: dict[str, Item] = {}
        self.categories: dict[str, Item] = {}
        self.nominees: dict[str, Item] = {}
        self.elections: dict[str, Item] = {}
        self.memberships: dict[tuple[str, str], Item] = {}
        self.current_answers: dict[tuple[str, str], Item] = {}
        self.history: list[Item] = []
        self.snapshots: dict[str, list[Item]] = {}

    def get_user(self, user_id: str) -> Item | None:
        return copy.deepcopy(self.users.get(user_id))

    def list_users(self) -> list[Item]:
        return copy.deepcopy(list(self.users.values()))

    def put_user(self, user: Item) -> None:
        self.users[user["id"]] = user_item(user)

    def create_user(self, user: Item) -> bool:
        if user["id"] in self.users:
            return False
        self.put_user(user)
        return True

    def list_categories(self) -> list[Item]:
        return copy.deepcopy(list(self.categories.values()))

    def get_category(self, category_id: str) -> Item | None:
        return copy.deepcopy(self.categories.get(category_id))

    def put_category(self, category: Item) -> None:
        self.categories[category["id"]] = copy.deepcopy(category)

    def delete_category(self, category_id: str) -> None:
        self.categories.pop(category_id, None)
        self.nominees = {
            key: n for key, n in self.nominees.items() if n["categoryId"] != category_id
        }

    def list_nominees(self, category_id: str | None = None) -> list[Item]:
        nominees = [n for n in self.nominees.values() if category_id in (None, n["categoryId"])]
        return copy.deepcopy(sorted(nominees, key=lambda n: n["createdAt"]))

    def get_nominee(self, nominee_id: str) -> Item | None:
        return copy.deepcopy(self.nominees.get(nominee_id))

    def put_nominee(self, nominee: Item) -> None:
        self.nominees[nominee["id"]] = copy.deepcopy(nominee)

    def put_catalog(self, categories: list[Item], nominees: list[Item]) -> None:
        for category in categories:
            self.put_category(category)
        for nominee in nominees:
            self.put_nominee(nominee)

    def list_elections(self) -> list[Item]:
        return copy.deepcopy(list(self.elections.values()))

    def get_election(self, code: str) -> Item | None:
        return copy.deepcopy(self.elections.get(code))

    def create_election(self, election: Item) -> bool:
        if election["code"] in self.elections:
            return False
        self.elections[election["code"]] = copy.deepcopy(election)
        return True

    def list_member_ids(self, code: str) -> list[str]:
        return [user_id for (c, user_id) in self.memberships if c == code]

    def list_member_codes(self, user_id: str) -> list[str]:
        return [c for (c, member) in self.memberships if member == user_id]

    def add_membership(self, code: str, user_id: str, joined_at: str) -> None:
        self.memberships[(code, user_id)] = {
            "electionCode": code,
            "userId": user_id,
            "joinedAt": joined_at,
        }

    def remove_membership(self, code: str, user_id: str) -> None:
        self.memberships.pop((code, user_id), None)

    def list_current_answers(self, user_id: str) -> list[Item]:
        return copy.deepcopy([a for (u, _), a in self.current_answers.items() if u == user_id])

    def save_answer(self, answer: Item) -> None:
        self.current_answers[(answer["userId"], answer["categoryId"])] = copy.deepcopy(answer)
        self.history.append(copy.deepcopy(answer))

    def latest_answers_before(
        self, user_ids: list[str], category_ids: list[str], before: str
    ) -> list[Item]:
        return copy.deepcopy(snapshot_answers(self.history, before, category_ids, user_ids))

    def save_snapshot(self, code: str, taken_at: str, answers: list[Item]) -> bool:
        election = self.elections.get(code)
        if election is None or "snapshotTakenAt" in election:
            return False
        self.snapshots[code] = copy.deepcopy(answers)
        election["snapshotTakenAt"] = taken_at
        return True

    def get_snapshot_answers(self, code: str) -> list[Item]:
        return copy.deepcopy(self.snapshots.get(code, []))
