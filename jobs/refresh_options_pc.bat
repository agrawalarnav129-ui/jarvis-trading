@echo off
REM ============================================================
REM  AXIOM — refresh option-chain snapshot from THIS PC.
REM  Moneycontrol blocks cloud/datacenter IPs (Render, GitHub
REM  Actions), so the snapshot must be fetched from a residential
REM  IP. This script fetches NIFTY+BANKNIFTY and pushes the JSON;
REM  the Render backend serves it via GitHub-raw within ~2 min.
REM
REM  Schedule it during market hours (Mon-Fri, 09:15-15:30 IST),
REM  e.g. every 20 min, via Windows Task Scheduler. See the
REM  register-task command in the chat / README.
REM ============================================================
cd /d "C:\Arnav\Jarvis For Trading"

python -m jobs.run_options_cache
if errorlevel 1 goto :eof

git add data/options_cache.json
git diff --cached --quiet && goto :eof
git -c commit.gpgsign=false commit -m "chore: options snapshot (PC) [skip ci]"
git push origin main
