"""
Hands the graduate their own access link, once, at issuance.

The address is used and dropped. It is never written to the credential index,
never logged, and cannot be recovered afterwards — which is the whole point:
this server's claim is that it stores no student identity, and an email column
would be the first identity field in it. The consequence is that there is no
"resend" button and there cannot be one. The holder token is only ever shown
to the issuer once, so a lost link means reissuing the credential.

Failure here is never allowed to fail an issuance. The credential is already
on-chain by the time this runs; refusing the request over a typo in an address
would strand the token, which nothing on the server can reproduce.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from core.config import get_settings

logger = logging.getLogger(__name__)

# Generous enough for a slow TLS handshake, short enough that a black-holed
# SMTP port cannot hold an issuance response open.
_SOCKET_TIMEOUT_SECONDS = 10
_TOTAL_TIMEOUT_SECONDS = 20


def _body(hold_url: str, institution: str, degree: str) -> str:
    return f"""{institution} has issued your credential:

  {degree}

Your private access link:

  {hold_url}

Open it to see what your credential proves and to create share links for
employers. You choose what each link reveals, and you can revoke any of them
at any time.

Keep this link private. Anyone holding it can see your grades and create
share links in your name. It is not recoverable: the verification server keeps
only a one-way hash of it, so this message is the only copy.

Your email address was used to send this message and was not stored.
"""


def _send_sync(
    settings, to_email: str, hold_url: str, institution: str, degree: str
) -> None:
    """Blocking send. Runs in a worker thread; raises on any failure."""
    message = EmailMessage()
    message["Subject"] = f"Your {institution} credential access link"
    message["From"] = settings.smtp_from or settings.smtp_username
    message["To"] = to_email
    message.set_content(_body(hold_url, institution, degree))

    # 465 is implicit TLS; 587 (and anything else) negotiates STARTTLS. Module
    # attribute lookup rather than a from-import so tests can substitute both.
    if settings.smtp_port == 465:
        with smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=_SOCKET_TIMEOUT_SECONDS
        ) as server:
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(
        settings.smtp_host, settings.smtp_port, timeout=_SOCKET_TIMEOUT_SECONDS
    ) as server:
        server.starttls()
        server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)


async def send_holder_link(
    to_email: str, hold_url: str, institution: str, degree: str
) -> bool:
    """
    Best-effort. True only if the SMTP server accepted the message.

    Never raises: the caller has already issued the credential and must return
    the link either way.
    """
    settings = get_settings()

    if not (settings.smtp_host and settings.smtp_username and settings.smtp_password):
        logger.info("mailer is not configured; skipping the holder-link email")
        return False

    try:
        await asyncio.wait_for(
            asyncio.to_thread(
                _send_sync, settings, to_email, hold_url, institution, degree
            ),
            timeout=_TOTAL_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        # The exception class ONLY. SMTPRecipientsRefused carries the rejected
        # address in .args, so logging the exception itself — or passing
        # exc_info — would write the student's address into the log and undo
        # the reason this function drops it.
        logger.warning("holder-link email failed: %s", type(exc).__name__)
        return False

    logger.info("holder-link email accepted by the SMTP server")
    return True
