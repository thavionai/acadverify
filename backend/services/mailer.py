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
from functools import lru_cache
from html import escape
from pathlib import Path

from core.config import get_settings

logger = logging.getLogger(__name__)

# The banner rides INSIDE the message as a related part, rather than being
# linked. A linked image would have to be fetched by the reader's mail client
# -- and Gmail fetches through its own proxy, which cannot reach the machine
# this demo runs on. A broken image frame is worse than no image at all.
#
# Pre-cropped and pre-encoded at authoring time (frontend/public/images/hero,
# cropped to a banner band and re-encoded at 1000px/q75) so that sending costs
# a file read and nothing else: this runs inside the issuance request.
_HEADER_IMAGE = Path(__file__).resolve().parent.parent / "assets" / "email-header.jpg"
_HEADER_CID = "acadverify-header"


@lru_cache(maxsize=1)
def _header_bytes() -> bytes | None:
    """None when the asset is missing -- the message then goes out text-only."""
    try:
        return _HEADER_IMAGE.read_bytes()
    except OSError:
        logger.warning("email header image is missing; sending text only")
        return None

# Generous enough for a slow TLS handshake, short enough that a black-holed
# SMTP port cannot hold an issuance response open.
_SOCKET_TIMEOUT_SECONDS = 10
_TOTAL_TIMEOUT_SECONDS = 20


# Table-based, inline-styled, 600px. Not nostalgia: Gmail strips <style>
# blocks and most clients ignore flexbox, so anything structural has to be a
# table and every rule has to be an inline attribute.
def _html_body(
    hold_url: str, institution: str, degree: str, attestations: list[str]
) -> str:
    # The values are a university's free text and the recipient's own link;
    # both are escaped rather than trusted into the markup.
    institution_html = escape(institution)
    degree_html = escape(degree)
    url_html = escape(hold_url, quote=True)

    # Each of these is a credential in its own right, provable and shareable
    # on its own -- which is the point worth making to the person who earned
    # them, so they are listed rather than summarised as a count.
    also = ""
    if attestations:
        rows = "".join(
            f'''<tr>
                 <td style="padding:6px 0;font-size:15px;line-height:1.5;color:#f5f3ef;
                            border-bottom:1px solid #2a2a2e;">
                   <span style="color:#c9a227;">&#9670;</span>&nbsp;&nbsp;{escape(title)}
                 </td>
               </tr>'''
            for title in attestations
        )
        also = f'''<tr>
              <td style="padding:22px 32px 0 32px;font-family:Helvetica,Arial,sans-serif;">
                <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:1.5px;
                          text-transform:uppercase;color:#8b8880;">
                  Also on your record
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  {rows}
                </table>
                <p style="margin:10px 0 0 0;font-size:13px;line-height:1.6;color:#8b8880;">
                  Each of these is proven separately, so you can show one to an
                  employer without showing the rest.
                </p>
              </td>
            </tr>'''
    banner = (
        f'''<tr>
            <td style="padding:0;">
              <img src="cid:{_HEADER_CID}" width="600" alt=""
                   style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
            </td>
          </tr>'''
        if _header_bytes()
        else ""
    )

    return f"""<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b0b0d;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#0b0b0d;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0"
                 style="width:600px;max-width:100%;background:#141416;border-radius:10px;overflow:hidden;">
            {banner}
            <tr>
              <td style="padding:32px 32px 8px 32px;font-family:Georgia,'Times New Roman',serif;">
                <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c9a227;font-family:Helvetica,Arial,sans-serif;">
                  {institution_html}
                </p>
                <h1 style="margin:0;font-size:28px;line-height:1.25;color:#f5f3ef;font-weight:normal;">
                  Your credential is ready
                </h1>
                <p style="margin:14px 0 0 0;font-size:17px;line-height:1.5;color:#c9a227;">
                  {degree_html}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;font-family:Helvetica,Arial,sans-serif;">
                <p style="margin:0;font-size:15px;line-height:1.65;color:#cfcbc4;">
                  This link is yours alone. Open it to see what your credential
                  proves, and to create share links for employers &mdash; you
                  choose what each one reveals, and you can switch any of them
                  off at any time.
                </p>
              </td>
            </tr>
            {also}
            <tr>
              <td align="center" style="padding:26px 32px 6px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" bgcolor="#c9a227" style="border-radius:6px;">
                      <a href="{url_html}"
                         style="display:inline-block;padding:14px 30px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:#0b0b0d;text-decoration:none;">
                        Open my credential
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 32px 0 32px;font-family:Helvetica,Arial,sans-serif;">
                <!-- Some clients strip the button; the raw link must survive. -->
                <p style="margin:0;font-size:12px;line-height:1.6;color:#8b8880;word-break:break-all;">
                  {url_html}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px 32px;font-family:Helvetica,Arial,sans-serif;">
                <div style="border-top:1px solid #2a2a2e;padding-top:18px;">
                  <p style="margin:0;font-size:13px;line-height:1.65;color:#b04a4a;">
                    <strong>Keep this link private.</strong> Anyone holding it
                    can see your grades and create share links in your name.
                  </p>
                  <p style="margin:12px 0 0 0;font-size:13px;line-height:1.65;color:#8b8880;">
                    It cannot be recovered: the verification server keeps only a
                    one-way hash of it, so this message is the only copy. Your
                    email address was used to send this and was not stored.
                  </p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _body(
    hold_url: str, institution: str, degree: str, attestations: list[str]
) -> str:
    also = (
        "\n\nAlso on your record:\n"
        + "\n".join(f"  - {title}" for title in attestations)
        if attestations
        else ""
    )
    return f"""{institution} has issued your credential:

  {degree}{also}

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
    settings,
    to_email: str,
    hold_url: str,
    institution: str,
    degree: str,
    attestations: list[str],
) -> None:
    """Blocking send. Runs in a worker thread; raises on any failure."""
    message = EmailMessage()
    message["Subject"] = f"Your {institution} credential access link"
    message["From"] = settings.smtp_from or settings.smtp_username
    message["To"] = to_email

    # Plain text first, so it is the fallback rather than the afterthought:
    # it carries the same link and the same warnings, and is what a text-only
    # client, a screen reader in plain mode, or a stripped forward will show.
    message.set_content(_body(hold_url, institution, degree, attestations))
    message.add_alternative(
        _html_body(hold_url, institution, degree, attestations), subtype="html"
    )

    header = _header_bytes()
    if header:
        # Attached to the HTML part specifically, which is what makes the
        # alternative/related nesting come out right: text and HTML remain
        # alternatives of each other, and the image belongs only to the HTML.
        message.get_payload()[-1].add_related(
            header, maintype="image", subtype="jpeg", cid=f"<{_HEADER_CID}>"
        )

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
    to_email: str,
    hold_url: str,
    institution: str,
    degree: str,
    attestations: list[str] | None = None,
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
                _send_sync,
                settings,
                to_email,
                hold_url,
                institution,
                degree,
                attestations or [],
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
