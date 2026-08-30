"""
The mailer's contract is narrow and mostly about what it must NOT do: never
raise, never touch the network when unconfigured, and never write the
student's address anywhere.
"""
from __future__ import annotations

import logging
import smtplib
from types import SimpleNamespace

import pytest

from services import mailer

HOLD_URL = "http://localhost:3000/hold/tok-abc123"
STUDENT = "graduate@example.edu"


def _settings(**overrides):
    base = dict(
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_username="registrar@example.edu",
        smtp_password="app-password",
        smtp_from="",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class FakeSMTP:
    """Records what a real server would have been asked to do."""

    instances: list["FakeSMTP"] = []

    def __init__(self, host, port, timeout=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.started_tls = False
        self.login_args = None
        self.message = None
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.started_tls = True

    def login(self, username, password):
        self.login_args = (username, password)

    def send_message(self, message):
        self.message = message


def _plain_part(message):
    return next(
        part for part in message.walk() if part.get_content_type() == "text/plain"
    )


def _html_part(message):
    return next(
        part for part in message.walk() if part.get_content_type() == "text/html"
    )


def _image_parts(message):
    return [p for p in message.walk() if p.get_content_maintype() == "image"]


@pytest.fixture(autouse=True)
def _reset():
    FakeSMTP.instances = []
    mailer._header_bytes.cache_clear()
    yield
    FakeSMTP.instances = []
    mailer._header_bytes.cache_clear()


async def test_unconfigured_mailer_returns_false_without_touching_the_network(
    monkeypatch,
):
    def bomb(*args, **kwargs):  # pragma: no cover - must never run
        raise AssertionError("an unconfigured mailer must not open a socket")

    monkeypatch.setattr(mailer, "get_settings", lambda: _settings(smtp_host=""))
    monkeypatch.setattr(mailer.smtplib, "SMTP", bomb)
    monkeypatch.setattr(mailer.smtplib, "SMTP_SSL", bomb)

    assert await mailer.send_holder_link(STUDENT, HOLD_URL, "NVU", "BSc") is False


async def test_a_password_alone_is_not_configured(monkeypatch):
    # Host present, credentials missing: still disabled rather than a
    # connection attempt that would fail slowly at issuance time.
    monkeypatch.setattr(mailer, "get_settings", lambda: _settings(smtp_username=""))
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)

    assert await mailer.send_holder_link(STUDENT, HOLD_URL, "NVU", "BSc") is False
    assert FakeSMTP.instances == []


async def test_sends_the_link_over_starttls_and_returns_true(monkeypatch):
    monkeypatch.setattr(mailer, "get_settings", lambda: _settings())
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)

    assert await mailer.send_holder_link(STUDENT, HOLD_URL, "NVU", "BSc CS") is True

    (server,) = FakeSMTP.instances
    assert (server.host, server.port) == ("smtp.example.com", 587)
    assert server.timeout is not None, "a hung SMTP port must not stall issuance"
    assert server.started_tls, "credentials must never cross a plaintext link"
    assert server.login_args == ("registrar@example.edu", "app-password")

    assert server.message["To"] == STUDENT
    assert server.message["From"] == "registrar@example.edu"
    assert "NVU" in server.message["Subject"]

    text = _plain_part(server.message).get_content()
    assert HOLD_URL in text, "the whole purpose of the message"
    assert "BSc CS" in text
    assert "was not stored" in text


async def test_smtp_from_overrides_the_username(monkeypatch):
    monkeypatch.setattr(
        mailer, "get_settings", lambda: _settings(smtp_from="no-reply@example.edu")
    )
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)

    await mailer.send_holder_link(STUDENT, HOLD_URL, "NVU", "BSc")

    assert FakeSMTP.instances[0].message["From"] == "no-reply@example.edu"


async def test_port_465_uses_implicit_tls_and_never_calls_starttls(monkeypatch):
    def bomb(*args, **kwargs):  # pragma: no cover - must never run
        raise AssertionError("465 is implicit TLS; plain SMTP must not be used")

    monkeypatch.setattr(mailer, "get_settings", lambda: _settings(smtp_port=465))
    monkeypatch.setattr(mailer.smtplib, "SMTP_SSL", FakeSMTP)
    monkeypatch.setattr(mailer.smtplib, "SMTP", bomb)

    assert await mailer.send_holder_link(STUDENT, HOLD_URL, "NVU", "BSc") is True

    (server,) = FakeSMTP.instances
    assert server.port == 465
    assert not server.started_tls, "STARTTLS on an already-TLS socket is an error"


async def test_failure_returns_false_and_never_logs_the_address(monkeypatch, caplog):
    class Refusing(FakeSMTP):
        def send_message(self, message):
            # The real exception carries the rejected address in .args, which
            # is exactly how it would end up in a log file.
            raise smtplib.SMTPRecipientsRefused({STUDENT: (550, b"No such user")})

    monkeypatch.setattr(mailer, "get_settings", lambda: _settings())
    monkeypatch.setattr(mailer.smtplib, "SMTP", Refusing)

    with caplog.at_level(logging.DEBUG):
        assert await mailer.send_holder_link(STUDENT, HOLD_URL, "NVU", "BSc") is False

    assert STUDENT not in caplog.text
    assert "graduate" not in caplog.text
    assert "SMTPRecipientsRefused" in caplog.text


async def test_a_hanging_server_times_out_rather_than_stalling_issuance(monkeypatch):
    import asyncio

    class Hanging(FakeSMTP):
        def login(self, username, password):
            raise TimeoutError("socket timed out")

    monkeypatch.setattr(mailer, "get_settings", lambda: _settings())
    monkeypatch.setattr(mailer.smtplib, "SMTP", Hanging)
    monkeypatch.setattr(mailer, "_TOTAL_TIMEOUT_SECONDS", 0.05)

    assert await mailer.send_holder_link(STUDENT, HOLD_URL, "NVU", "BSc") is False
    assert asyncio.get_running_loop().is_running()


# ---------------------------------------------------------------------------
# The HTML message
# ---------------------------------------------------------------------------

async def test_the_message_carries_both_a_text_and_an_html_version(monkeypatch):
    monkeypatch.setattr(mailer, "get_settings", lambda: _settings())
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)

    await mailer.send_holder_link(STUDENT, HOLD_URL, "NVU", "BSc CS")

    message = FakeSMTP.instances[0].message
    assert message.get_content_type() == "multipart/mixed" or message.is_multipart()

    # Both versions must carry the link: a text-only client, a stripped
    # forward, or a client that refuses HTML still has to be able to open it.
    assert HOLD_URL in _plain_part(message).get_content()
    assert HOLD_URL in _html_part(message).get_content()


async def test_the_banner_travels_inside_the_message(monkeypatch):
    """
    A linked image would be fetched by the reader's client -- and Gmail fetches
    through a proxy that cannot reach the machine this runs on.
    """
    monkeypatch.setattr(mailer, "get_settings", lambda: _settings())
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)

    await mailer.send_holder_link(STUDENT, HOLD_URL, "NVU", "BSc CS")

    message = FakeSMTP.instances[0].message
    html = _html_part(message).get_content()
    # Every image reference is a cid:, never a URL the client would fetch.
    import re

    sources = re.findall(r'<img[^>]*\ssrc="([^"]*)"', html)
    assert sources == [f"cid:{mailer._HEADER_CID}"]

    (image,) = _image_parts(message)
    assert image.get("Content-ID") == f"<{mailer._HEADER_CID}>"
    assert len(image.get_payload(decode=True)) > 1000, "real image bytes"


async def test_a_missing_banner_still_sends_the_message(monkeypatch, tmp_path):
    """The link matters; the decoration does not."""
    monkeypatch.setattr(mailer, "get_settings", lambda: _settings())
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(mailer, "_HEADER_IMAGE", tmp_path / "absent.jpg")
    mailer._header_bytes.cache_clear()

    assert await mailer.send_holder_link(STUDENT, HOLD_URL, "NVU", "BSc") is True

    message = FakeSMTP.instances[0].message
    assert _image_parts(message) == []
    assert HOLD_URL in _html_part(message).get_content()
    assert "<img" not in _html_part(message).get_content()


async def test_an_institution_name_cannot_inject_markup(monkeypatch):
    """The name is a university's free text, not markup we wrote."""
    monkeypatch.setattr(mailer, "get_settings", lambda: _settings())
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)

    await mailer.send_holder_link(
        STUDENT, HOLD_URL, "<script>alert(1)</script>NVU", "BSc & Co"
    )

    html = _html_part(FakeSMTP.instances[0].message).get_content()
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "BSc &amp; Co" in html


async def test_attestations_are_listed_in_both_versions(monkeypatch):
    monkeypatch.setattr(mailer, "get_settings", lambda: _settings())
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)

    await mailer.send_holder_link(
        STUDENT, HOLD_URL, "NVU", "BSc CS", ["Distributed Systems", "Deans List"]
    )

    message = FakeSMTP.instances[0].message
    for content in (
        _plain_part(message).get_content(),
        _html_part(message).get_content(),
    ):
        assert "Distributed Systems" in content
        assert "Deans List" in content


async def test_no_attestations_means_no_empty_section(monkeypatch):
    monkeypatch.setattr(mailer, "get_settings", lambda: _settings())
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)

    await mailer.send_holder_link(STUDENT, HOLD_URL, "NVU", "BSc CS")

    message = FakeSMTP.instances[0].message
    assert "Also on your record" not in _html_part(message).get_content()
    assert "Also on your record" not in _plain_part(message).get_content()


async def test_an_attestation_title_cannot_inject_markup(monkeypatch):
    monkeypatch.setattr(mailer, "get_settings", lambda: _settings())
    monkeypatch.setattr(mailer.smtplib, "SMTP", FakeSMTP)

    await mailer.send_holder_link(
        STUDENT, HOLD_URL, "NVU", "BSc", ["<img src=x onerror=alert(1)>"]
    )

    import re

    html = _html_part(FakeSMTP.instances[0].message).get_content()
    # "onerror" survives as inert text; what must not survive is a real tag.
    # The banner is the only <img> the message is allowed to contain.
    sources = re.findall(r'<img[^>]*\ssrc="([^"]*)"', html)
    assert sources == [f"cid:{mailer._HEADER_CID}"]
    assert "&lt;img" in html
