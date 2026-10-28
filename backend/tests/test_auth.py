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
