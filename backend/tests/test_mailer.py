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


@pytest.fixture(autouse=True)
def _reset():
    FakeSMTP.instances = []
    yield
    FakeSMTP.instances = []


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

    body = server.message.get_content()
    assert HOLD_URL in body, "the whole purpose of the message"
    assert "BSc CS" in body
    assert "was not stored" in body


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
