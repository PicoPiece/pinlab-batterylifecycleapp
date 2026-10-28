import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

TEST_DB = Path(tempfile.gettempdir()) / "pinlab_battery_test.db"
TEST_UPLOADS = Path(tempfile.gettempdir()) / "pinlab_battery_uploads"

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["SECRET_KEY"] = "test-only-secret-key-32-bytes-minimum"
os.environ["UPLOAD_DIR"] = str(TEST_UPLOADS)

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User, UserRole  # noqa: E402
from app.security import hash_password  # noqa: E402


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db):
    with TestClient(app) as test_client:
        yield test_client


def create_user(db, email: str, role: UserRole, password: str = "Password123!") -> User:
    user = User(
        email=email,
        full_name=email.split("@")[0].title(),
        hashed_password=hash_password(password),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def admin(db):
    return create_user(db, "admin@example.com", UserRole.admin)


@pytest.fixture()
def technician(db):
    return create_user(db, "tech@example.com", UserRole.technician)


@pytest.fixture()
def viewer(db):
    return create_user(db, "viewer@example.com", UserRole.viewer)


def login(client: TestClient, email: str, password: str = "Password123!") -> None:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text


@pytest.fixture()
def admin_client(client, admin):
    login(client, admin.email)
    return client


@pytest.fixture()
def tech_client(client, technician):
    login(client, technician.email)
    return client


@pytest.fixture()
def viewer_client(client, viewer):
    login(client, viewer.email)
    return client
