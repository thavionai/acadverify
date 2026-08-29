#!/usr/bin/env bash
# Bootstrap the local AWS stand-ins after `docker compose up -d`:
#   - DynamoDB table `credentials` (+ the GSI dynamo_client.py queries)
#   - MinIO bucket for QR codes
# Referenced by docs/local-setup.md. Idempotent — safe to re-run.
set -euo pipefail

DYNAMO_ENDPOINT="${DYNAMO_ENDPOINT:-http://localhost:8000}"
TABLE_NAME="${DYNAMODB_TABLE_NAME:-credentials}"
S3_BUCKET="${S3_BUCKET:-acadverify-dev}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-acadverify}"
S3_SECRET_KEY="${S3_SECRET_KEY:-acadverify123}"

# DynamoDB-local accepts any credentials, but the AWS CLI requires some.
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
export AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}"

if aws dynamodb describe-table --endpoint-url "$DYNAMO_ENDPOINT" \
    --table-name "$TABLE_NAME" >/dev/null 2>&1; then
  echo "DynamoDB table '$TABLE_NAME' already exists."
else
  aws dynamodb create-table --endpoint-url "$DYNAMO_ENDPOINT" \
    --table-name "$TABLE_NAME" \
    --attribute-definitions \
      AttributeName=credential_id,AttributeType=S \
      AttributeName=university_id,AttributeType=S \
      AttributeName=created_at,AttributeType=S \
    --key-schema AttributeName=credential_id,KeyType=HASH \
    --global-secondary-indexes 'IndexName=university_id-created_at-index,KeySchema=[{AttributeName=university_id,KeyType=HASH},{AttributeName=created_at,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
    --billing-mode PAY_PER_REQUEST --no-cli-pager >/dev/null
  echo "DynamoDB table '$TABLE_NAME' created."
fi

# MinIO ships the `mc` client inside its own image — no host install needed.
# Anonymous download lets the browser load QR PNGs straight from the bucket.
docker compose exec -T minio sh -c \
  "mc alias set local http://localhost:9000 '$S3_ACCESS_KEY' '$S3_SECRET_KEY' >/dev/null \
   && mc mb --ignore-existing local/'$S3_BUCKET' \
   && mc anonymous set download local/'$S3_BUCKET' >/dev/null"
echo "MinIO bucket '$S3_BUCKET' ready (anonymous download enabled)."
