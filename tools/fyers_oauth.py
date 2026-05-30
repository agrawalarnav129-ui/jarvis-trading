from __future__ import annotations

import hashlib
import os
import sys
import webbrowser
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = PROJECT_ROOT / ".env"
load_dotenv(ENV_PATH)

FYERS_CLIENT_ID = os.getenv("FYERS_CLIENT_ID")
FYERS_SECRET_KEY = os.getenv("FYERS_SECRET_KEY")
FYERS_REDIRECT_URI = os.getenv("FYERS_REDIRECT_URI", "https://127.0.0.1:8000/callback")
FYERS_API_HOST = os.getenv("FYERS_API_HOST", "https://api-t1.fyers.in/api/v3")


def require_env() -> None:
    missing = []
    if not FYERS_CLIENT_ID:
        missing.append("FYERS_CLIENT_ID")
    if not FYERS_SECRET_KEY:
        missing.append("FYERS_SECRET_KEY")
    if missing:
        raise EnvironmentError(
            "Missing required Fyers credentials in .env: " + ", ".join(missing)
        )


def auth_url(state: str = "fyers_auth_state") -> str:
    return (
        f"{FYERS_API_HOST}/generate-authcode?"
        f"client_id={FYERS_CLIENT_ID}&"
        f"redirect_uri={FYERS_REDIRECT_URI}&"
        f"response_type=code&"
        f"state={state}"
    )


def calculate_appid_hash(use_colon: bool = True) -> str:
    raw = f"{FYERS_CLIENT_ID}:{FYERS_SECRET_KEY}" if use_colon else f"{FYERS_CLIENT_ID}{FYERS_SECRET_KEY}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def extract_code_from_url(url: str) -> str:
    parsed = urlparse(url.strip())
    query = parse_qs(parsed.query)
    auth_code = query.get("auth_code")
    if auth_code:
        return auth_code[0]
    code = query.get("code")
    if not code:
        raise ValueError("Could not find auth_code or code parameter in the URL.")
    return code[0]


def validate_auth_code(code: str) -> dict[str, Any]:
    endpoint = f"{FYERS_API_HOST}/validate-authcode"
    for use_colon, label in [(True, "app_id:app_secret"), (False, "app_idapp_secret")]:
        payload = {
            "grant_type": "authorization_code",
            "appIdHash": calculate_appid_hash(use_colon=use_colon),
            "code": code,
        }
        response = requests.post(endpoint, json=payload, timeout=30)
        try:
            response_data = response.json()
        except ValueError:
            response.raise_for_status()
        if response_data.get("access_token"):
            print(f"Using appIdHash format: {label}")
            return response_data
        if response_data.get("s") == "ok" and response_data.get("access_token"):
            return response_data
        if response.status_code == 200 and response_data.get("access_token"):
            return response_data
    raise RuntimeError(
        f"Failed to validate auth code. Last response: {response.status_code} {response.text}"
    )


def save_access_token(access_token: str, env_path: Path = ENV_PATH) -> None:
    if not env_path.exists():
        raise FileNotFoundError(f".env file not found at {env_path}")
    lines = env_path.read_text().splitlines()
    updated = False
    for index, line in enumerate(lines):
        if line.startswith("FYERS_ACCESS_TOKEN="):
            lines[index] = f"FYERS_ACCESS_TOKEN={access_token}"
            updated = True
            break
    if not updated:
        lines.append(f"FYERS_ACCESS_TOKEN={access_token}")
    env_path.write_text("\n".join(lines) + "\n")


def main() -> int:
    try:
        require_env()
    except EnvironmentError as exc:
        print(exc)
        return 1

    url = auth_url()
    print("\nSTEP 1: Open this URL in your browser and log in to Fyers:")
    print(url)
    try:
        webbrowser.open(url)
    except Exception:
        pass

    print("\nSTEP 2: After login, Fyers will redirect to your callback URL.")
    print("If the browser fails to connect, copy the full URL from the address bar.")
    redirect_url = input("Paste the redirect URL here: ").strip()
    try:
        code = extract_code_from_url(redirect_url)
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1

    print("\nSTEP 3: Exchanging auth code for access token...")
    token_response = validate_auth_code(code)
    access_token = token_response.get("access_token")
    refresh_token = token_response.get("refresh_token")

    print("\nAccess token obtained successfully:")
    print(access_token)
    if refresh_token:
        print("Refresh token:")
        print(refresh_token)

    save = input("Save access token into .env now? [y/N]: ").strip().lower() == "y"
    if save:
        save_access_token(access_token)
        print("Saved FYERS_ACCESS_TOKEN in .env")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
