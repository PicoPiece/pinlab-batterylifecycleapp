from app.config import settings
from app.models import UserRole, User


def test_health(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_login_and_me(client, admin):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": admin.email, "password": "Password123!"},
    )
    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == admin.email


def test_wrong_password(client, admin):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": admin.email, "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_viewer_cannot_create_battery(viewer_client):
    response = viewer_client.post(
        "/api/v1/batteries",
        json={"asset_id": "VIEW-001"},
    )
    assert response.status_code == 403


def test_technician_can_create_battery(tech_client):
    response = tech_client.post(
        "/api/v1/batteries",
        json={"asset_id": "TECH-001", "manufacturer": "Demo", "chemistry": "LFP"},
    )
    assert response.status_code == 201
    assert response.json()["asset_id"] == "TECH-001"


def test_logout_invalidates_session(client, admin):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": admin.email, "password": "Password123!"},
    )
    assert login_resp.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 200
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_cookie_secure_flag_in_https_mode(client, admin):
    old_value = settings.cookie_secure
    settings.cookie_secure = True
    try:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": admin.email, "password": "Password123!"},
        )
        assert response.status_code == 200
        cookie = response.headers.get("set-cookie", "")
        assert "HttpOnly" in cookie
        assert "Secure" in cookie
        assert "SameSite=lax" in cookie
    finally:
        settings.cookie_secure = old_value


def test_login_rate_limit_and_admin_not_permanently_locked(client, admin):
    email = "bruteforce@example.com"
    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "wrong-password"},
        )
        assert response.status_code == 401
    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrong-password"},
    )
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers

    still_ok = client.post(
        "/api/v1/auth/login",
        json={"email": admin.email, "password": "Password123!"},
    )
    assert still_ok.status_code == 200


def test_csrf_origin_guard(admin_client):
    blocked = admin_client.post(
        "/api/v1/batteries",
        json={"asset_id": "CSRF-BLOCKED"},
        headers={"Origin": "https://evil.example"},
    )
    assert blocked.status_code == 403
    allowed = admin_client.post(
        "/api/v1/batteries",
        json={"asset_id": "CSRF-ALLOWED"},
        headers={"Origin": settings.cors_origin_list[0]},
    )
    assert allowed.status_code == 201
