# AXIOM — NSE Trading Intelligence

A trading research and automation system for NSE: a Python screening/analytics
engine, a FastAPI service over it, a React front end, and scheduled jobs that
keep the whole thing running without a server.

## Architecture

```
data/        OHLCV + fundamentals + news, served from committed gzip caches
screener/    TA engine, 5-factor scorer, market-regime classifier
analytics/   quant lab (GEX, vol cones, RRG), footprint, paper trading
risk/        position sizing — the single source of truth for the 2% rule
ai/          Groq-backed briefings, commentary and the assistant
backend/     FastAPI, exposes the engine at /api/*          → Render
frontend/    React + Vite + Tailwind                        → Vercel
jobs/        entry points invoked by GitHub Actions on cron
.github/     the scheduler: briefings, intraday scans, cache builds
```

The caches in `data/` are the reason this runs on free tiers. GitHub Actions
rebuilds them after market close and commits them; the backend loads them into
memory, so the screener answers from RAM instead of hitting yfinance per request.

## Run locally

Install:

```bash
python -m pip install -r requirements.txt -r backend/requirements.txt
```

Copy `.env.example` to `.env` and set `GROQ_API_KEY` and the `TELEGRAM_*` keys.
Market data comes from yfinance and free NSE endpoints — no broker login.

Backend (from the repo root):

```bash
uvicorn backend.main:app --reload --port 8000
```

Front end:

```bash
cd frontend && cp .env.example .env.local && npm install && npm run dev
```

Tests:

```bash
python -m pytest
```

## API

`backend/main.py` serves everything under `/api/`. Browse the live list at
`http://localhost:8000/docs`; the ones worth knowing:

| Endpoint | Purpose |
|---|---|
| `GET /api/health`, `/api/clock` | liveness, IST market clock |
| `GET /api/regime` | BULLISH / NEUTRAL / BEARISH classification |
| `GET /api/screener`, `/api/scan/builder` | ranked candidates, custom scans |
| `POST /api/risk` | position sizing (wraps `risk/risk.py`) |
| `GET /api/quant/*` | GEX, vol cone, expectancy surface, RRG |
| `POST /api/assistant` | Groq assistant |

## Deployment

- **Backend** → Render, via `render.yaml` (or the `Procfile`; both point at
  `backend.main:app`).
- **Front end** → Vercel, root directory `frontend`. See `DEPLOY_WEB.md`.
- **Database** → Supabase, schema in `supabase/schema.sql`.
- **Scheduling** → GitHub Actions. `DEPLOY.md` covers running `scheduler.py`
  on a always-on box instead, if you want tighter intraday timing than cron gives.

## Also in here

- `dashboard.py` — the original Streamlit UI. Superseded by `frontend/`, but
  still runnable with `streamlit run dashboard.py`.
- `CLAUDE.md` — the trading rulebook and coding standards this repo is held to.
- `workflows/`, `tools/` — WAT workflow definitions and standalone scripts.
