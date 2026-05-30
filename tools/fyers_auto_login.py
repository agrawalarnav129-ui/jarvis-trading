"""
AXIOM — Fyers HEADLESS auto-login (TOTP).
=========================================
Fully unattended daily token refresh — no browser, no manual paste. Run this as
the 08:00 IST job so the access token is always fresh before market open.

It reuses exchange_auth_code() / appIdHash logic from fyers_token_refresh.py
(the interactive tool) for the final code->token exchange.

Flow (Fyers vagator v2 + v3):
  1. send_login_otp (fy_id)        -> request_key
  2. verify_otp     (TOTP now)     -> request_key
  3. verify_pin     (PIN)          -> login access_token
  4. /api/v3/token  (auth)         -> auth_code
  5. validate-authcode             -> API access_token  (reused helper)

Required env vars (.env locally / GitHub Secrets in CI):
  FYERS_CLIENT_ID   e.g. "ABCD1234-100"
  FYERS_SECRET_KEY  app secret
  FYERS_REDIRECT_URI registered redirect URL
  FYERS_FY_ID       login id, e.g. "XA12345"
  FYERS_PIN         4-digit trading PIN
  FYERS_TOTP_SECRET TOTP base32 secret (captured when enabling 2FA)

On success: writes FYERS_ACCESS_TOKEN to .env and to $GITHUB_ENV (if in CI).
"""
from __future__ import annotations

import base64
import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pyotp
import requests
from dotenv import load_dotenv
from loguru import logger

ENV_PATH = Path(__file__).parent.parent / ".env"
load_dotenv(ENV_PATH, override=True)

from tools.fyers_token_refresh import exchange_auth_code, save_token_to_env  # reuse

SEND_OTP_URL   = "https://api-t2.fyers.in/vagator/v2/send_login_otp"
VERIFY_OTP_URL = "https://api-t2.fyers.in/vagator/v2/verify_otp"
VERIFY_PIN_URL = "https://api-t2.fyers.in/vagator/v2/verify_pin"
TOKEN_URL      = "https://api-t1.fyers.in/api/v3/token"


def _b64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


def _require(name: str) -> str:
    val = os.getenv(name, "").strip()
    if not val:
        logger.error("Missing required env var: {}", name)
        sys.exit(2)
    return val


def fetch_auth_code() -> str:
    """Run the headless TOTP login and return a fresh auth_code."""
    fy_id    = _require("FYERS_FY_ID")
    pin      = _require("FYERS_PIN")
    totp_key = _require("FYERS_TOTP_SECRET")
    client_id = _require("FYERS_CLIENT_ID")
    redirect  = _require("FYERS_REDIRECT_URI")

    # 1) send login OTP
    r = requests.post(SEND_OTP_URL, json={"fy_id": _b64(fy_id), "app_id": "2"}, timeout=30)
    r.raise_for_status()
    request_key = r.json()["request_key"]
    logger.info("Step 1/4 — login OTP requested")

    # 2) verify TOTP
    otp = pyotp.TOTP(totp_key).now()
    r = requests.post(VERIFY_OTP_URL, json={"request_key": request_key, "otp": otp}, timeout=30)
    r.raise_for_status()
    request_key = r.json()["request_key"]
    logger.info("Step 2/4 — TOTP verified")

    # 3) verify PIN -> login token
    r = requests.post(
        VERIFY_PIN_URL,
        json={"request_key": request_key, "identity_type": "pin", "identifier": _b64(pin)},
        timeout=30,
    )
    r.raise_for_status()
    login_token = r.json()["data"]["access_token"]
    logger.info("Step 3/4 — PIN verified")

    # 4) request auth_code
    app_short, app_type = (client_id.split("-") + ["100"])[:2]
    headers = {"authorization": f"Bearer {login_token}", "content-type": "application/json"}
    payload = {
        "fyers_id": fy_id, "app_id": app_short, "redirect_uri": redirect,
        "appType": app_type, "code_challenge": "", "state": "sample",
        "scope": "", "nonce": "", "response_type": "code", "create_cookie": True,
    }
    r = requests.post(TOKEN_URL, headers=headers, json=payload, timeout=30)
    r.raise_for_status()
    redirect_url = r.json()["Url"]
    auth_code = parse_qs(urlparse(redirect_url).query)["auth_code"][0]
    logger.success("Step 4/4 — auth_code obtained")
    return auth_code


def _export_to_github_env(token: str) -> None:
    gh_env = os.getenv("GITHUB_ENV")
    if gh_env:
        with open(gh_env, "a", encoding="utf-8") as fh:
            fh.write(f"FYERS_ACCESS_TOKEN={token}\n")
        logger.info("FYERS_ACCESS_TOKEN exported to GITHUB_ENV")


def main() -> None:
    client_id = _require("FYERS_CLIENT_ID")
    secret    = _require("FYERS_SECRET_KEY")
    try:
        auth_code = fetch_auth_code()
        token = exchange_auth_code(client_id, secret, auth_code)
    except Exception as exc:
        logger.exception("Headless Fyers login FAILED: {}", exc)
        try:
            from monitors.telegram_bot import send_message
            send_message(f"⚠️ <b>Fyers auto-login FAILED</b>\n<code>{str(exc)[:300]}</code>")
        except Exception:
            pass
        sys.exit(1)

    save_token_to_env(token)
    _export_to_github_env(token)
    logger.success("Fyers token refreshed (headless) — ...{}", token[-6:])


if __name__ == "__main__":
    main()
