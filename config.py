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
MIN_AVG_VOLUME    = 500_000
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
