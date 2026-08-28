from __future__ import annotations

import logging

import boto3
from botocore.exceptions import ClientError

from core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

_s3_client = boto3.client(
    "s3",
    region_name=settings.aws_region,
    endpoint_url=settings.s3_endpoint_url,
)


class S3ClientError(Exception):
    pass


def _qr_key(credential_id: str) -> str:
    return f"qr-codes/{credential_id}.png"


async def upload_qr_code(credential_id: str, png_bytes: bytes) -> tuple[str, str]:
    key = _qr_key(credential_id)
    try:
        _s3_client.put_object(
            Bucket=settings.s3_bucket_name,
            Key=key,
            Body=png_bytes,
            ContentType="image/png",
            CacheControl="public, max-age=31536000, immutable",
        )
    except ClientError as exc:
        logger.exception("S3 put_object failed for credential_id=%s", credential_id)
        raise S3ClientError(str(exc)) from exc

    public_url = f"{settings.public_asset_base_url.rstrip('/')}/{key}"
    return key, public_url


async def delete_qr_code(credential_id: str) -> None:
    key = _qr_key(credential_id)
    try:
        _s3_client.delete_object(Bucket=settings.s3_bucket_name, Key=key)
    except ClientError as exc:
        logger.warning("S3 delete_object failed for credential_id=%s: %s", credential_id, exc)

