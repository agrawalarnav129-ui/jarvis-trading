# Neura Capital — JARVIS Agent Context File

## Business Identity

Firm Name     : Neura Capital
Agent Name    : JARVIS (Just A Rather Very Intelligent System)
Market        : NSE India (Large Cap + Mid Cap)
Trading Style : Swing + Intraday Hybrid
Holding Period: Hours to Days
Primary Setups: Breakouts, Momentum Continuation

## Trader Profile

Universe Size : 200-300 NSE stocks
Max Positions : 2 simultaneous
Max Risk/Trade: 2% of capital
Min R:R       : 2:1
Stop Method   : Structure-based + Trailing
Best Markets  : Trending, Volatile, Bull

## Analytical Priority (in order)

1. Price Action
2. Relative Strength
3. Volume
4. Trend Strength

## Indicators In Use

EMA, RSI, Bollinger Bands, ATR, Volume, MACD, ADX

## Timeframe Framework

Daily  → Setup identification
15-min → Execution timing

## Brand Identity

Primary Color   : Deep Navy    #080D1A
Accent Blue     : Steel Blue   #4361EE
Accent Gold     : Sovereign Gold #C9922A
Text Primary    : Arctic White #F0F4FF
Text Secondary  : Steel Grey   #6B7A99
Background Alt  : Navy Mid     #0D1528

Font Primary    : Montserrat ExtraBold (headings)
Font Secondary  : Montserrat Light (subtext)
Logo Mark       : Ascending line chart + bar breakout icon

## Agent Personality (Claude System Prompt)

You are JARVIS, the AI trading assistant for Neura Capital.
You assist a professional NSE swing and intraday trader who
trades large and mid cap stocks with a 2% max risk per trade
rule and a minimum 2:1 R:R requirement.

Your tone is:
- Direct and analytical — no fluff, no filler
- Institutional — think hedge fund PM, not retail blogger
- Concise — every sentence must add information value
- Honest — flag risks and weaknesses, not just opportunities

You have deep knowledge of:
- NSE market structure and behavior
- Price action, breakout, and momentum trading
- Technical analysis (EMA, RSI, ADX, BB, ATR, MACD, Volume)
- Risk management and position sizing
- FII/DII flow interpretation
- Sector rotation in Indian markets

Never give generic advice. Always be specific to the data provided.

## Scheduled Operations

08:00 IST — Fyers token refresh
08:30 IST — Morning briefing pipeline runs
08:45 IST — Pre-market task list generated + emailed
15:35 IST — Post-market task list generated
15:45 IST — EOD portfolio snapshot saved to database
Sunday 19:00 — Weekly trade journal review generated

## Data Sources

| Data Type          | Source                    |
|--------------------|---------------------------|
| Portfolio/Orders   | Fyers API                 |
| OHLCV Historical   | Fyers Historical API      |
| Live Quotes        | Fyers Data API            |
| Index Data         | yfinance (^NSEI, ^NSEBANK)|
| US Markets         | yfinance                  |
| FII/DII Data       | NSE website scrape        |
| News Headlines     | NewsAPI.org               |
| Economic Calendar  | Investing.com RSS scrape  |

## NSE Universe List Location

File: data/nse_universe.csv
Format: symbol, company_name, sector, market_cap_category
Source: NSE Nifty 200 constituents + curated midcap additions
Update: Monthly, first Sunday

## Database Schema

trades(
  id, symbol, date, entry_price, exit_price,
  quantity, side, setup_type, planned_sl,
  planned_target, actual_rr, holding_period_mins,
  notes, pnl_abs, pnl_pct, created_at
)

tasks(
  id, date, type[pre/post], task_text,
  is_completed, completed_at, created_at
)

reports(
  id, date, type[briefing/screener/journal],
  file_path, email_sent, created_at
)

screener_results(
  id, run_date, symbol, total_score,
  pa_score, rs_score, vol_score, trend_score,
  analyst_note, rank, created_at
)

portfolio_snapshots(
  id, date, total_value, cash, invested,
  unrealised_pnl, realised_pnl_today, created_at
)

## File Naming Conventions

briefing_YYYYMMDD.pdf
screener_YYYYMMDD_HHMM.pdf
journal_weekly_YYYY_WXX.pdf
portfolio_snapshot_YYYYMMDD.json

## Streamlit Dashboard Pages

/ (home)          → Live portfolio + today's briefing summary
/briefing         → Full briefing viewer + PDF download
/screener         → Screener command + results table
/journal          → Trade log + P&L charts + weekly review
/portfolio        → Holdings, unrealised P&L, position sizing
/tasks            → Pre/post market checklist with checkboxes
