"""
Email sender — Gmail SMTP with optional PDF attachment.
Credentials loaded from .env (SMTP_USERNAME, SMTP_PASSWORD, SMTP_HOST, SMTP_PORT).
"""
from __future__ import annotations

import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from loguru import logger


def _build_message(subject: str, body: str, recipient: str, sender: str) -> MIMEMultipart:
    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = f"AXIOM — Neura Capital <{sender}>"
    msg["To"] = recipient
    msg.attach(MIMEText(body, "plain"))
    return msg


def send_email_with_attachment(
    subject: str,
    body: str,
    pdf_path: Path | None = None,
    recipients: list[str] | None = None,
) -> None:
    """Send email with optional PDF attachment via Gmail SMTP."""
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    default_recipient = os.getenv("SMTP_USERNAME")  # send to self by default

    if not username or not password:
        logger.error("SMTP credentials missing — check SMTP_USERNAME and SMTP_PASSWORD in .env")
        return

    to_list = recipients or [default_recipient]
    msg = _build_message(subject, body, ", ".join(to_list), username)

    if pdf_path and pdf_path.exists():
        with open(pdf_path, "rb") as f:
            part = MIMEApplication(f.read(), _subtype="pdf")
            part.add_header("Content-Disposition", "attachment", filename=pdf_path.name)
            msg.attach(part)
        logger.info("Attaching PDF: {}", pdf_path.name)

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as smtp:
            smtp.starttls()
            smtp.login(username, password)
            smtp.sendmail(username, to_list, msg.as_string())
        logger.success("Email sent to {} — subject: {}", to_list, subject)
    except smtplib.SMTPAuthenticationError:
        logger.error("Gmail auth failed — ensure App Password is set (not account password)")
    except smtplib.SMTPException as exc:
        logger.error("SMTP error: {}", exc)
    except Exception as exc:
        logger.exception("Email send failed: {}", exc)


def send_email(subject: str, body: str, recipients: list[str]) -> None:
    """Backwards-compatible wrapper — plain text email, no attachment."""
    send_email_with_attachment(subject=subject, body=body, recipients=recipients)
