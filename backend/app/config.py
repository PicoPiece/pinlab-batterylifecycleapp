from functools import lru_cache

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


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
