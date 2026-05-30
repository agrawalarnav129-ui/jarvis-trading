# Project Initialization Workflow

## Objective
Initialize the trading automation project structure using the existing CLAUDE.md system definition.

## Required Files and Directories
- `config.py`
- `data/`
- `screener/`
- `scorer/`
- `risk/`
- `backtest/`
- `reports/`
- `utils/`
- `tests/`
- `workflows/`
- `tools/`
- `.tmp/`

## Notes
- All constants must live in `config.py`.
- All TA logic should be implemented in `utils/indicators.py`.
- Paths should use `pathlib.Path`.
- `.env` must store any credentials or secrets.
