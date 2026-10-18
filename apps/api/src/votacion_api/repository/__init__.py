"""Acceso a datos: interfaz comun con implementaciones en memoria y DynamoDB."""

from typing import Any, Protocol

from ..domain.rules import USER_ROLES

Item = dict[str, Any]

# Atributos de la tabla users: id (clave), displayName (nombre) y role (voter | admin)
USER_ATTRIBUTES = ("id", "displayName", "role")


def user_item(user: Item) -> Item:
    """Registro de usuario con solo sus atributos; falla si falta alguno o el rol no es valido."""
    missing = [name for name in USER_ATTRIBUTES if not user.get(name)]
    if missing:
        raise ValueError(f"Al usuario le faltan atributos: {', '.join(missing)}.")
    if user["role"] not in USER_ROLES:
        raise ValueError(f"Rol de usuario no valido: {user['role']}.")
    return {name: user[name] for name in USER_ATTRIBUTES}


class Repository(Protocol):
    # Usuarios (hasta integrar Cognito)
    def get_user(self, user_id: str) -> Item | None: ...
    def list_users(self) -> list[Item]: ...
    def put_user(self, user: Item) -> None: ...
    def create_user(self, user: Item) -> bool:
        """False si el id ya existe."""

    # Catalogo
    def list_categories(self) -> list[Item]: ...
    def get_category(self, category_id: str) -> Item | None: ...
    def put_category(self, category: Item) -> None: ...
    def delete_category(self, category_id: str) -> None:
        """Elimina la categoria y sus nominados."""

    def list_nominees(self, category_id: str | None = None) -> list[Item]:
        """Nominados en orden de creacion; todos si no se indica categoria."""

    def get_nominee(self, nominee_id: str) -> Item | None: ...
    def put_nominee(self, nominee: Item) -> None: ...

    # Votaciones
    def list_elections(self) -> list[Item]: ...
    def get_election(self, code: str) -> Item | None: ...
    def create_election(self, election: Item) -> bool:
        """False si el codigo ya existe."""

    def list_member_ids(self, code: str) -> list[str]: ...
    def list_member_codes(self, user_id: str) -> list[str]: ...
    def add_membership(self, code: str, user_id: str, joined_at: str) -> None: ...
    def remove_membership(self, code: str, user_id: str) -> None: ...

    # Respuestas
    def list_current_answers(self, user_id: str) -> list[Item]: ...
    def save_answer(self, answer: Item) -> None:
        """Actualiza la respuesta actual y agrega una version al historial."""

    def latest_answers_before(
        self, user_ids: list[str], category_ids: list[str], before: str
    ) -> list[Item]:
        """Por usuario y categoria, la ultima version con updatedAt < before."""

    # Fotos de cierre
    def save_snapshot(self, code: str, taken_at: str, answers: list[Item]) -> bool:
        """Guarda la foto; False si la votacion ya tenia una."""

    def get_snapshot_answers(self, code: str) -> list[Item]: ...
