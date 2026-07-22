from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    database_url: str

    # JWT
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # OpenAI
    openai_api_key: str

    # Email — SMTP takes priority over Brevo when smtp_host is set
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    brevo_api_key: str = ""
    email_from: str = "noreply@taskflow.local"

    # MinIO (object storage for attachments)
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "taskflow-attachments"
    minio_use_ssl: bool = False

    # Hocuspocus internal service key (shared between backend + hocuspocus container)
    hocuspocus_internal_key: str = "dev-hocuspocus-internal-key"

    # App
    environment: str = "development"
    debug: bool = False
    allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    base_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"

    # Git integration — Fernet key for encrypting stored provider tokens, and the
    # vendor-owned OAuth client ids baked in for Device Flow (GitHub/GitLab).
    # Bitbucket uses a pasted token (no device flow). Unset → that path degrades.
    encryption_key: str | None = None
    github_oauth_client_id: str | None = None
    gitlab_oauth_client_id: str | None = None
    gitlab_base_url: str = "https://gitlab.com"
    # Google SSO login (REQ-150). Unset → the Google button stays a stub.
    google_oauth_client_id: str | None = None
    # REQ-153: allow webhook delivery to private/loopback hosts (LAN receivers).
    webhook_allow_private_ips: bool = False
    # REQ-155: this email is promoted to instance superuser at startup. Unset → no admin surface.
    orbit_superuser_email: str | None = None

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, v: object) -> list[str]:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v  # type: ignore[return-value]

    model_config = SettingsConfigDict(
        env_file=["../.env", ".env"],
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

settings = Settings()