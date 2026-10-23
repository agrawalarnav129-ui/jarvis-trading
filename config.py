from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"
UNIVERSE_CSV = DATA_DIR / "universe.csv"
# Committed watchlist (serverless fallback — DB is ephemeral on CI runners)
WATCHLIST_CSV = DATA_DIR / "watchlist.csv"
STATE_DIR = DATA_DIR / "state"

REQUIREMENTS = [
    "pandas>=2.0",
    "numpy>=1.25",
    "yfinance>=0.2.40",
    "requests>=2.31",
    "python-dotenv>=1.0",
    "schedule>=1.2",
    "loguru>=0.7",
    "pytest>=7.4",
]

# ── SCREENER FILTERS ──────────────────────────────────────────────
# Liquidity: on NSE rupee turnover is the real tradeability test, because share
# prices span ₹50–₹150k, so a share-count floor excludes liquid large caps whose
# share count is low only because their price is high — MARUTI and ULTRACEMCO
# both trade under 500k shares/day on ₹300cr+ of turnover.
# Measured end-to-end against the OHLCV cache, on the Jul-2026 and Oct-2026
# snapshots alike: a 500k share floor wrongly drops ~140 liquid names, while this
# ₹5cr turnover gate drops 40–50 genuinely thin ones, some scoring well enough to
# be presented as tradeable setups. Which names those are churns as stocks
# re-rate, so treat the counts as orders of magnitude, not fixed facts.
# So turnover is the gate and MIN_AVG_VOLUME is only an absolute floor, set low
# enough to drop zero liquid names — it currently rejects none on its own.
MIN_TURNOVER_CR   = 5.0        # ₹ crore/day, 20D avg — primary liquidity gate
MIN_AVG_VOLUME    = 5_000      # shares/day, 20D avg — absolute zombie floor
MIN_PRICE         = 50.0
MIN_ATR_PCT       = 0.01
MAX_ATR_PCT       = 0.06
MIN_ADX           = 18
EMA_ALIGNMENT     = True
ABOVE_EMA200      = True
VOLUME_CONFIRM    = 1.5
BREAKOUT_LOOKBACK = 20   # bars for range-high detection

# ── INDICATOR PARAMETERS ──────────────────────────────────────────
EMA_PERIODS       = [9, 21, 50, 200]
EMA_SLOPE_BARS    = 5        # bars for EMA21 slope delta
RSI_PERIOD        = 14
BB_PERIOD         = 20
BB_STD_DEV        = 2
ATR_PERIOD        = 14
MACD_FAST         = 12
MACD_SLOW         = 26
MACD_SIGNAL       = 9
ADX_PERIOD        = 14
VOLUME_SMA_PERIOD = 20

# ── SCORING WEIGHTS (must sum to 1.0) ─────────────────────────────
# Matches the NSE Scanner scoring engine exactly
SCORE_WEIGHTS = {
    "price_action":   0.30,
    "trend_strength": 0.25,
    "rel_strength":   0.20,
    "momentum":       0.15,
    "volume":         0.10,
}

# Grade thresholds
GRADE_A_MIN = 75
GRADE_B_MIN = 55

# ── RISK ──────────────────────────────────────────────────────────
CAPITAL_RISK_PCT      = 0.02
MAX_POSITION_RISK_PCT = 0.02
MAX_DAILY_RISK_PCT    = 0.04

SUPPORTED_TIMEFRAMES = ["daily", "15m"]
