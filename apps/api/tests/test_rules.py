from datetime import UTC, datetime

import pytest

from votacion_api.domain.clock import normalize_iso
from votacion_api.domain.rules import (
    category_id,
    election_status,
    is_valid_election_code,
    slug_id,
    snapshot_answers,
    validate_answer_choice,
    validate_category_name,
    validate_category_year,
    validate_new_election,
)

NOW = datetime(2027, 1, 10, 12, tzinfo=UTC)
CATALOG = [
    {"id": "pelicula", "name": "Mejor pelicula", "votingMethod": "ranked"},
    {"id": "actor", "name": "Mejor actor", "votingMethod": "plurality"},
    {"id": "actriz", "name": "Mejor actriz", "votingMethod": "plurality"},
]
NOMINEES = [
    {"id": "p1", "categoryId": "pelicula"},
    {"id": "p2", "categoryId": "pelicula"},
    {"id": "a1", "categoryId": "actor"},
    {"id": "a2", "categoryId": "actor"},
]


@pytest.mark.parametrize("code", ["ABC123", "abc123", "ABCD1234", " OSC7K2 "])
def test_codigos_validos(code):
    assert is_valid_election_code(code)


@pytest.mark.parametrize("code", ["ABC12", "ABCDE12345", "ABC-123", "ÑANDU12", ""])
def test_codigos_invalidos(code):
    assert not is_valid_election_code(code)


def test_estado_segun_fecha_de_termino():
    assert election_status("2027-01-10T12:00:01Z", NOW) == "open"
    assert election_status("2027-01-10T12:00:00Z", NOW) == "closed"


def test_normaliza_fechas_a_utc_con_milisegundos():
    assert normalize_iso("2027-01-10T09:00:00-03:00") == "2027-01-10T12:00:00.000Z"


def test_validacion_de_nueva_votacion():
    valid = {"name": "X", "closesAt": "2027-02-01T00:00:00Z", "categoryIds": ["pelicula", "actor"]}
    assert validate_new_election(valid, CATALOG, NOMINEES, NOW) == []

    errors = validate_new_election(
        {"name": " ", "closesAt": "2027-01-01T00:00:00Z", "categoryIds": ["actor", "actriz"]},
        CATALOG,
        NOMINEES,
        NOW,
    )
    assert errors == [
        "La votacion necesita un nombre.",
        "La fecha de termino debe ser futura.",
        "Estas categorias necesitan al menos 2 nominados: Mejor actriz.",
    ]

    errors = validate_new_election({**valid, "closesAt": "manana"}, CATALOG, NOMINEES, NOW)
    assert errors == ["La fecha de termino no es valida."]


def test_respuestas_segun_metodo():
    pelicula, actor, _ = CATALOG
    assert validate_answer_choice(actor, NOMINEES, {"nomineeId": "a1"}) is None
    assert validate_answer_choice(pelicula, NOMINEES, {"ranking": ["p2", "p1"]}) is None
    assert validate_answer_choice(actor, NOMINEES, {"ranking": ["a1"]})
    assert validate_answer_choice(pelicula, NOMINEES, {"nomineeId": "p1"})
    assert validate_answer_choice(pelicula, NOMINEES, {"ranking": ["p1", "p1"]})
    assert validate_answer_choice(pelicula, NOMINEES, {"ranking": "p1"})
    assert validate_answer_choice(actor, NOMINEES, {"nomineeId": 1})


def test_exige_ranking_completo():
    pelicula = CATALOG[0]
    assert (
        validate_answer_choice(pelicula, NOMINEES, {"ranking": ["p1"]})
        == "El ranking debe ordenar a todos los nominados."
    )
    assert (
        validate_answer_choice(
            pelicula, NOMINEES, {"ranking": ["p1"]}, require_complete_ranking=False
        )
        is None
    )


def test_foto_toma_la_ultima_version_anterior_al_cierre():
    def answer(user, category, at, nominee):
        return {"userId": user, "categoryId": category, "updatedAt": at, "nomineeId": nominee}

    history = [
        answer("ana", "actor", "2027-02-20T00:00:00.000Z", "a2"),
        answer("ana", "actor", "2027-02-01T00:00:00.000Z", "a1"),
        answer("ana", "actor", "2027-03-01T00:00:00.000Z", "a1"),  # justo al cierre: fuera
        answer("beto", "actor", "2027-02-01T00:00:00.000Z", "a1"),  # no es participante
    ]
    result = snapshot_answers(history, "2027-03-01T00:00:00Z", ["actor"], ["ana"])
    assert result == [history[0]]


def test_nombres_y_ids_del_catalogo():
    catalog = [{**c, "year": 2026} for c in CATALOG]
    assert validate_category_name(" MEJOR ACTOR ", 2026, catalog)
    assert validate_category_name("Mejor actor", 2027, catalog) is None  # otro año
    assert validate_category_name("Mejor actor", 2026, catalog, "actor") is None
    assert category_id("Mejor película", 2026, set()) == "mejor-pelicula-2026"
    assert category_id("Mejor película", 2026, {"mejor-pelicula-2026"}) == "mejor-pelicula-2026-2"
    assert slug_id("Mejor dirección", set()) == "mejor-direccion"
    assert slug_id("Mejor actor", {"mejor-actor"}) == "mejor-actor-2"
    assert slug_id("¡¡!!", set()) == "item"


@pytest.mark.parametrize("year", [1899, 2101, 2026.0, "2026", True, None])
def test_anio_de_categoria_invalido(year):
    assert validate_category_year(year)


def test_anio_de_categoria_valido():
    assert validate_category_year(2026) is None
