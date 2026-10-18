"""Punto de entrada de las Lambdas.

handler           API HTTP (API Gateway HTTP API, payload v2) bajo el prefijo /api/v1
snapshot_handler  Proceso programado que toma las fotos de las votaciones cerradas

Identidad (AUTH_MODE):
  dev-header  el usuario llega en el encabezado X-User-Id. SOLO para el stage dev,
              mientras no exista Cognito; cualquiera puede hacerse pasar por otro usuario.
  jwt         el usuario es el claim "sub" del JWT validado por el autorizador de API Gateway.
"""

import json
import os
from typing import Any

from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver, Response
from aws_lambda_powertools.event_handler.exceptions import NotFoundError
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

from .errors import ApiError
from .service import VotingService

logger = Logger(service="votacion-api")
app = APIGatewayHttpResolver(strip_prefixes=["/api/v1"])

_service: VotingService | None = None


def get_service() -> VotingService:
    # Se crea una vez por contenedor para reutilizar las conexiones entre invocaciones
    global _service
    if _service is None:
        from .repository.dynamo import DynamoRepository

        _service = VotingService(DynamoRepository.from_environment())
    return _service


def set_service(service: VotingService | None) -> None:
    """Permite a los tests inyectar un servicio con repositorio en memoria."""
    global _service
    _service = service


def _auth_mode() -> str:
    return os.environ.get("AUTH_MODE", "jwt")


def _user_id(event: dict[str, Any]) -> str:
    if _auth_mode() == "dev-header":
        return (event.get("headers") or {}).get("x-user-id", "")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    return claims.get("sub", "")


def _current_user() -> str:
    return _user_id(app.current_event.raw_event)


def _json(data: Any, status: int = 200) -> Response:
    return Response(
        status_code=status,
        content_type="application/json",
        body=json.dumps(data, ensure_ascii=False),
    )


def _body() -> dict[str, Any]:
    try:
        body = app.current_event.json_body
    except (json.JSONDecodeError, TypeError) as error:
        raise ApiError(400, "El cuerpo de la solicitud no es JSON valido.") from error
    if not isinstance(body, dict):
        raise ApiError(400, "El cuerpo de la solicitud debe ser un objeto JSON.")
    return body


def _text(body: dict[str, Any], key: str, required: bool = True) -> str:
    value = body.get(key, None if required else "")
    if not isinstance(value, str):
        raise ApiError(400, f"El campo '{key}' es obligatorio y debe ser texto.")
    return value


def _text_list(body: dict[str, Any], key: str) -> list[str]:
    value = body.get(key)
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ApiError(400, f"El campo '{key}' debe ser una lista de textos.")
    return value


# --- errores ----------------------------------------------------------------------------


@app.exception_handler(ApiError)
def _handle_api_error(error: ApiError) -> Response:
    logger.info("Solicitud rechazada", extra={"status": error.status, "reason": error.message})
    return _json({"message": error.message}, error.status)


@app.not_found
def _handle_not_found(error: NotFoundError) -> Response:
    return _json({"message": "No encontrado."}, 404)


@app.exception_handler(Exception)
def _handle_unexpected(error: Exception) -> Response:
    logger.exception("Error inesperado")
    return _json({"message": "Ocurrio un error inesperado."}, 500)


# --- rutas ------------------------------------------------------------------------------


@app.get("/health")
def health() -> Response:
    return _json({"status": "ok"})


@app.get("/dev/users")
def dev_users() -> Response:
    # Solo para el selector de usuario de prueba del front
    if _auth_mode() != "dev-header":
        raise ApiError(404, "No encontrado.")
    return _json(get_service().list_users())


@app.get("/me")
def get_me() -> Response:
    return _json(get_service().get_me(_current_user()))


@app.get("/me/elections")
def list_my_elections() -> Response:
    return _json(get_service().list_my_elections(_current_user()))


@app.get("/me/answers")
def get_my_answers() -> Response:
    return _json(get_service().get_my_answers(_current_user()))


@app.put("/me/answers/<category_id>")
def save_answer(category_id: str) -> Response:
    return _json(get_service().save_answer(_current_user(), category_id, _body()))


@app.post("/elections")
def create_election() -> Response:
    body = _body()
    data = {
        "name": _text(body, "name"),
        "closesAt": _text(body, "closesAt"),
        "categoryIds": _text_list(body, "categoryIds"),
    }
    return _json(get_service().create_election(_current_user(), data), 201)


@app.get("/elections/<code>/preview")
def preview_election(code: str) -> Response:
    return _json(get_service().preview_election(_current_user(), code))


@app.post("/elections/<code>/join")
def join_election(code: str) -> Response:
    return _json(get_service().join_election(_current_user(), code))


@app.delete("/elections/<code>/membership")
def leave_election(code: str) -> Response:
    return _json(get_service().leave_election(_current_user(), code))


@app.get("/elections/<code>")
def get_election(code: str) -> Response:
    return _json(get_service().get_election(_current_user(), code))


@app.get("/elections/<code>/results")
def get_results(code: str) -> Response:
    return _json(get_service().get_results(_current_user(), code))


@app.get("/admin/catalog")
def list_catalog() -> Response:
    return _json(get_service().list_catalog(_current_user()))


@app.post("/admin/categories")
def create_category() -> Response:
    body = _body()
    data = {"name": _text(body, "name"), "votingMethod": _text(body, "votingMethod")}
    return _json(get_service().create_category(_current_user(), data), 201)


@app.patch("/admin/categories/<category_id>")
def update_category(category_id: str) -> Response:
    body = _body()
    data = {"name": _text(body, "name"), "votingMethod": _text(body, "votingMethod")}
    return _json(get_service().update_category(_current_user(), category_id, data))


@app.delete("/admin/categories/<category_id>")
def delete_category(category_id: str) -> Response:
    get_service().delete_category(_current_user(), category_id)
    return Response(status_code=204)


@app.post("/admin/categories/<category_id>/nominees")
def add_nominee(category_id: str) -> Response:
    body = _body()
    data = {"name": _text(body, "name"), "description": _text(body, "description", False)}
    return _json(get_service().add_nominee(_current_user(), category_id, data), 201)


@app.patch("/admin/nominees/<nominee_id>")
def update_nominee(nominee_id: str) -> Response:
    body = _body()
    data = {"name": _text(body, "name"), "description": _text(body, "description", False)}
    return _json(get_service().update_nominee(_current_user(), nominee_id, data))


# --- handlers de Lambda -----------------------------------------------------------------


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_HTTP)
def handler(event: dict[str, Any], context: LambdaContext) -> dict[str, Any]:
    logger.append_keys(userId=_user_id(event) or "anonimo")
    response = app.resolve(event, context)
    logger.info(
        "Solicitud atendida",
        extra={
            "method": event.get("requestContext", {}).get("http", {}).get("method"),
            "path": event.get("rawPath"),
            "status": response.get("statusCode"),
        },
    )
    return response


@logger.inject_lambda_context
def snapshot_handler(event: dict[str, Any], context: LambdaContext) -> dict[str, int]:
    taken = get_service().take_pending_snapshots()
    logger.info("Revision de cierres terminada", extra={"snapshotsTaken": taken})
    return {"snapshotsTaken": taken}
