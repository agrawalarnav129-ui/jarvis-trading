"""
AXIOM Risk Calculator — position sizing and trade validation.
Rules per CLAUDE.md:
  - Never risk > 2% capital per trade
  - Max 4% daily (2 positions)
  - Min R:R 2:1 (BULLISH), 2.5:1 (NEUTRAL)
  - BEARISH regime: no long entries at all (position size 0)
  - Never average down

This engine models LONG entries only — a stop at or above entry is rejected —
so the BEARISH block is unconditional. If short setups are added later it will
need a `side` argument so shorts are not blocked by the same rule.
"""
from __future__ import annotations

from dataclasses import dataclass

from config import CAPITAL_RISK_PCT, MAX_DAILY_RISK_PCT


@dataclass
class RiskResult:
    symbol: str
    entry: float
    stop: float
    target: float
    capital: float
    shares: int
    risk_amount: float       # ₹ at risk
    risk_pct: float          # % of capital
    reward: float            # ₹ potential reward
    rr_ratio: float          # reward:risk
    min_rr: float            # R:R floor this regime demanded
    passed: bool             # cleared all checks
    verdict: str             # APPROVED / REJECTED
    rejection_reasons: list[str]
    warnings: list[str]


def calculate_position(
    entry: float,
    stop: float,
    target: float,
    capital: float,
    symbol: str = "",
    regime: str = "BULLISH",
) -> RiskResult:
    """
    Calculate position size and validate against all risk rules.

    Formula: shares = (capital × 0.02) / (entry - stop)

    A BEARISH regime zeroes the position and rejects outright, per CLAUDE.md
    Section 6. The regime string is matched case-insensitively.
    """
    rejections: list[str] = []
    warnings: list[str] = []
    regime_norm = (regime or "").strip().upper()
    # Computed up front so it is reported even on an early validation exit —
    # callers (including the API and its clients) read the floor from here
    # rather than re-deriving the rule.
    min_rr = 2.5 if regime_norm == "NEUTRAL" else 2.0

    # ── Input validation ──
    if entry <= 0:
        rejections.append("Entry price must be > 0")
    if stop <= 0:
        rejections.append("Stop price must be > 0")
    if stop >= entry:
        rejections.append(f"Stop ({stop:.2f}) must be below entry ({entry:.2f})")
    if capital <= 0:
        rejections.append("Capital must be > 0")

    if rejections:
        return RiskResult(
            symbol=symbol, entry=entry, stop=stop, target=target, capital=capital,
            shares=0, risk_amount=0, risk_pct=0, reward=0, rr_ratio=0, min_rr=min_rr,
            passed=False, verdict="REJECTED", rejection_reasons=rejections, warnings=warnings,
        )

    risk_per_share = entry - stop
    max_risk_amt   = capital * CAPITAL_RISK_PCT          # 2% of capital
    shares         = int(max_risk_amt / risk_per_share)
    risk_amount    = shares * risk_per_share
    risk_pct       = (risk_amount / capital) * 100

    reward         = shares * (target - entry) if target > entry else 0.0
    rr_ratio       = round((target - entry) / risk_per_share, 2) if target > entry else 0.0

    # ── Hard rejection rules ──
    # BEARISH is a policy stop, not a sizing failure: CLAUDE.md Section 6 sets
    # position size to 0 and forbids long entries outright. The position is
    # zeroed, while rr_ratio is left intact so the UI can still show what the
    # trade would have been worth had the regime allowed it.
    is_bearish = regime_norm == "BEARISH"
    if is_bearish:
        rejections.append("BEARISH regime — no long entries permitted (position size 0)")
        shares      = 0
        risk_amount = 0.0
        risk_pct    = 0.0
        reward      = 0.0

    if risk_pct > 2.05:   # small float buffer
        rejections.append(f"Risk {risk_pct:.2f}% exceeds 2% limit")

    # Suppressed under BEARISH: the position is 0 by policy, not a wide stop.
    if shares <= 0 and not is_bearish:
        rejections.append("Position size rounds to 0 shares — stop too wide")

    # Min R:R by regime (floor computed above)
    if target > entry and rr_ratio < min_rr and not is_bearish:
        rejections.append(f"R:R {rr_ratio:.2f} below minimum {min_rr} for {regime_norm} regime")

    # ── Soft warnings ──
    # Suppressed under BEARISH: 0% risk there is the intended outcome, so
    # "consider a wider stop" would be actively misleading advice.
    if risk_pct < 1.0 and not is_bearish:
        warnings.append(f"Risk {risk_pct:.2f}% is low — consider wider stop or more capital")
    if target <= entry:
        warnings.append("No target set — R:R cannot be calculated")
    if (entry - stop) / entry > 0.05:
        warnings.append(f"Stop is {(entry-stop)/entry*100:.1f}% below entry — unusually wide")

    passed  = len(rejections) == 0
    verdict = "APPROVED ✓" if passed else "REJECTED ✗"

    return RiskResult(
        symbol=symbol,
        entry=round(entry, 2),
        stop=round(stop, 2),
        target=round(target, 2),
        capital=round(capital, 2),
        shares=shares,
        risk_amount=round(risk_amount, 2),
        risk_pct=round(risk_pct, 2),
        reward=round(reward, 2),
        rr_ratio=rr_ratio,
        min_rr=min_rr,
        passed=passed,
        verdict=verdict,
        rejection_reasons=rejections,
        warnings=warnings,
    )


def validate_risk(entry: float, stop: float, capital: float) -> bool:
    """Quick boolean check — is this trade within 2% risk?"""
    if stop >= entry or capital <= 0:
        return False
    risk = (entry - stop) * int((capital * CAPITAL_RISK_PCT) / (entry - stop))
    return (risk / capital) <= CAPITAL_RISK_PCT
