# JARVIS NSE Trading Agent

A modular Python trading automation project for NSE trading.

## Overview
This project uses:
- Python for data, trading logic, and service orchestration
- FastAPI for the web service
- APScheduler for scheduled briefings and summaries
- Hugging Face inference API for the AI brain
- SQLite for journaling and task storage

## Run locally
1. Install dependencies:
   ```bash
   python -m pip install -r requirements.txt
   ```
2. Create a `.env` file using the provided `.env` template.
3. Generate the Fyers access token:
   ```bash
   python tools/fyers_oauth.py
   ```
   - This script prints the authorization URL
   - Login through Fyers
   - paste the final redirect URL from the browser
   - it will exchange the code and save `FYERS_ACCESS_TOKEN` to `.env`
4. Start the API app:
   ```bash
   uvicorn app:app --host 0.0.0.0 --port 8000
   ```
5. Start the Streamlit dashboard:
   ```bash
   streamlit run dashboard.py
   ```

## API Endpoints
- `GET /health`
- `GET /universe`
- `POST /screener` with `{ "symbols": ["TCS.NS"] }`
- `GET /screener/latest`
- `GET /briefing`
- `POST /trades`
- `GET /trades`
- `GET /reports/weekly`
- `POST /tasks`
- `GET /tasks`

## Render Deployment
Use the existing `Procfile` and set environment variables in Render.
