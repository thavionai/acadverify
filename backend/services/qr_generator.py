from __future__ import annotations

import io

import qrcode

from core.config import get_settings

settings = get_settings()


def build_verify_url(credential_id: str) -> str:
    return f"{settings.verify_base_url.rstrip('/')}/v/{credential_id}"


def generate_qr_png_bytes(data_url: str) -> bytes:
    qr = qrcode.QRCode(
        version=None,  # auto-size to fit data
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(data_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_qr_for_credential(credential_id: str) -> tuple[str, bytes]:
    """Convenience wrapper: returns (verify_url, png_bytes)."""
    verify_url = build_verify_url(credential_id)
    png_bytes = generate_qr_png_bytes(verify_url)
    return verify_url, png_bytes
