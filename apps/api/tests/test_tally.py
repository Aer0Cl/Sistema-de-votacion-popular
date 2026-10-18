"""Mismos casos que packages/voting-core/src/*.test.ts, para mantener ambos ports alineados."""

import copy

from votacion_api.domain.tally import tally_instant_runoff, tally_plurality


def votes(*ids: str) -> list[dict]:
    return [{"nomineeId": n} for n in ids]


def ballots(*rankings: str) -> list[dict]:
    return [{"ranking": list(r)} for r in rankings]


class TestPlurality:
    def test_gana_el_de_mas_votos_sin_necesitar_mayoria(self):
        result = tally_plurality(["a", "b", "c"], votes("a", "a", "b", "c"))
        assert result["winners"] == ["a"]
        assert result["tally"] == {"a": 2, "b": 1, "c": 1}

    def test_empate_da_co_ganadores(self):
        assert tally_plurality(["a", "b", "c"], votes("a", "b"))["winners"] == ["a", "b"]

    def test_sin_papeletas_no_hay_ganador(self):
        assert tally_plurality(["a"], [])["winners"] == []

    def test_separa_votos_invalidos(self):
        result = tally_plurality(["a", "b"], votes("a", "zzz"))
        assert result["invalidBallots"] == 1
        assert result["tally"] == {"a": 1, "b": 0}


class TestInstantRunoff:
    def test_gana_en_primera_ronda(self):
        result = tally_instant_runoff(["a", "b", "c"], ballots("abc", "acb", "bac"))
        assert result["winners"] == ["a"]
        assert len(result["rounds"]) == 1

    def test_transfiere_votos_del_eliminado(self):
        result = tally_instant_runoff(
            ["a", "b", "c"], ballots(*["abc"] * 4, *["bac"] * 3, *["cba"] * 2)
        )
        assert result["winners"] == ["b"]
        assert [r["tally"] for r in result["rounds"]] == [
            {"a": 4, "b": 3, "c": 2},
            {"a": 4, "b": 5},
        ]

    def test_salta_preferencias_ya_eliminadas(self):
        result = tally_instant_runoff(
            ["a", "b", "c", "d"],
            ballots(*["abcd"] * 4, *["bacd"] * 3, *["cdba"] * 2, "dcba"),
        )
        assert [r["eliminated"] for r in result["rounds"]] == [["d"], ["c"], []]
        assert result["rounds"][2]["tally"] == {"a": 4, "b": 6}

    def test_mayoria_sobre_papeletas_activas(self):
        result = tally_instant_runoff(["a", "b", "c"], ballots("a", "a", "a", "b", "b", "c", "c"))
        assert result["winners"] == ["a"]
        assert result["rounds"][1]["activeBallots"] == 5
        assert result["rounds"][1]["exhaustedBallots"] == 2

    def test_no_modifica_las_papeletas(self):
        data = ballots("abc", "bca", "cab", "cba")
        before = copy.deepcopy(data)
        tally_instant_runoff(["a", "b", "c"], data)
        assert data == before

    def test_desempates(self):
        result = tally_instant_runoff(
            ["a", "b", "c", "d", "e"],
            ballots("a", "a", "a", "b", "b", "c", "c", "c", "dc", "eb"),
        )
        assert result["rounds"][0]["eliminated"] == ["e"]
        assert result["rounds"][0]["tieBreak"] == "id-order"
        assert result["rounds"][2]["eliminated"] == ["b"]
        assert result["rounds"][2]["tieBreak"] == "previous-rounds"

    def test_desempate_por_menciones(self):
        result = tally_instant_runoff(["a", "b", "c"], ballots("ac", "ac", "b", "c"))
        assert result["rounds"][0]["eliminated"] == ["b"]
        assert result["rounds"][0]["tieBreak"] == "total-mentions"

    def test_empate_final(self):
        assert tally_instant_runoff(["a", "b"], ballots("ab", "ba"))["winners"] == ["a", "b"]

    def test_sin_papeletas_ni_nominados(self):
        assert tally_instant_runoff(["a", "b"], [])["winners"] == []
        assert tally_instant_runoff([], ballots("ab"))["rounds"] == []
