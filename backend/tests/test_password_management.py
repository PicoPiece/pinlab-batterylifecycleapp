from fastapi.testclient import TestClient

from app.main import app


def create_user_via_admin(admin_client, email, role="viewer", password="TempPassword123!"):
    response = admin_client.post(
        "/api/v1/users",
        json={"email": email, "full_name": email.split("@")[0], "role": role, "password": password},
    )
    assert response.status_code == 201, response.text
    return response.json()


def login_user(email, password):
    client = TestClient(app)
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return client, response


def test_change_password_rejects_bad_policy_and_current(admin_client):
    wrong_current = admin_client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "wrong-password",
            "new_password": "NewPassword123!",
            "confirm_password": "NewPassword123!",
        },
    )
    assert wrong_current.status_code == 400

    too_short = admin_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "Password123!", "new_password": "short", "confirm_password": "short"},
    )
    assert too_short.status_code == 422

    mismatch = admin_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "Password123!", "new_password": "NewPassword123!", "confirm_password": "OtherPassword123!"},
    )
    assert mismatch.status_code == 422

    reuse = admin_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "Password123!", "new_password": "Password123!", "confirm_password": "Password123!"},
    )
    assert reuse.status_code == 422 or reuse.status_code == 400


def test_change_password_revokes_old_session(admin_client):
    old_token = admin_client.cookies.get("pinlab_session")
    response = admin_client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "Password123!",
            "new_password": "NewPassword123!",
            "confirm_password": "NewPassword123!",
        },
    )
    assert response.status_code == 204, response.text

    with TestClient(app) as stale:
        stale.cookies.set("pinlab_session", old_token)
        assert stale.get("/api/v1/auth/me").status_code == 401

    old_login = admin_client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "Password123!"})
    assert old_login.status_code == 401
    new_login = admin_client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "NewPassword123!"})
    assert new_login.status_code == 200
    assert new_login.json()["must_change_password"] is False


def test_first_login_is_forced_and_password_change_unlocks_api(admin_client):
    email = "forced@example.com"
    temp_password = "TempPassword123!"
    created = create_user_via_admin(admin_client, email, "viewer", temp_password)
    assert created["must_change_password"] is True

    user_client, login = login_user(email, temp_password)
    assert login.status_code == 200
    assert login.json()["must_change_password"] is True
    assert user_client.get("/api/v1/auth/me").status_code == 200
    assert user_client.get("/api/v1/dashboard").status_code == 403
    assert user_client.get("/api/v1/batteries").status_code == 403

    changed = user_client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": temp_password,
            "new_password": "SelfServicePassword123!",
            "confirm_password": "SelfServicePassword123!",
        },
    )
    assert changed.status_code == 204, changed.text
    assert user_client.get("/api/v1/dashboard").status_code == 401
    unlocked, login_again = login_user(email, "SelfServicePassword123!")
    assert login_again.status_code == 200
    assert login_again.json()["must_change_password"] is False
    assert unlocked.get("/api/v1/dashboard").status_code == 200


def test_admin_reset_forces_change_and_revokes_target_session(admin_client):
    email = "reset-target@example.com"
    old_password = "TempPassword123!"
    created = create_user_via_admin(admin_client, email, "technician", old_password)
    target_client, login = login_user(email, old_password)
    assert login.status_code == 200
    old_token = target_client.cookies.get("pinlab_session")

    reset = admin_client.post(f"/api/v1/users/{created['id']}/reset-password")
    assert reset.status_code == 200, reset.text
    temporary = reset.json()["temporary_password"]
    assert reset.json()["user"]["must_change_password"] is True
    assert len(temporary) >= 12

    with TestClient(app) as stale:
        stale.cookies.set("pinlab_session", old_token)
        assert stale.get("/api/v1/auth/me").status_code == 401

    reset_client, reset_login = login_user(email, temporary)
    assert reset_login.status_code == 200
    assert reset_login.json()["must_change_password"] is True
    assert reset_client.get("/api/v1/dashboard").status_code == 403
    assert reset_client.get("/api/v1/auth/me").status_code == 200


def test_non_admin_cannot_reset_other_user(admin_client):
    created = create_user_via_admin(admin_client, "role-isolation@example.com", "technician")
    target_client, login = login_user("role-isolation@example.com", "TempPassword123!")
    assert login.status_code == 200
    forbidden = target_client.post("/api/v1/users/1/reset-password")
    assert forbidden.status_code == 403
    assert created["role"] == "technician"


def test_change_password_rate_limit(admin_client):
    for _ in range(5):
        response = admin_client.post(
            "/api/v1/auth/change-password",
            json={
                "current_password": "wrong-password",
                "new_password": "NewPassword123!",
                "confirm_password": "NewPassword123!",
            },
        )
        assert response.status_code == 400
    blocked = admin_client.post(
        "/api/v1/auth/change-password",
        json={
            "current_password": "wrong-password",
            "new_password": "NewPassword123!",
            "confirm_password": "NewPassword123!",
        },
    )
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
