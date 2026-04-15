from pathlib import Path
from engine.schema import load_assumptions
from engine.scenarios import run_scenarios, ScenarioResult


def test_run_scenarios_returns_three_named_results():
    a = load_assumptions(Path("assumptions.yaml"))
    results = run_scenarios(a)
    names = {r.name for r in results}
    assert names == {"base", "downside", "upside"}


def test_downside_year3_net_income_lower_than_base():
    a = load_assumptions(Path("assumptions.yaml"))
    results = run_scenarios(a)
    base = next(r for r in results if r.name == "base")
    downside = next(r for r in results if r.name == "downside")
    assert downside.year3_net_income < base.year3_net_income


def test_upside_year3_net_income_higher_than_base():
    a = load_assumptions(Path("assumptions.yaml"))
    results = run_scenarios(a)
    base = next(r for r in results if r.name == "base")
    upside = next(r for r in results if r.name == "upside")
    assert upside.year3_net_income > base.year3_net_income
