---
name: neura-capital-jarvis-agent
description: >
  Complete workflow skill for the Neura Capital AI Trading Agent (JARVIS).
  Use when building, extending, or debugging any module — market briefings,
  stock screener, trade journal, portfolio tracker, or task manager.
version: 1.0.0
author: Neura Capital
---

# Neura Capital JARVIS Agent — Master Skill

## System Overview

JARVIS is an always-on AI trading assistant deployed on Railway.app,
built in Python, powered by Claude API, connected to Fyers API.

Produces:
1. Daily Market Briefing PDF — auto 8:30 AM IST
2. Stock Screener Reports — on-demand via dashboard
3. Trade Journal + P&L Analysis — auto + manual
4. Pre/Post Market Task Checklists — auto 8:45 AM + 3:35 PM IST

---

## Project File Structure

```
neura-capital/
├── main.py
├── config.py
├── requirements.txt
├── .env
├── data/
│   ├── fyers_client.py
│   ├── market_data.py
│   ├── news_feed.py
│   └── screener_engine.py
├── ai/
│   ├── claude_client.py
│   ├── briefing_prompt.py
│   ├── screener_prompt.py
│   └── journal_prompt.py
├── outputs/
│   ├── pdf_generator.py
│   ├── email_sender.py
│   └── reports/
├── modules/
│   ├── morning_briefing.py
│   ├── screener.py
│   ├── trade_journal.py
│   └── task_manager.py
├── database/
│   ├── db.py
│   ├── models.py
│   └── jarvis.db
└── dashboard/
    ├── app.py
    ├── pages/
    │   ├── briefing.py
    │   ├── screener.py
    │   ├── journal.py
    │   ├── portfolio.py
    │   └── tasks.py
    └── components/
        ├── charts.py
        ├── tables.py
        └── sidebar.py
```

---

## Module 1 — Morning Briefing

Trigger: APScheduler, weekdays 08:30 IST

Pipeline:
1. Fetch Gift Nifty pre-market data
2. Fetch US market close (Dow, S&P, Nasdaq, VIX)
3. Fetch NSE previous session data
4. Fetch FII/DII net activity
5. Fetch top gainers + losers
6. Fetch sector performance
7. Fetch economic calendar
8. Fetch top news headlines
9. Send to Claude API → get narrative briefing
10. Generate PDF → email → push to dashboard

Claude Prompt Template:
```
You are JARVIS, AI trading assistant for Neura Capital.
Write a professional pre-market briefing for an NSE swing/intraday trader.
DATA: {raw_market_data_json}
OUTPUT:
1. Market Pulse (global sentiment, 2-3 sentences)
2. Nifty Outlook (key levels, bias)
3. Sector Watch (top 2 sectors)
4. FII/DII Signal (institutional flow interpretation)
5. Stocks on Radar (top 3 setups)
6. Key Risk Events Today
7. JARVIS Verdict (Bull/Bear/Neutral, 1 sentence)
Tone: Direct, analytical, institutional. No fluff.
```

---

## Module 2 — Stock Screener

Trigger: On-demand via dashboard

Scoring (out of 100):
- Price Action Score  : 0-25 pts
- Relative Strength  : 0-25 pts
- Volume Score       : 0-25 pts
- Trend Score        : 0-25 pts

Filter threshold: Score >= 65, ADX > 20, RSI 50-75

Scoring logic:
```python
def score_stock(df, benchmark_df):
    pa  = price_action_score(df)      # near 52W high, breakout candle
    rs  = relative_strength(df, benchmark_df)  # vs Nifty50
    vol = volume_score(df)            # vs 20D avg volume
    tr  = trend_score(df)             # EMA stack, ADX, RSI zone
    return round(pa + rs + vol + tr, 2)
```

---

## Module 3 — Trade Journal

Fields per trade:
symbol, date, entry_price, exit_price, qty, side,
setup_type, planned_sl, planned_target, actual_rr,
holding_period_mins, notes, pnl_abs, pnl_pct

Weekly Claude Review Prompt:
```
Analyze last 20 trades. Identify:
1. Win rate by setup type
2. Best performing day of week
3. Avg R:R planned vs achieved
4. Top behavioral pattern hurting performance
5. One specific improvement for next week
Data: {trades_json}
Be direct. Think like a hedge fund risk manager.
```

---

## Module 4 — Task Manager

Pre-Market (08:45): Review watchlist, check global cues,
verify open position gaps, confirm setups still valid,
note key levels for the day.

Post-Market (15:35): Log trades, review execution,
update watchlist, rate discipline 1-10, note one lesson.

---

## Tech Stack

| Component    | Tool                  |
|--------------|-----------------------|
| Language     | Python 3.11+          |
| AI Engine    | Claude API (Sonnet 4) |
| Broker       | fyers-apiv3           |
| Market Data  | yfinance              |
| News         | newsapi-python        |
| Scheduler    | APScheduler 3.10      |
| PDF          | reportlab 4.x         |
| Email        | smtplib               |
| Dashboard    | Streamlit 1.35+       |
| Database     | SQLite3               |
| Charts       | Plotly 5.x            |
| Hosting      | Railway.app           |

---

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
FYERS_APP_ID=
FYERS_SECRET_KEY=
FYERS_ACCESS_TOKEN=
EMAIL_SENDER=
EMAIL_PASSWORD=
EMAIL_RECIPIENT=
NEWS_API_KEY=
TZ=Asia/Kolkata
UNIVERSE_CSV=data/nse_universe.csv
DB_PATH=database/jarvis.db
```

---

## Deployment — Railway.app

1. Push to GitHub private repo
2. Connect Railway to repo
3. Add env vars in Railway dashboard
4. Start command: streamlit run dashboard/app.py --server.port $PORT
5. Worker: python main.py (for scheduler)
6. Auto-deploy on git push

---

## Failure Points

| Risk                  | Mitigation                              |
|-----------------------|-----------------------------------------|
| Fyers token expiry    | Auto-refresh script at 8:00 AM IST      |
| yfinance gaps         | Fallback to Fyers historical API        |
| Claude API timeout    | Retry with exponential backoff x3       |
| PDF generation fail   | Plain text email fallback               |
| Market holiday        | NSE calendar check before module runs   |

---

## KPIs

- Briefing delivery rate: target 100%
- Screener run time: target <90s for 250 stocks
- Claude API cost: budget Rs 2000/month
- Journal entries per week: target 100% of trades logged
- Task completion rate: target >80%
