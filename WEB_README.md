# AXIOM Web — React + FastAPI + Supabase

A mobile-first web app for the AXIOM trading engine. The Python engine
(screener, indicators, regime, news/market/calendar feeds) is exposed via a
FastAPI backend; a React + Tailwind frontend consumes it.

```
frontend/   React + Vite + TS + Tailwind   → Vercel
backend/    FastAPI (wraps data/ + screener/) → Railway / Render / Fly / Oracle
supabase/   Postgres schema (trades, watchlist, settings) → Supabase
```

The legacy Streamlit `dashboard.py` and the GitHub Actions automation
(briefings, scanner) are unchanged and keep running independently.

## Run locally

**1. Backend** (from repo root):
```bash
pip install -r requirements.txt -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
# → http://localhost:8000/docs
```

**2. Frontend**:
```bash
cd frontend
cp .env.example .env.local        # set VITE_API_URL=http://localhost:8000
npm install
npm run dev                        # → http://localhost:5173
```

## Deploy (free tiers)

### Frontend → Vercel
1. Import the repo, set **Root Directory = `frontend`**.
2. Env vars: `VITE_API_URL` (your backend URL), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Deploy. `vercel.json` handles the SPA rewrites.

### Backend → Railway / Render
1. New service from the repo (root).
2. Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
3. Install: `pip install -r requirements.txt -r backend/requirements.txt`
4. Env vars: copy from `.env` (GROQ_API_KEY, TELEGRAM_*) + `ALLOWED_ORIGINS=https://your-app.vercel.app`
5. (Vercel Python functions are unsuitable — the screener is too heavy/long-running.)

### Database → Supabase
1. Create a project, open the SQL editor, run `supabase/schema.sql`.
2. Copy the project URL + anon key into the frontend env vars.
3. Enable Email auth (or Google) under Authentication.

## API endpoints
`/api/health` · `/api/clock` · `/api/market/indices` · `/api/market/movers` ·
`/api/news` · `/api/calendar` · `/api/fii-dii` · `/api/regime` · `/api/watchlist` ·
`/api/screener`

## Status
- ✅ Dashboard (live indices, regime, FII/DII, breadth, news, gainers/losers, calendar)
- ✅ Screener, Watchlist (live from API)
- ✅ Bottom nav (mobile-first) + live ticking IST clock
- ⏳ Portfolio, Risk, Order Flow, Backtester, Live Scanner, Tasks, Reports, AI Assistant
  — scaffolded as pages; being migrated from Streamlit next.
