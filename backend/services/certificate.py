"""
A printable certificate that names nobody.

The obvious design — put the graduate's name on it — is impossible here, and
that turns out to be the point. The off-chain index deliberately stores no
identity (docs/data-model.md), so by the time anyone asks for a PDF the name is
long gone: it existed only inside the issuance request, was hashed on its way
to the circuit, and was never written down. A certificate generated afterwards
physically cannot carry it.

So the document leans into that. It states the award and carries a QR code, and
says plainly that it names no one — which is a better artefact than a printed
name anyway, because a name on paper proves nothing and the QR proves
everything.

Rendered with Pillow, which is already a dependency for QR codes and can write
a single-page PDF directly. No new dependency, no headless browser.
"""

from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

from services.qr_generator import generate_qr_png_bytes

# A4 landscape at ~150dpi.
_WIDTH, _HEIGHT = 1754, 1240

_PAPER = "#faf7f0"
_INK = "#1a1a1a"
_MUTED = "#6b6b6b"
_RULE = "#c9a227"

# python:3.11-slim ships no TTF fonts, so the bundled bitmap font is the
# expected path in-container rather than a fallback for odd machines. Since
# Pillow 10.1 load_default() accepts a size, so it scales acceptably.
_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
)
_BOLD_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
)


def _font(size: int, *, bold: bool = False):
    for path in _BOLD_CANDIDATES if bold else _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def _centered(draw: ImageDraw.ImageDraw, y: int, text: str, font, fill: str) -> None:
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    draw.text(((_WIDTH - (right - left)) / 2 - left, y - top), text, font=font, fill=fill)


def render_certificate_pdf(
    *,
    credential_id: str,
    degree: str,
    institution: str,
    graduation_year: int | None,
    verify_url: str,
) -> bytes:
    """One-page PDF. Note the absent parameter: there is no `student_name`,
    and there is nowhere it could come from."""
    canvas = Image.new("RGB", (_WIDTH, _HEIGHT), _PAPER)
    draw = ImageDraw.Draw(canvas)

    draw.rectangle([40, 40, _WIDTH - 40, _HEIGHT - 40], outline=_RULE, width=3)

    _centered(draw, 150, (institution or "").upper(), _font(44, bold=True), _INK)
    draw.line([(_WIDTH / 2 - 220, 230), (_WIDTH / 2 + 220, 230)], fill=_RULE, width=2)

    _centered(draw, 300, "certifies the award of", _font(30), _MUTED)
    _centered(draw, 380, degree or "", _font(64, bold=True), _INK)

    if graduation_year:
        _centered(draw, 500, f"conferred in {graduation_year}", _font(32), _MUTED)

    qr = Image.open(BytesIO(generate_qr_png_bytes(verify_url))).convert("RGB").resize((280, 280))
    canvas.paste(qr, (int((_WIDTH - 280) / 2), 600))

    _centered(draw, 910, "Scan to verify this credential", _font(26), _MUTED)
    _centered(draw, 960, credential_id, _font(22), _MUTED)

    draw.line([(200, 1060), (_WIDTH - 200, 1060)], fill=_RULE, width=1)
    _centered(
        draw,
        1090,
        "This certificate deliberately names no one.",
        _font(26, bold=True),
        _INK,
    )
    _centered(
        draw,
        1130,
        # ASCII only in rendered text: the bundled bitmap font used in-container
        # has no em-dash glyph and draws a tofu box in its place.
        "The holder proves it is theirs by presenting it. Scanning proves it is real.",
        _font(22),
        _MUTED,
    )

    buffer = BytesIO()
    canvas.save(buffer, format="PDF", resolution=150.0)
    return buffer.getvalue()
