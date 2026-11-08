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
# Tests use an HTTPS base URL so Secure cookies are exercised without weakening
# the application's production cookie policy.
os.environ["COOKIE_SECURE"] = "true"
TEST_BASE_URL = "https://testserver"

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Organization,
    OrganizationMembership,
    OrganizationRole,
    User,
    UserRole,
)
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
    with TestClient(app, base_url=TEST_BASE_URL) as test_client:
        yield test_client


@pytest.fixture()
def pinlab_org(db):
    organization = Organization(slug="pinlab-internal", name="PinLab Internal", kind="pinlab")
    db.add(organization)
    db.commit()
    db.refresh(organization)
    return organization


def create_user(
    db,
    email: str,
    role: UserRole,
    password: str = "Password123!",
    organization: Organization | None = None,
    organization_role: OrganizationRole | None = None,
) -> User:
    user = User(
        email=email,
        full_name=email.split("@")[0].title(),
        hashed_password=hash_password(password),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.flush()
    if organization is not None and organization_role is not None:
        db.add(
            OrganizationMembership(
                user_id=user.id,
                organization_id=organization.id,
                role=organization_role,
            )
        )
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def admin(db, pinlab_org):
    return create_user(
        db,
        "admin@example.com",
        UserRole.admin,
        organization=pinlab_org,
        organization_role=OrganizationRole.pinlab_super_admin,
    )


@pytest.fixture()
def technician(db, pinlab_org):
    return create_user(
        db,
        "tech@example.com",
        UserRole.technician,
        organization=pinlab_org,
        organization_role=OrganizationRole.pinlab_technician,
    )


@pytest.fixture()
def viewer(db, pinlab_org):
    return create_user(
        db,
        "viewer@example.com",
        UserRole.viewer,
        organization=pinlab_org,
        organization_role=OrganizationRole.viewer,
    )


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
