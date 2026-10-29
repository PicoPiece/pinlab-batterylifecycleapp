from pydantic import ValidationError
import pytest

from app.config import Settings


def base_settings(**overrides):
    values = dict(
        environment="production",
        secret_key="test-only-secret-key-32-bytes-minimum",
        cookie_secure=True,
        enable_docs=False,
        cors_origins="https://pinlab-app.picopiece.com",
    )
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_production_config_accepts_hardened_settings():
    settings = base_settings()
    assert settings.environment == "production"
    assert settings.cookie_secure is True
    assert settings.enable_docs is False
    assert settings.cors_origin_list == ["https://pinlab-app.picopiece.com"]


def test_production_rejects_insecure_cookie():
    with pytest.raises(ValidationError, match="COOKIE_SECURE"):
        base_settings(cookie_secure=False)


def test_production_rejects_public_docs():
    with pytest.raises(ValidationError, match="ENABLE_DOCS"):
        base_settings(enable_docs=True)


def test_production_rejects_non_https_origin():
    with pytest.raises(ValidationError, match="HTTPS"):
        base_settings(cors_origins="http://127.0.0.1:8890")
