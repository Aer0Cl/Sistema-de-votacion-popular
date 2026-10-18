"""Handler HTTP de punta a punta con eventos de API Gateway HTTP API (payload v2)."""

import json
from dataclasses import dataclass

import pytest

from votacion_api import app as app_module
from votacion_api.repository.memory import MemoryRepository
from votacion_api.service import VotingService

from .conftest import Clock, seed


@dataclass
class FakeContext:
    function_name: str = "votacion-test-api"
    memory_limit_in_mb: int = 256
    invoked_function_arn: str = "arn:aws:lambda:us-east-1:123456789012:function:votacion-test-api"
    aws_request_id: str = "req-1"


@pytest.fixture
def call(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "dev-header")
    repo = MemoryRepository()
    seed(repo)
    app_module.set_service(VotingService(repo, now=Clock()))

    def invoke(method: str, path: str, user: str | None = "ana", body=None, raw_body=None):
        headers = {"content-type": "application/json"}
        if user:
            headers["x-user-id"] = user
        event = {
            "version": "2.0",
            "routeKey": "ANY /api/v1/{proxy+}",
            "rawPath": path,
            "rawQueryString": "",
            "headers": headers,
            "requestContext": {
                "http": {"method": method, "path": path, "sourceIp": "127.0.0.1"},
                "requestId": "req-1",
                "stage": "$default",
            },
            "isBase64Encoded": False,
        }
        if body is not None or raw_body is not None:
            event["body"] = raw_body if raw_body is not None else json.dumps(body)
        response = app_module.handler(event, FakeContext())
        payload = json.loads(response["body"]) if response.get("body") else None
        return response["statusCode"], payload

    yield invoke
    app_module.set_service(None)


def test_health(call):
    assert call("GET", "/api/v1/health", user=None) == (200, {"status": "ok"})


def test_flujo_de_participante(call):
    status, preview = call("GET", "/api/v1/elections/aaaaaa/preview")
    assert status == 200
    assert preview["categoryCount"] == 2

    assert call("POST", "/api/v1/elections/AAAAAA/join")[0] == 200
    status, answer = call("PUT", "/api/v1/me/answers/actor", body={"nomineeId": "a1"})
    assert status == 200
    assert answer["nomineeId"] == "a1"

    status, detail = call("GET", "/api/v1/elections/AAAAAA")
    assert status == 200
    assert detail["categories"][0]["votingMethod"] == "ranked"
    assert detail["myAnswers"][0]["categoryId"] == "actor"

    status, mine = call("GET", "/api/v1/me/elections")
    assert [e["code"] for e in mine] == ["AAAAAA"]

    assert call("DELETE", "/api/v1/elections/AAAAAA/membership") == (200, None)


def test_errores_de_negocio_con_mensaje(call):
    status, payload = call("GET", "/api/v1/elections/AAAAAA/results")
    assert status == 403
    assert "administradores" in payload["message"]

    assert call("GET", "/api/v1/me", user=None)[0] == 401
    assert call("GET", "/api/v1/me", user="desconocido")[0] == 401


def test_validacion_del_cuerpo(call):
    assert call("POST", "/api/v1/elections", user="admin", raw_body="{no json")[0] == 400
    status, payload = call("POST", "/api/v1/elections", user="admin", body={"name": "X"})
    assert status == 400
    assert "closesAt" in payload["message"]


def test_catalogo_de_admin(call):
    status, created = call(
        "POST",
        "/api/v1/admin/categories",
        user="admin",
        body={"name": "Mejor sonido", "votingMethod": "plurality"},
    )
    assert status == 201
    assert created["id"] == "mejor-sonido"
    assert call("DELETE", "/api/v1/admin/categories/mejor-sonido", user="admin") == (204, None)


def test_usuarios_de_prueba_solo_en_modo_dev(call, monkeypatch):
    status, users = call("GET", "/api/v1/dev/users", user=None)
    assert status == 200
    assert {u["id"] for u in users} == {"admin", "ana", "beto"}

    monkeypatch.setenv("AUTH_MODE", "jwt")
    assert call("GET", "/api/v1/dev/users", user=None)[0] == 404
    # En modo jwt el encabezado X-User-Id se ignora
    assert call("GET", "/api/v1/me", user="ana")[0] == 401


def test_ruta_inexistente(call):
    assert call("GET", "/api/v1/nada")[0] == 404
