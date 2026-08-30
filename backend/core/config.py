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
    # Issuance and revocation each prove for ~22s in live mode (measured);
    # a 10s default silently broke every live call. Keep headroom for
    # proof-server queueing on top of single-proof latency.
    chain_service_timeout_seconds: float = 90.0
    chain_service_connect_timeout_seconds: float = 3.0

    # Issuer public key registered on-chain (64 hex chars). Issuance is
    # refused with a 503 until this is configured — see routers/issue.py.
    # Retained only so an existing ISSUER_PK in .env does not fail validation.
    # Nothing reads it: chain-service derives each institution's key from its
    # identity, so the backend never handles issuer key material.
    issuer_pk: str = ""

    # --- verification URL construction ---
    # --- AI resume checker -------------------------------------------------
    # Optional. With no key the resume endpoint returns an honest 503 rather
    # than degrading to guesswork, so the feature is safe to leave unconfigured.
    gemini_api_key: str = ""
    # gemini-2.5-flash and -flash-lite are closed to new API projects and answer
    # 404 with "no longer available to new users"; 3.6-flash is the current
    # replacement Google names in that error. Override with GEMINI_MODEL.
    gemini_model: str = "gemini-3.6-flash"
    # Tried in order when the primary is overloaded (503) or times out. All
    # three were verified to support the structured-output schema this client
    # sends; 2.5-flash is deliberately absent, being closed to new projects.
    gemini_fallback_models: str = "gemini-3-flash-preview,gemini-3.1-flash-lite"
    # Headroom: the model usually answers in ~6s but has been seen to stall.
    gemini_timeout_seconds: float = 60.0

    # --- Outbound email (optional) -----------------------------------------
    # Used once, at issuance, to hand the student their own access link. An
    # empty host disables the mailer: issuance still returns holdUrl, and the
    # university copies it by hand. Nothing here is required to run the app.
    #
    # Gmail needs an APP PASSWORD (Account -> Security -> 2-Step Verification
    # -> App passwords), not the account password.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    # Defaults to smtp_username. Gmail rewrites a From it does not own anyway.
    smtp_from: str = ""

    verify_base_url: str = "https://verify.example.com"

    # Comma-separated browser origins allowed to call the API (the Next.js
    # dev server locally). Empty disables CORS entirely.
    cors_origins: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    admin_api_keys: str = ""

    @property
    def admin_api_key_set(self) -> set[str]:
        return {k.strip() for k in self.admin_api_keys.split(",") if k.strip()}

    blocklist_file_path: str = "/data/blocklist.json"

    trust_x_forwarded_for: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()

