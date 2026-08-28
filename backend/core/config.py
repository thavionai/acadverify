"""
Application configuration.

All values are pulled from environment variables so the same image can be
deployed to dev/staging/prod without code changes. Nothing sensitive (API
keys, AWS credentials) should ever have a hardcoded default here.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- AWS / storage ---
    aws_region: str = "us-east-1"
    dynamodb_table_name: str = "credentials"
    dynamodb_endpoint_url: str | None = None  # set for local DynamoDB
    s3_bucket_name: str = "credential-qr-assets"
    s3_endpoint_url: str | None = None  # set for local S3 / minio
    public_asset_base_url: str = "https://assets.example.com"

    # --- chain-service (Midnight bridge) ---
    chain_service_base_url: str | None = None
    chain_service_timeout_seconds: float = 10.0
    chain_service_connect_timeout_seconds: float = 3.0

    # --- verification URL construction ---
    verify_base_url: str = "https://verify.example.com"

    admin_api_keys: str = ""

    @property
    def admin_api_key_set(self) -> set[str]:
        return {k.strip() for k in self.admin_api_keys.split(",") if k.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
