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
    assert created["id"] == "mejor-sonido-2027"
    assert call("DELETE", "/api/v1/admin/categories/mejor-sonido-2027", user="admin") == (204, None)


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


def test_alta_de_usuarios(call):
    status, user = call("POST", "/api/v1/admin/users", user="admin", body={"displayName": "Eva"})
    assert (status, user) == (201, {"id": "u-eva", "displayName": "Eva", "role": "voter"})
    assert call("GET", "/api/v1/me", user="u-eva")[1]["displayName"] == "Eva"

    status, admin = call(
        "POST",
        "/api/v1/admin/users",
        user="admin",
        body={"displayName": "Fede", "role": "admin", "id": "fede"},
    )
    assert status == 201
    assert admin["role"] == "admin"

    assert call("POST", "/api/v1/admin/users", user="admin", body={"id": "x"})[0] == 400
    assert call("POST", "/api/v1/admin/users", user="admin", body={"displayName": 3})[0] == 400
    repeated = {"displayName": "Ana", "id": "ana"}
    assert call("POST", "/api/v1/admin/users", user="admin", body=repeated)[0] == 409
    assert call("POST", "/api/v1/admin/users", user="ana", body={"displayName": "X"})[0] == 403


def test_categoria_con_nominados_y_asignacion(call):
    status, created = call(
        "POST",
        "/api/v1/admin/categories",
        user="admin",
        body={
            "name": "Mejor sonido",
            "votingMethod": "plurality",
            "nominees": [{"name": "Dune", "description": "2021"}, {"name": "Oppenheimer"}],
        },
    )
    assert status == 201
    assert [n["name"] for n in created["nominees"]] == ["Dune", "Oppenheimer"]

    status, updated = call(
        "POST",
        "/api/v1/admin/categories/mejor-sonido-2027/nominees",
        user="admin",
        body={"nominees": [{"name": "Barbie"}, {"name": "Maestro", "description": "2023"}]},
    )
    assert status == 201
    assert [n["name"] for n in updated["nominees"]] == ["Dune", "Oppenheimer", "Barbie", "Maestro"]

    # La forma de un solo nominado sigue funcionando (la usa el front)
    status, single = call(
        "POST",
        "/api/v1/admin/categories/mejor-sonido-2027/nominees",
        user="admin",
        body={"name": "Elvis"},
    )
    assert status == 201
    assert single["nominees"][-1]["name"] == "Elvis"


def test_categoria_con_anio(call):
    status, created = call(
        "POST",
        "/api/v1/admin/categories",
        user="admin",
        body={"name": "Mejor sonido", "votingMethod": "plurality", "year": 2026},
    )
    assert status == 201
    assert (created["id"], created["year"]) == ("mejor-sonido-2026", 2026)

    for year in ["2026", True, 2026.5]:
        body = {"name": "Otra", "votingMethod": "plurality", "year": year}
        assert call("POST", "/api/v1/admin/categories", user="admin", body=body)[0] == 400

    change = {"name": "Mejor sonido", "votingMethod": "plurality", "year": 2027}
    assert (
        call("PATCH", "/api/v1/admin/categories/mejor-sonido-2026", user="admin", body=change)[0]
        == 400
    )


def test_validacion_de_listas_de_nominados(call):
    path = "/api/v1/admin/categories/mejor-sonido-2027/nominees"
    base = {"name": "Mejor sonido", "votingMethod": "plurality"}
    assert (
        call("POST", "/api/v1/admin/categories", user="admin", body={**base, "nominees": "Dune"})[0]
        == 400
    )
    assert (
        call("POST", "/api/v1/admin/categories", user="admin", body={**base, "nominees": [{}]})[0]
        == 400
    )
    assert (
        call("POST", "/api/v1/admin/categories", user="admin", body={**base, "nominees": []})[0]
        == 201
    )
    assert call("POST", path, user="admin", body={"nominees": ["Dune"]})[0] == 400
    assert call("POST", path, user="admin", body={"nominees": []})[0] == 400


OSCAR_BODY = {
    "oscar_awards": [
        {
            "year": 2024,
            "edition": "96th",
            "categories": [
                {
                    "name": "Best Picture",
                    "winner": "Oppenheimer",
                    "nominees": ["Barbie", "Oppenheimer"],
                },
                {"name": "Best Director", "winner": "Christopher Nolan", "nominees": []},
            ],
        },
        {
            "year": 2023,
            "edition": "95th",
            "categories": [{"name": "Best Actress", "nominees": ["Michelle Yeoh"]}],
        },
    ]
}


def test_carga_masiva_del_catalogo(call):
    status, result = call("POST", "/api/v1/admin/catalog/import", user="admin", body=OSCAR_BODY)
    assert status == 201
    assert (result["createdCategories"], result["createdNominees"]) == (3, 3)
    picture = result["categories"][0]
    assert (picture["id"], picture["votingMethod"], picture["year"]) == (
        "best-picture-2024",
        "ranked",
        2024,
    )
    # El ganador se omite por ahora
    assert "winner" not in picture
    assert [n["name"] for n in picture["nominees"]] == ["Barbie", "Oppenheimer"]

    # Repetir la carga choca con lo ya cargado
    assert call("POST", "/api/v1/admin/catalog/import", user="admin", body=OSCAR_BODY)[0] == 409


def test_validacion_de_la_carga_masiva(call):
    path = "/api/v1/admin/catalog/import"
    for body in [
        {},
        {"oscar_awards": "x"},
        {"oscar_awards": [{"categories": []}]},
        {"oscar_awards": [{"year": "2024", "categories": []}]},
        {"oscar_awards": [{"year": 2024, "categories": "x"}]},
        {"oscar_awards": [{"year": 2024, "categories": [{"nominees": []}]}]},
        {"oscar_awards": [{"year": 2024, "categories": [{"name": "X", "nominees": [1]}]}]},
    ]:
        assert call("POST", path, user="admin", body=body)[0] == 400, body
    assert call("POST", path, user="ana", body=OSCAR_BODY)[0] == 403
