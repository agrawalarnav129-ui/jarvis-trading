# Deploy AXIOM Web — Vercel + Render + Supabase (free)

```
React (frontend)  → Vercel       (free)
FastAPI (backend) → Render        (free web service)
Postgres + Auth   → Supabase      (free, optional — localStorage works without it)
```

Repo: **github.com/agrawalarnav129-ui/jarvis-trading** (already pushed).
Each step below needs *your* browser login (OAuth) — that part can't be automated.

---

## 1. Backend → Render (do this first; you need its URL for the frontend)

1. Go to **[render.com](https://render.com)** → sign in with GitHub.
2. **New → Blueprint** → pick the `jarvis-trading` repo. Render reads **`render.yaml`** and proposes the **axiom-api** web service.
3. Click **Apply**. When prompted, set the env vars (values from your local `.env`):
   - `GROQ_API_KEY`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   - *(skip `ALLOWED_ORIGINS` → CORS defaults to allow-all, fine for a personal app)*
4. Deploy. First build takes ~3–5 min. When live you get a URL like
   **`https://axiom-api.onrender.com`** — test it: open `…/api/health` → `{"status":"ok"}`.

> **Cold-start note:** Render's free tier sleeps after 15 min idle (~50s wake-up).
> Since you already use **cron-job.org**, add one more job: GET
> `https://axiom-api.onrender.com/api/health` every 14 min (07:00–16:00 IST) to keep it warm during market hours.

## 2. Frontend → Vercel

1. Go to **[vercel.com](https://vercel.com)** → sign in with GitHub → **Add New → Project** → import `jarvis-trading`.
2. **Root Directory:** set to **`frontend`** (important).
3. Framework preset auto-detects **Vite**. Build/output are handled by `frontend/vercel.json`.
4. **Environment Variables:**
   - `VITE_API_URL` = your Render URL (e.g. `https://axiom-api.onrender.com`)
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` *(optional — only if using Supabase)*
5. **Deploy.** You get a URL like **`https://axiom-xxxx.vercel.app`** — open it on your phone.

## 3. Database → Supabase (optional — for cloud trade journal)

Without this, the Trade Journal persists in the browser (localStorage). To sync across devices:
1. **[supabase.com](https://supabase.com)** → New project.
2. **SQL Editor** → paste & run **`supabase/schema.sql`** (creates trades/watchlist/settings + RLS).
3. **Authentication → Providers** → enable **Email** (or Google).
4. Copy **Project URL** + **anon key** → add as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in Vercel → redeploy.

---

## Verify
- `https://axiom-api.onrender.com/api/health` → ok
- Open the Vercel URL → Dashboard loads live indices/news, clock ticks, bottom nav works.
- If the dashboard is blank, check the browser console — usually `VITE_API_URL` is wrong or the backend is cold (wait 50s, refresh).

## Notes
- The **Streamlit app + GitHub Actions automation are untouched** and keep running.
- CORS defaults to allow-all (public market data, no auth cookies) — set `ALLOWED_ORIGINS`
  to your Vercel domain on Render if you want to lock it down.
- Free tiers are enough for personal use. Heavy endpoints (screener, backtest) take
  30–60s on the free CPU — that's expected.
