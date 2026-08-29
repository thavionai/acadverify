from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- AWS / storage ---
    aws_region: str | None = None
    dynamodb_table_name: str = "credentials"
    dynamodb_endpoint_url: str | None = None  
    s3_bucket: str | None = None
    s3_endpoint: str | None = None
    # Explicit credentials for the local MinIO/DynamoDB-local containers.
    # Leave unset in real AWS so boto3 falls back to its default chain
    # (task role / instance profile).
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    public_asset_base_url: str = "https://assets.example.com"

    # --- chain-service (Midnight bridge) ---
    chain_service_url: str | None = None
    chain_service_timeout_seconds: float = 10.0
    chain_service_connect_timeout_seconds: float = 3.0

    # Issuer public key registered on-chain (64 hex chars). Issuance is
    # refused with a 503 until this is configured — see routers/issue.py.
    issuer_pk: str = ""

    # --- verification URL construction ---
    verify_base_url: str = "https://verify.example.com"

    admin_api_keys: str = ""

    @property
    def admin_api_key_set(self) -> set[str]:
        return {k.strip() for k in self.admin_api_keys.split(",") if k.strip()}

    blocklist_file_path: str = "/data/blocklist.json"

    trust_x_forwarded_for: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()

