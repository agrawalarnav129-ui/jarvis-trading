"""
AXIOM — Fyers Token Refresh
=============================
Run this script every morning before market opens to get a fresh access token.
It will:
  1. Open the Fyers login URL in your browser
  2. Ask you to paste the auth_code from the redirect URL
  3. Exchange it for an access token
  4. Save the token to .env automatically

Usage:
    python tools/fyers_token_refresh.py
"""
from __future__ import annotations

import base64
import hashlib
import os
import re
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv, set_key

ENV_PATH = Path(__file__).parent.parent / ".env"
load_dotenv(ENV_PATH)

APP_ID       = os.getenv("FYERS_CLIENT_ID", "")
SECRET_KEY   = os.getenv("FYERS_SECRET_KEY", "")
REDIRECT_URI = os.getenv("FYERS_REDIRECT_URI", "https://trade.fyers.in/api-login/redirect-uri/index.html")


def _app_id_prefix(app_id: str) -> str:
    """Extract just the app ID part before any '-100' suffix."""
    return app_id.split("-")[0] if "-" in app_id else app_id


def get_auth_url(app_id: str, redirect_uri: str) -> str:
    """Build Fyers v3 OAuth URL."""
    return (
        f"https://api-t2.fyers.in/api/v3/generate-authcode"
        f"?client_id={app_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&state=jarvis"
    )


def exchange_auth_code(app_id: str, secret_key: str, auth_code: str) -> str:
    """Exchange auth code for access token using Fyers v3 API."""
    # Fyers appIdHash = SHA-256(app_id + ":" + secret_key)
    raw = f"{app_id}:{secret_key}"
    app_id_hash = hashlib.sha256(raw.encode()).hexdigest()

    url = "https://api-t2.fyers.in/api/v3/validate-authcode"
    payload = {
        "grant_type":  "authorization_code",
        "appIdHash":   app_id_hash,
        "code":        auth_code,
    }
    resp = requests.post(url, json=payload, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data.get("s") != "ok":
        raise ValueError(f"Token exchange failed: {data.get('message', data)}")
    return data["access_token"]


def save_token_to_env(token: str) -> None:
    """Write FYERS_ACCESS_TOKEN to .env file."""
    set_key(str(ENV_PATH), "FYERS_ACCESS_TOKEN", token)
    print(f"✓ Token saved to {ENV_PATH}")


def main() -> None:
    print("=" * 60)
    print("  AXIOM — Fyers Token Refresh")
    print("=" * 60)

    if not APP_ID:
        print("ERROR: FYERS_CLIENT_ID not set in .env")
        sys.exit(1)
    if not SECRET_KEY:
        print("ERROR: FYERS_SECRET_KEY not set in .env")
        sys.exit(1)

    print(f"\nApp ID   : {APP_ID}")
    print(f"Redirect : {REDIRECT_URI}")

    auth_url = get_auth_url(APP_ID, REDIRECT_URI)
    print(f"\nStep 1 — Copy this URL and open it in your browser (Chrome/Edge):")
    print(f"\n  {auth_url}\n")
    print("Step 2 — Log in to Fyers with your credentials.")
    print("Step 3 — After login you will be redirected to a URL like:")
    print(f"  {REDIRECT_URI}?code=<AUTH_CODE>&state=jarvis\n")
    print("Step 4 — Copy that full redirect URL and paste it below.")
    print("(If the redirect page shows an error, that's fine — just copy the URL from the address bar)\n")

    user_input = input("Paste URL or auth_code: ").strip()

    # Extract code from URL if user pasted the full redirect URL
    if "code=" in user_input:
        match = re.search(r"code=([^&]+)", user_input)
        if not match:
            print("ERROR: Could not extract code from URL")
            sys.exit(1)
        auth_code = match.group(1)
    else:
        auth_code = user_input

    print(f"\nExchanging auth code for access token...")
    try:
        token = exchange_auth_code(APP_ID, SECRET_KEY, auth_code)
    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)

    print(f"✓ Access token received (length: {len(token)})")
    save_token_to_env(token)

    # Verify it works
    print("\nVerifying token against Fyers /profile...")
    headers = {"Authorization": f"{APP_ID}:{token}"}
    try:
        resp = requests.get("https://api-t1.fyers.in/api/v3/profile", headers=headers, timeout=10)
        data = resp.json()
        if data.get("s") == "ok":
            name = data.get("data", {}).get("name", "Unknown")
            email = data.get("data", {}).get("email_id", "")
            print(f"✓ Authenticated as: {name} ({email})")
        else:
            print(f"Warning: Profile check returned: {data.get('message', data)}")
    except Exception as exc:
        print(f"Warning: Could not verify token: {exc}")

    print("\n✓ Done. Restart the dashboard to use the new token.")


if __name__ == "__main__":
    main()
