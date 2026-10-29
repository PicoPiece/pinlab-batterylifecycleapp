from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "PinLab Battery Lifecycle"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://pinlab:pinlab@db:5432/pinlab"
    secret_key: str
    access_token_expire_minutes: int = 480
    cookie_name: str = "pinlab_session"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    enable_docs: bool = True
    upload_dir: str = "/data/uploads"
    max_upload_mb: int = 20
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    admin_email: str | None = None
    admin_password: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @model_validator(mode="after")
    def validate_production_hardening(self) -> "Settings":
        if self.environment.lower() not in {"production", "prod"}:
            return self
        if not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true when ENVIRONMENT=production")
        if self.enable_docs:
            raise ValueError("ENABLE_DOCS must be false when ENVIRONMENT=production")
        if not self.cors_origin_list:
            raise ValueError("CORS_ORIGINS must contain the public HTTPS origin")
        if any(not origin.lower().startswith("https://") for origin in self.cors_origin_list):
            raise ValueError("CORS_ORIGINS must use HTTPS in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
