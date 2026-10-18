"""Reglas de negocio; cada test corre contra el repositorio en memoria y contra DynamoDB (moto).

Los escenarios son los mismos que apps/web/src/api/mockApi.test.ts.
"""

import pytest

from votacion_api.domain.clock import to_iso
from votacion_api.errors import ApiError

from .conftest import DAY, START


def status_of(call) -> int:
    with pytest.raises(ApiError) as error:
        call()
    return error.value.status


RANKING = ["p1", "p2", "p3"]


def test_respuesta_compartida_y_foto_al_cierre(service, clock):
    service.join_election("ana", "aaaaaa")
    service.join_election("ana", "BBBBBB")
    service.save_answer("ana", "pelicula", {"ranking": RANKING})

    for code in ("AAAAAA", "BBBBBB"):
        assert service.get_election("ana", code)["myAnswers"][0]["ranking"] == RANKING

    clock.advance(15)  # A cerro, B sigue abierta
    service.save_answer("ana", "pelicula", {"ranking": ["p2", "p1", "p3"]})

    a = service.get_election("ana", "AAAAAA")
    b = service.get_election("ana", "BBBBBB")
    assert a["status"] == "closed"
    assert a["myAnswers"][0]["ranking"] == RANKING
    assert b["myAnswers"][0]["ranking"] == ["p2", "p1", "p3"]

    results = service.get_results("admin", "AAAAAA")
    assert results["snapshotTakenAt"]
    assert results["results"][0]["result"]["winners"] == ["p1"]


def test_proceso_programado_toma_fotos_pendientes(service, clock):
    service.join_election("ana", "AAAAAA")
    service.save_answer("ana", "actor", {"nomineeId": "a1"})

    assert service.take_pending_snapshots() == 0
    clock.advance(15)
    assert service.take_pending_snapshots() == 1
    assert service.take_pending_snapshots() == 0
    answers = service.repo.get_snapshot_answers("AAAAAA")
    assert [(a["userId"], a["nomineeId"]) for a in answers] == [("ana", "a1")]


def test_la_foto_ignora_cambios_posteriores_al_cierre_aunque_llegue_tarde(service, clock):
    service.join_election("ana", "AAAAAA")
    service.join_election("ana", "BBBBBB")
    service.save_answer("ana", "pelicula", {"ranking": RANKING})
    clock.advance(15)
    # Cambio despues del cierre de A, antes de que nadie haya pedido la foto
    service.save_answer("ana", "pelicula", {"ranking": ["p3", "p2", "p1"]})

    assert service.get_election("ana", "AAAAAA")["myAnswers"][0]["ranking"] == RANKING


def test_no_responde_categorias_solo_en_votaciones_cerradas(service, clock):
    service.join_election("ana", "AAAAAA")
    service.save_answer("ana", "actor", {"nomineeId": "a1"})
    clock.advance(15)
    assert status_of(lambda: service.save_answer("ana", "actor", {"nomineeId": "a2"})) == 403


def test_no_responde_categorias_de_votaciones_ajenas(service):
    service.join_election("ana", "AAAAAA")
    assert status_of(lambda: service.save_answer("ana", "actriz", {"nomineeId": "x1"})) == 403


def test_valida_respuesta_y_ranking_completo(service):
    service.join_election("ana", "AAAAAA")
    assert status_of(lambda: service.save_answer("ana", "pelicula", {"nomineeId": "p1"})) == 400
    assert status_of(lambda: service.save_answer("ana", "pelicula", {"ranking": ["p1"]})) == 400


def test_no_se_une_a_votacion_cerrada(service, clock):
    clock.advance(15)
    assert status_of(lambda: service.join_election("ana", "AAAAAA")) == 409


def test_codigo_inexistente(service):
    assert status_of(lambda: service.preview_election("ana", "ZZZZZZ")) == 404


def test_usuario_desconocido(service):
    assert status_of(lambda: service.get_me("nadie")) == 401
    assert status_of(lambda: service.get_me("")) == 401


def test_resultados_solo_para_admins_de_la_votacion(service):
    service.join_election("ana", "AAAAAA")
    assert status_of(lambda: service.get_results("ana", "AAAAAA")) == 403


def test_crear_votacion(service):
    data = {
        "name": " Nueva ",
        "closesAt": to_iso(START + DAY),
        "categoryIds": ["pelicula", "actor"],
    }
    assert status_of(lambda: service.create_election("ana", data)) == 403

    created = service.create_election("admin", data)
    assert len(created["code"]) == 8
    assert created["isAdmin"] is True
    assert created["name"] == "Nueva"
    assert created["code"] in [e["code"] for e in service.list_my_elections("admin")]


def test_codigo_repetido_se_regenera(repo, clock):
    from votacion_api.service import VotingService

    from .conftest import seed

    seed(repo)
    codes = iter(["AAAAAA", "CCCCCCCC"])
    service = VotingService(repo, now=clock, generate_code=lambda: next(codes))
    created = service.create_election(
        "admin",
        {"name": "X", "closesAt": to_iso(START + DAY), "categoryIds": ["pelicula", "actor"]},
    )
    assert created["code"] == "CCCCCCCC"


class TestAbandonar:
    def test_deja_de_contar_pero_conserva_respuestas(self, service):
        service.join_election("ana", "AAAAAA")
        service.join_election("ana", "BBBBBB")
        service.save_answer("ana", "pelicula", {"ranking": RANKING})

        assert service.leave_election("ana", "AAAAAA") is None
        assert [e["code"] for e in service.list_my_elections("ana")] == ["BBBBBB"]
        assert len(service.get_election("ana", "BBBBBB")["myAnswers"]) == 1
        results = service.get_results("admin", "AAAAAA")
        assert results["results"][0]["result"]["totalBallots"] == 0

    def test_no_abandona_cerrada(self, service, clock):
        service.join_election("ana", "AAAAAA")
        clock.advance(15)
        assert status_of(lambda: service.leave_election("ana", "AAAAAA")) == 409

    def test_admin_sigue_viendola(self, service):
        service.join_election("admin", "AAAAAA")
        summary = service.leave_election("admin", "AAAAAA")
        assert summary["isMember"] is False
        assert summary["isAdmin"] is True


class TestCatalogo:
    def test_solo_admins(self, service):
        assert status_of(lambda: service.list_catalog("ana")) == 403

    def test_crear_categoria_y_nominados(self, service):
        created = service.create_category(
            "admin", {"name": "Mejor sonido", "votingMethod": "plurality"}
        )
        assert created["id"] == "mejor-sonido"
        assert created["locked"] is False

        service.add_nominee("admin", "mejor-sonido", {"name": "Dune", "description": ""})
        updated = service.add_nominee(
            "admin", "mejor-sonido", {"name": "Oppenheimer", "description": "2023"}
        )
        assert [n["name"] for n in updated["nominees"]] == ["Dune", "Oppenheimer"]
        assert updated["nominees"][1]["description"] == "2023"
        assert "createdAt" not in updated["nominees"][0]

    def test_bloqueos_de_categorias_en_uso(self, service):
        actor = next(c for c in service.list_catalog("admin") if c["id"] == "actor")
        assert actor["locked"] is True
        assert actor["usedInElections"] == 1

        add = lambda: service.add_nominee("admin", "actor", {"name": "a3"})  # noqa: E731
        assert status_of(add) == 409
        change_method = lambda: service.update_category(  # noqa: E731
            "admin", "actor", {"name": "Mejor actor", "votingMethod": "ranked"}
        )
        assert status_of(change_method) == 409
        assert status_of(lambda: service.delete_category("admin", "actor")) == 409

        renamed = service.update_category(
            "admin", "actor", {"name": "Mejor actor protagonico", "votingMethod": "plurality"}
        )
        assert renamed["name"] == "Mejor actor protagonico"
        nominee = service.update_nominee("admin", "a1", {"name": "Actor uno"})
        assert nominee["nominees"][0]["name"] == "Actor uno"

    def test_eliminar_categoria_sin_uso(self, service):
        service.create_category("admin", {"name": "Mejor sonido", "votingMethod": "plurality"})
        service.add_nominee("admin", "mejor-sonido", {"name": "Dune"})
        service.delete_category("admin", "mejor-sonido")

        assert "mejor-sonido" not in [c["id"] for c in service.list_catalog("admin")]
        assert service.repo.list_nominees("mejor-sonido") == []

    def test_nombres_repetidos_y_metodo_invalido(self, service):
        repeated = lambda: service.create_category(  # noqa: E731
            "admin", {"name": "mejor ACTOR", "votingMethod": "plurality"}
        )
        assert status_of(repeated) == 400
        bad_method = lambda: service.create_category(  # noqa: E731
            "admin", {"name": "Otra", "votingMethod": "borda"}
        )
        assert status_of(bad_method) == 400
        assert status_of(lambda: service.update_nominee("admin", "a2", {"name": "A1"})) == 400

    def test_votacion_exige_dos_nominados(self, service):
        service.create_category("admin", {"name": "Mejor sonido", "votingMethod": "plurality"})
        service.add_nominee("admin", "mejor-sonido", {"name": "Dune"})
        data = {
            "name": "X",
            "closesAt": to_iso(START + DAY),
            "categoryIds": ["actor", "mejor-sonido"],
        }
        assert status_of(lambda: service.create_election("admin", data)) == 400
