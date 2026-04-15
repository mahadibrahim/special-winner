from pathlib import Path
from engine.schema import load_assumptions
from engine.sensitivity import build_tornado, TornadoBar


def test_tornado_has_one_bar_per_variable():
    a = load_assumptions(Path("assumptions.yaml"))
    bars = build_tornado(a)
    names = {b.variable for b in bars}
    # At minimum these variables
    assert "soccer_fill_rate" in names
    assert "blended_cac_y1" in names
    assert "soccer_s1_to_s2_retention" in names
    assert "soccer_price" in names


def test_tornado_bars_are_sorted_by_impact_descending():
    a = load_assumptions(Path("assumptions.yaml"))
    bars = build_tornado(a)
    impacts = [b.impact for b in bars]
    assert impacts == sorted(impacts, reverse=True)


def test_tornado_bar_low_base_high_ordering():
    """For each variable, the high value should produce a higher output than the low value."""
    a = load_assumptions(Path("assumptions.yaml"))
    bars = build_tornado(a)
    for b in bars:
        assert b.output_high >= b.output_low
