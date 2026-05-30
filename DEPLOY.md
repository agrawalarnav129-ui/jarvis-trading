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

| Job | IST | UTC cron | Fyers login? | Data |
|---|---|---|---|---|
| Heartbeat + Morning Briefing | 08:30 | `0 3 * * 1-5` | yes | Fyers→yfinance |
| Pre-Market Tasks | 09:15 | `45 3 * * 1-5` | yes | Fyers→yfinance |
| Intraday Scanner | every 15 min, 09:30–15:15 | `*/15 4-9 * * 1-5` | **no** | yfinance |
| Post-Market Summary | 15:35 | `5 10 * * 1-5` | no | — |

> The intraday scanner uses yfinance, so it needs **no Fyers login** — TOTP runs
> only 3×/day max, which is safe.

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
| `FYERS_CLIENT_ID` | e.g. `ABCD1234-100` |
| `FYERS_SECRET_KEY` | app secret |
| `FYERS_REDIRECT_URI` | registered redirect URL |
| `FYERS_FY_ID` | login id, e.g. `XA12345` |
| `FYERS_PIN` | 4-digit trading PIN |
| `FYERS_TOTP_SECRET` | **TOTP base32 secret** (see below) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USERNAME` `SMTP_PASSWORD` | email |
| `EMAIL_RECIPIENT` | where briefings are emailed |
| `TELEGRAM_BOT_TOKEN` `TELEGRAM_CHAT_ID` | alerts |

> Never commit `.env`. It stays local; CI reads from Secrets.

### 3. Capture your Fyers `FYERS_TOTP_SECRET`
When you enable 2FA/TOTP on Fyers, it shows a QR code. The **base32 secret** behind
that QR (the `secret=...` value, or the manual-entry key) is what goes into
`FYERS_TOTP_SECRET`. Test locally:
```bash
python -m tools.fyers_auto_login   # should print "Fyers token refreshed (headless)"
```

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
