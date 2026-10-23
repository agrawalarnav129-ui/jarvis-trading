"""
Tests for risk/risk.py — the position-sizing engine.

This module decides how much capital goes on the line, so the invariants here
are the ones that matter most in the project: never more than 2% at risk, never
a stop above entry, never a position that rounds to nothing, and the regime's
minimum R:R enforced.

Rules under test come from CLAUDE.md Section 6.
"""
from __future__ import annotations

import pytest

from config import CAPITAL_RISK_PCT
from risk.risk import calculate_position, validate_risk

CAPITAL = 1_000_000.0


# ── happy path ──────────────────────────────────────────────────────────────

def test_approved_trade_sizes_to_exactly_two_percent() -> None:
    """entry 100 / stop 98 / target 106 on ₹10L → 10,000 shares, ₹20k at risk."""
    r = calculate_position(entry=100.0, stop=98.0, target=106.0, capital=CAPITAL)
    assert r.shares == 10_000
    assert r.risk_amount == pytest.approx(20_000.0)
    assert r.risk_pct == pytest.approx(2.0)
    assert r.rr_ratio == pytest.approx(3.0)
    assert r.reward == pytest.approx(60_000.0)
    assert r.passed is True
    assert r.verdict.startswith("APPROVED")
    assert r.rejection_reasons == []
    assert r.warnings == []


def test_shares_formula_matches_claude_md() -> None:
    """shares = (capital × 2%) ÷ (entry − stop), floored."""
    r = calculate_position(entry=250.0, stop=243.5, target=270.0, capital=500_000.0)
    expected = int((500_000.0 * CAPITAL_RISK_PCT) / (250.0 - 243.5))
    assert r.shares == expected


# ── the 2% ceiling is the hard invariant ────────────────────────────────────

@pytest.mark.parametrize("entry,stop", [
    (100.0, 99.9), (100.0, 95.0), (1000.0, 980.0), (57.5, 56.1), (13_500.0, 13_100.0),
])
@pytest.mark.parametrize("capital", [50_000.0, 250_000.0, 1_000_000.0, 7_500_000.0])
def test_risk_never_exceeds_two_percent(entry: float, stop: float, capital: float) -> None:
    """Flooring the share count means realised risk can never breach the cap."""
    r = calculate_position(entry=entry, stop=stop, target=entry * 1.1, capital=capital)
    assert r.risk_pct <= CAPITAL_RISK_PCT * 100
    assert r.risk_amount <= capital * CAPITAL_RISK_PCT + 1e-6


def test_risk_pct_cannot_trigger_the_205_buffer() -> None:
    """
    Documents dead defensive code: calculate_position rejects risk_pct > 2.05,
    but because `shares` is floored the realised risk is always <= 2.00%, so
    that branch is unreachable. Harmless, but don't rely on it as a safety net.
    """
    r = calculate_position(entry=100.0, stop=99.99, target=120.0, capital=CAPITAL)
    assert r.risk_pct <= 2.0
    assert not any("exceeds 2%" in x for x in r.rejection_reasons)


# ── structural rejections ───────────────────────────────────────────────────

@pytest.mark.parametrize("entry,stop,why", [
    (100.0, 100.0, "stop equal to entry"),
    (100.0, 101.0, "stop above entry"),
    (100.0, 150.0, "stop far above entry"),
])
def test_stop_must_sit_below_entry(entry: float, stop: float, why: str) -> None:
    r = calculate_position(entry=entry, stop=stop, target=entry * 1.2, capital=CAPITAL)
    assert r.passed is False, why
    assert r.verdict.startswith("REJECTED")
    assert any("must be below entry" in x for x in r.rejection_reasons)


@pytest.mark.parametrize("entry,stop,target,capital", [
    (0.0, -1.0, 10.0, CAPITAL),
    (-5.0, -10.0, 10.0, CAPITAL),
    (100.0, 0.0, 120.0, CAPITAL),
    (100.0, 98.0, 120.0, 0.0),
    (100.0, 98.0, 120.0, -1000.0),
])
def test_non_positive_inputs_rejected_without_sizing(
    entry: float, stop: float, target: float, capital: float
) -> None:
    r = calculate_position(entry=entry, stop=stop, target=target, capital=capital)
    assert r.passed is False
    assert r.shares == 0
    assert r.risk_amount == 0


def test_stop_too_wide_for_capital_is_rejected_not_resized() -> None:
    """
    CLAUDE.md: "reject; never resize to force-fit". A ₹50 stop on ₹1,000 of
    capital cannot buy even one share within the 2% cap, so it must reject.
    """
    r = calculate_position(entry=100.0, stop=50.0, target=200.0, capital=1_000.0)
    assert r.shares == 0
    assert r.passed is False
    assert any("rounds to 0 shares" in x for x in r.rejection_reasons)


# ── regime-dependent minimum R:R ────────────────────────────────────────────

def test_bullish_requires_2to1() -> None:
    below = calculate_position(100.0, 98.0, 103.0, CAPITAL, regime="BULLISH")   # 1.5:1
    assert below.passed is False
    assert any("below minimum 2.0" in x for x in below.rejection_reasons)

    at = calculate_position(100.0, 98.0, 104.0, CAPITAL, regime="BULLISH")      # 2.0:1
    assert at.passed is True


def test_neutral_requires_2point5to1() -> None:
    """The same 2.2:1 trade passes in BULLISH and fails in NEUTRAL."""
    kw = dict(entry=100.0, stop=98.0, target=104.4, capital=CAPITAL)
    assert calculate_position(**kw, regime="BULLISH").rr_ratio == pytest.approx(2.2)
    assert calculate_position(**kw, regime="BULLISH").passed is True
    neutral = calculate_position(**kw, regime="NEUTRAL")
    assert neutral.passed is False
    assert any("below minimum 2.5" in x for x in neutral.rejection_reasons)


def test_bearish_regime_blocks_long_entries() -> None:
    """CLAUDE.md Section 6: BEARISH -> position size 0, no long entries."""
    r = calculate_position(100.0, 98.0, 120.0, CAPITAL, regime="BEARISH")
    assert r.passed is False
    assert r.verdict.startswith("REJECTED")
    assert r.shares == 0
    assert r.risk_amount == 0.0
    assert r.risk_pct == 0.0
    assert r.reward == 0.0
    assert any("BEARISH" in x for x in r.rejection_reasons)


def test_bearish_blocks_even_an_otherwise_perfect_setup() -> None:
    """A 10:1 trade well inside the 2% cap is still refused in BEARISH."""
    r = calculate_position(100.0, 99.0, 110.0, CAPITAL, regime="BEARISH")
    assert r.rr_ratio == pytest.approx(10.0)   # still reported, for information
    assert r.shares == 0
    assert r.passed is False


def test_bearish_rejection_is_not_muddied_by_sizing_noise() -> None:
    """
    Zeroing the position must not also trip "rounds to 0 shares — stop too
    wide" or the "risk is low" warning; the regime is the only real reason.
    """
    r = calculate_position(100.0, 98.0, 120.0, CAPITAL, regime="BEARISH")
    assert len(r.rejection_reasons) == 1
    assert not any("rounds to 0 shares" in x for x in r.rejection_reasons)
    assert not any("is low" in w for w in r.warnings)


@pytest.mark.parametrize("regime", ["BEARISH", "bearish", "Bearish", " bearish "])
def test_bearish_match_is_case_and_whitespace_insensitive(regime: str) -> None:
    """
    Guards a latent bug of the same family: the old `regime == "NEUTRAL"`
    comparison was case-sensitive, so a lowercase regime silently fell through
    to the laxer BULLISH threshold.
    """
    assert calculate_position(100.0, 98.0, 120.0, CAPITAL, regime=regime).shares == 0


@pytest.mark.parametrize("regime", ["neutral", "Neutral", " NEUTRAL "])
def test_neutral_match_is_case_insensitive_too(regime: str) -> None:
    """2.2:1 must fail the NEUTRAL 2.5 floor regardless of string casing."""
    r = calculate_position(100.0, 98.0, 104.4, CAPITAL, regime=regime)
    assert r.passed is False
    assert any("below minimum 2.5" in x for x in r.rejection_reasons)


def test_unknown_regime_falls_back_to_bullish_thresholds() -> None:
    """An unrecognised regime must not silently become permissive-or-blocked."""
    r = calculate_position(100.0, 98.0, 104.0, CAPITAL, regime="UNKNOWN")
    assert r.passed is True
    assert r.shares > 0


def test_missing_target_skips_the_rr_check() -> None:
    """
    Documented gap rather than a bug: with no target the R:R rule cannot be
    evaluated, so the trade is approved with a warning instead of rejected.
    """
    r = calculate_position(entry=100.0, stop=98.0, target=0.0, capital=CAPITAL)
    assert r.rr_ratio == 0.0
    assert r.reward == 0.0
    assert r.passed is True
    assert any("No target set" in w for w in r.warnings)


# ── soft warnings ───────────────────────────────────────────────────────────

def test_wide_stop_warns() -> None:
    r = calculate_position(entry=100.0, stop=90.0, target=130.0, capital=CAPITAL)
    assert any("below entry" in w and "unusually wide" in w for w in r.warnings)


def test_low_risk_warning_only_fires_when_the_position_rounds_to_zero() -> None:
    """
    Reachability note: because `shares` is floored, holding one share already
    implies risk_per_share > 1% of capital, so any non-zero position carries
    >1% risk. The "risk is low" warning can therefore only appear alongside the
    0-share rejection — it never flags a live, approved trade.
    """
    r = calculate_position(entry=100.0, stop=50.0, target=200.0, capital=1_000.0)
    assert r.shares == 0
    assert r.risk_pct == 0.0
    assert any("is low" in w for w in r.warnings)
    assert r.passed is False


# ── validate_risk agrees with the full calculator ───────────────────────────

@pytest.mark.parametrize("entry,stop,capital", [
    (100.0, 98.0, CAPITAL),
    (100.0, 99.0, 500_000.0),
    (100.0, 101.0, CAPITAL),      # stop above entry
    (100.0, 98.0, 0.0),           # no capital
    (100.0, 50.0, 1_000.0),       # stop too wide
])
def test_validate_risk_never_contradicts_the_cap(
    entry: float, stop: float, capital: float
) -> None:
    ok = validate_risk(entry, stop, capital)
    if ok:
        r = calculate_position(entry, stop, entry * 1.5, capital)
        assert r.risk_pct <= CAPITAL_RISK_PCT * 100


def test_validate_risk_rejects_inverted_stop_and_zero_capital() -> None:
    assert validate_risk(100.0, 101.0, CAPITAL) is False
    assert validate_risk(100.0, 98.0, 0.0) is False
    assert validate_risk(100.0, 98.0, CAPITAL) is True


# ── rounding / reporting hygiene ────────────────────────────────────────────

def test_outputs_are_rounded_for_display() -> None:
    r = calculate_position(entry=1234.5678, stop=1200.1234, target=1333.9876, capital=CAPITAL)
    assert r.entry == round(1234.5678, 2)
    assert r.stop == round(1200.1234, 2)
    assert r.target == round(1333.9876, 2)
    assert r.symbol == ""
