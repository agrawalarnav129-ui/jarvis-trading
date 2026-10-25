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
    side: str                # LONG / SHORT
    lots: int                # whole lots (0 when sized in cash shares)
    lot_size: int            # contract lot size, 0 for cash equity
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
    side: str = "LONG",
    lot_size: int = 0,
) -> RiskResult:
    """
    Calculate position size and validate against all risk rules.

    Formula: shares = (capital × 0.02) / |entry - stop|

    A SHORT inverts the geometry — the stop sits ABOVE entry and the target
    BELOW it — and inverts the regime gate with it: CLAUDE.md Section 6 blocks
    longs in BEARISH, so it blocks shorts in BULLISH, on the same principle of
    never trading against the regime. NEUTRAL demands 2.5:1 from both sides.

    `lot_size` > 0 sizes the position in whole futures lots, rounded DOWN —
    the only direction that cannot breach the 2% cap. Leave it 0 for cash
    equity. On NSE an overnight short must be a futures position, so a short
    held past the session needs a lot size.

    `side` and `regime` are matched case-insensitively; an unrecognised side
    is treated as LONG.
    """
    rejections: list[str] = []
    warnings: list[str] = []
    regime_norm = (regime or "").strip().upper()
    is_short = (side or "").strip().upper() == "SHORT"
    side_norm = "SHORT" if is_short else "LONG"
    # Computed up front so it is reported even on an early validation exit —
    # callers (including the API and its clients) read the floor from here
    # rather than re-deriving the rule.
    min_rr = 2.5 if regime_norm == "NEUTRAL" else 2.0

    # ── Input validation ──
    if entry <= 0:
        rejections.append("Entry price must be > 0")
    if stop <= 0:
        rejections.append("Stop price must be > 0")
    if is_short:
        if stop <= entry:
            rejections.append(f"Stop ({stop:.2f}) must be above entry ({entry:.2f}) for a SHORT")
    elif stop >= entry:
        rejections.append(f"Stop ({stop:.2f}) must be below entry ({entry:.2f})")
    if capital <= 0:
        rejections.append("Capital must be > 0")

    if rejections:
        return RiskResult(
            symbol=symbol, entry=entry, stop=stop, target=target, capital=capital,
            shares=0, risk_amount=0, risk_pct=0, reward=0, rr_ratio=0, min_rr=min_rr,
            side=side_norm, lots=0, lot_size=max(lot_size, 0),
            passed=False, verdict="REJECTED", rejection_reasons=rejections, warnings=warnings,
        )

    # Distance to the stop is the risk either way; only its direction differs.
    risk_per_share = (stop - entry) if is_short else (entry - stop)
    max_risk_amt   = capital * CAPITAL_RISK_PCT          # 2% of capital
    shares         = int(max_risk_amt / risk_per_share)

    # ── Lot rounding (derivatives only) ──
    # A futures position trades in whole lots, so the share count the 2% cap
    # implies is rarely one you can actually place. Round DOWN: rounding up is
    # the one direction that breaches the cap, and by a lot — HDFCBANK's 823
    # shares is 1 lot of 650 (1.58% risk) or 2 lots (3.16%, over the limit).
    # lot_size <= 0 means cash equity, where any share count is valid.
    lots = 0
    if lot_size > 0:
        lots = shares // lot_size
        shares = lots * lot_size

    risk_amount    = shares * risk_per_share
    risk_pct       = (risk_amount / capital) * 100

    # A short profits as price falls, so a valid target is BELOW entry.
    has_target     = (0 < target < entry) if is_short else (target > entry)
    reward_ps      = (entry - target) if is_short else (target - entry)
    reward         = shares * reward_ps if has_target else 0.0
    rr_ratio       = round(reward_ps / risk_per_share, 2) if has_target else 0.0

    # ── Hard rejection rules ──
    # The regime gate is a policy stop, not a sizing failure: CLAUDE.md
    # Section 6 sets position size to 0 against the regime. The position is
    # zeroed, while rr_ratio is left intact so the UI can still show what the
    # trade would have been worth had the regime allowed it.
    blocked_by_regime = (regime_norm == "BULLISH") if is_short else (regime_norm == "BEARISH")
    if blocked_by_regime:
        rejections.append(
            f"{regime_norm} regime — no {side_norm.lower()} entries permitted (position size 0)")
        shares      = 0
        lots        = 0
        risk_amount = 0.0
        risk_pct    = 0.0
        reward      = 0.0

    if risk_pct > 2.05:   # small float buffer
        rejections.append(f"Risk {risk_pct:.2f}% exceeds 2% limit")

    # Suppressed when the regime blocks: the position is 0 by policy, not a wide stop.
    if shares <= 0 and not blocked_by_regime:
        if lot_size > 0:
            # Not "stop too wide" — one whole lot simply costs more risk than
            # the 2% cap allows at this capital. Say which, so the fix is clear.
            one_lot_risk = lot_size * risk_per_share
            rejections.append(
                f"1 lot ({lot_size} shares) risks ₹{one_lot_risk:,.0f} "
                f"({one_lot_risk / capital * 100:.2f}% of capital) — over the 2% cap")
        else:
            rejections.append("Position size rounds to 0 shares — stop too wide")

    # Min R:R by regime (floor computed above)
    if has_target and rr_ratio < min_rr and not blocked_by_regime:
        rejections.append(f"R:R {rr_ratio:.2f} below minimum {min_rr} for {regime_norm} regime")

    # ── Soft warnings ──
    # Suppressed when the regime blocks: 0% risk there is the intended outcome,
    # so "consider a wider stop" would be actively misleading advice.
    if risk_pct < 1.0 and not blocked_by_regime:
        warnings.append(f"Risk {risk_pct:.2f}% is low — consider wider stop or more capital")
    if not has_target:
        warnings.append("No target set — R:R cannot be calculated")
    stop_distance_pct = risk_per_share / entry * 100
    if stop_distance_pct > 5.0:
        side_word = "above" if is_short else "below"
        warnings.append(f"Stop is {stop_distance_pct:.1f}% {side_word} entry — unusually wide")
    if is_short:
        # A short's loss is unbounded in a way a long's is not, and on NSE a
        # cash short must be squared off the same day — only F&O names can be
        # held. The screener flags eligibility; this is the standing reminder.
        warnings.append("SHORT — loss is uncapped above entry; overnight holds need an F&O name")

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
        side=side_norm,
        lots=lots,
        lot_size=max(lot_size, 0),
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
