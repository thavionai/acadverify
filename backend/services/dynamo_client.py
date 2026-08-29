from __future__ import annotations

import logging
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

from core.config import get_settings
from models.schemas import CredentialIndexItem, CredentialStatus

logger = logging.getLogger(__name__)

settings = get_settings()

_dynamo_resource = boto3.resource(
    "dynamodb",
    region_name=settings.aws_region,
    endpoint_url=settings.dynamodb_endpoint_url,  # None in real AWS, set for local dev
    # DynamoDB-local accepts any credentials but boto3 requires some to be
    # resolvable; None in real AWS (default credential chain).
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
)
_table = _dynamo_resource.Table(settings.dynamodb_table_name)


class DynamoClientError(Exception):
    """Raised on unrecoverable DynamoDB failures, wraps the boto ClientError."""


def _item_to_model(item: dict) -> CredentialIndexItem:
    return CredentialIndexItem(**item)


def _model_to_item(model: CredentialIndexItem) -> dict:
    return model.model_dump(mode="json")


async def scan_credentials() -> list[CredentialIndexItem]:
    """Full-table scan for the issuer dashboard registry.

    Fine at MVP/local scale; a deployment with real volume should page
    through the university_id GSI instead.
    """
    try:
        items: list[CredentialIndexItem] = []
        kwargs: dict = {}
        while True:
            resp = _table.scan(**kwargs)
            items.extend(_item_to_model(i) for i in resp.get("Items", []))
            last_key = resp.get("LastEvaluatedKey")
            if not last_key:
                return items
            kwargs["ExclusiveStartKey"] = last_key
    except ClientError as exc:
        logger.exception("DynamoDB scan failed")
        raise DynamoClientError(str(exc)) from exc


async def put_credential_index(item: CredentialIndexItem) -> CredentialIndexItem:
    """Create or fully overwrite a credential's index entry."""
    try:
        _table.put_item(Item=_model_to_item(item))
        return item
    except ClientError as exc:
        logger.exception("DynamoDB put_item failed for credential_id=%s", item.credential_id)
        raise DynamoClientError(str(exc)) from exc


async def get_credential_index(credential_id: str) -> CredentialIndexItem | None:
    try:
        resp = _table.get_item(Key={"credential_id": credential_id})
    except ClientError as exc:
        logger.exception("DynamoDB get_item failed for credential_id=%s", credential_id)
        raise DynamoClientError(str(exc)) from exc

    item = resp.get("Item")
    if item is None:
        return None
    return _item_to_model(item)


async def update_credential_status(
    credential_id: str,
    status: CredentialStatus,
    *,
    revoked_at: datetime | None = None,
    chain_proof_ref: str | None = None,
) -> CredentialIndexItem:
    """
    Partial update of status + timestamps. Uses an update expression
    rather than read-modify-write to avoid clobbering concurrent writes
    to unrelated fields (e.g. qr_code_s3_key set during issuance).
    """
    now = datetime.now(timezone.utc)

    update_expr_parts = ["#status = :status", "updated_at = :updated_at"]
    expr_attr_names = {"#status": "status"}
    expr_attr_values: dict[str, object] = {
        ":status": status.value,
        ":updated_at": now.isoformat(),
    }

    if revoked_at is not None:
        update_expr_parts.append("revoked_at = :revoked_at")
        expr_attr_values[":revoked_at"] = revoked_at.isoformat()

    if chain_proof_ref is not None:
        update_expr_parts.append("chain_proof_ref = :chain_proof_ref")
        expr_attr_values[":chain_proof_ref"] = chain_proof_ref

    try:
        resp = _table.update_item(
            Key={"credential_id": credential_id},
            UpdateExpression="SET " + ", ".join(update_expr_parts),
            ExpressionAttributeNames=expr_attr_names,
            ExpressionAttributeValues=expr_attr_values,
            ConditionExpression="attribute_exists(credential_id)",
            ReturnValues="ALL_NEW",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise DynamoClientError(f"credential_id {credential_id} does not exist") from exc
        logger.exception("DynamoDB update_item failed for credential_id=%s", credential_id)
        raise DynamoClientError(str(exc)) from exc

    return _item_to_model(resp["Attributes"])


async def list_credentials_for_university(
    university_id: str,
    *,
    limit: int = 50,
    cursor: dict | None = None,
) -> tuple[list[CredentialIndexItem], dict | None]:
    """
    Requires a GSI named 'university_id-created_at-index'. Returns
    (items, next_cursor) for simple pagination.
    """
    query_kwargs: dict = {
        "IndexName": "university_id-created_at-index",
        "KeyConditionExpression": "university_id = :uid",
        "ExpressionAttributeValues": {":uid": university_id},
        "Limit": limit,
        "ScanIndexForward": False,  # newest first
    }
    if cursor:
        query_kwargs["ExclusiveStartKey"] = cursor

    try:
        resp = _table.query(**query_kwargs)
    except ClientError as exc:
        logger.exception("DynamoDB query failed for university_id=%s", university_id)
        raise DynamoClientError(str(exc)) from exc

    items = [_item_to_model(i) for i in resp.get("Items", [])]
    next_cursor = resp.get("LastEvaluatedKey")
    return items, next_cursor
