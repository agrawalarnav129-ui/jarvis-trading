# JARVIS — Free Always-On Deployment Guide

Run all automation **for free, even when your PC is off**, using GitHub Actions
(serverless cron). Your machine never needs to be on.

## Architecture

| Layer | Host | Cost | Notes |
|---|---|---|---|
| Automation (briefing, tasks, scanner, token refresh) | **GitHub Actions** | Free | Serverless cron — fires whether or not your PC is on |
| Dashboard UI | **Streamlit Community Cloud** (optional) | Free | Sleeps when idle, wakes on open |
| Secrets | **GitHub Encrypted Secrets** | Free | Safe even in a private repo |
| Dedup state | Committed to repo (`data/state/`) | Free | Survives across serverless runs |

Outputs go to **Telegram + Email (PDF)** — already configured.

## Schedule (all Mon–Fri, IST)

| Job | IST | UTC cron | Data |
|---|---|---|---|
| Heartbeat + Morning Briefing | 08:30 | `3 3 * * 1-5` | yfinance + free NSE |
| Pre-Market Tasks | 09:15 | `47 3 * * 1-5` | yfinance |
| Intraday Scanner | every 15 min, 09:30–15:15 | `*/15 4-9 * * 1-5` | yfinance |
| Post-Market Summary | 15:35 | `7 10 * * 1-5` | — |

> All data comes from free sources (yfinance + public NSE endpoints) — no broker
> login required. For on-time delivery, trigger via repository_dispatch from
> cron-job.org (see below) — GitHub's own cron runs late.

## One-Time Setup

### 1. Push the repo to GitHub (keep it **private**)
```bash
git init && git add . && git commit -m "JARVIS automation"
gh repo create jarvis-trading --private --source=. --push
```

### 2. Add GitHub Secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**.
Add each of these (values from your local `.env`):

| Secret | Purpose |
|---|---|
| `GROQ_API_KEY` | AI briefing/commentary |
| `TELEGRAM_BOT_TOKEN` `TELEGRAM_CHAT_ID` | briefing + PDF delivery |

> Never commit `.env`. It stays local; CI reads from Secrets. Briefings and PDFs
> are delivered via Telegram (no email/broker credentials needed).

### 4. Verify
- Actions tab → run **Morning Briefing** manually (`workflow_dispatch`).
- You should get a Telegram heartbeat, a briefing message, and an email PDF.
- A daily heartbeat that **stops arriving = something broke** → check Actions logs.

### 5. (Optional) Dashboard on Streamlit Cloud
- share.streamlit.io → New app → point to `dashboard.py`.
- Add the same secrets under the app's **Secrets** settings.

## Caveats (be aware)
- **Cron is best-effort**: GitHub may start jobs 5–15 min late under load. Fine for
  briefings and 15-min swing alerts; not for second-precise execution.
- **Free minutes**: private repo = 2,000 min/month. Current schedule (~15-min intraday)
  fits comfortably. Need every-5-min? Make the repo public (unlimited free minutes;
  secrets stay encrypted) and change the intraday cron to `*/5`.
- **Watchlist** drives the intraday scan. Populate it from the dashboard (saves to DB)
  or maintain a committed `data/watchlist.csv`.

## ⏰ Reliable on-time delivery (fixing GitHub's cron delay)

GitHub's scheduled cron is **best-effort** and frequently runs **1–5 hours late**
at busy times — so an 08:30 briefing can arrive at 12–1 PM. The workflows now also
accept a **`repository_dispatch`** trigger, so a reliable free external cron can
fire them exactly on time.

### Free fix — cron-job.org (≈5 min, fires within seconds of schedule)
1. Create a free account at **cron-job.org**.
2. Create a **GitHub fine-grained PAT** with `repo` + `actions` (or classic `repo`)
   scope (github.com/settings/tokens). Copy it.
3. In cron-job.org, create 3 jobs. For each:
   - **URL:** `https://api.github.com/repos/agrawalarnav129-ui/jarvis-trading/dispatches`
   - **Method:** POST
   - **Headers:**
     `Authorization: Bearer <YOUR_PAT>` ·
     `Accept: application/vnd.github+json`
   - **Body** (one per job):
     - Briefing: `{"event_type":"morning-briefing"}`  → schedule **08:30 IST**
     - Pre-market: `{"event_type":"pre-market"}`     → schedule **09:15 IST**
     - Post-market: `{"event_type":"post-market"}`   → schedule **15:35 IST**
   - Set the job timezone to **Asia/Kolkata**.
4. Done — jobs now fire on time; the GitHub cron stays as a backup.

> The intraday scanner stays on GitHub's `*/15` cron (a few minutes' drift on
> intraday alerts is fine).

## Alternative: true 24/7 (Oracle Cloud Always Free)
For reliable every-5-min scanning with no cron looseness, run `scheduler.py` on an
**Oracle Cloud Always Free** VM (free forever) under `systemd`:
```ini
# /etc/systemd/system/jarvis.service
[Service]
WorkingDirectory=/home/ubuntu/jarvis
ExecStart=/home/ubuntu/jarvis/.venv/bin/python scheduler.py
Restart=always
Environment=TZ=Asia/Kolkata
[Install]
WantedBy=multi-user.target
```
`sudo systemctl enable --now jarvis` — done. SQLite works (real disk), no ephemeral-FS problem.
