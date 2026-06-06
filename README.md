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
2. Create a `.env` file using the provided `.env` template (GROQ_API_KEY, TELEGRAM_*).
   Market data uses yfinance + free NSE endpoints — no broker login required.
3. Start the API app:
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```
4. Start the Streamlit dashboard:
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
