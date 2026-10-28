def test_battery_crud_and_lifecycle(admin_client):
    created = admin_client.post(
        "/api/v1/batteries",
        json={
            "asset_id": "VF5-TEST-001",
            "manufacturer": "Demo",
            "chemistry": "LFP",
            "nominal_voltage_v": 400,
            "specification_status": "partial",
        },
    )
    assert created.status_code == 201, created.text
    battery = created.json()
    assert battery["status"] == "received"
    assert battery["specification_status"] == "partial"

    updated = admin_client.patch(
        f"/api/v1/batteries/{battery['id']}",
        json={"status": "tested", "notes": "Kiểm tra xong"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "tested"

    listed = admin_client.get("/api/v1/batteries?search=VF5")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    events = admin_client.get(f"/api/v1/batteries/{battery['id']}/lifecycle-events")
    assert events.status_code == 200
    event_types = [item["event_type"] for item in events.json()["items"]]
    assert "received" in event_types
    assert "status_changed" in event_types


def test_duplicate_asset_id_rejected(admin_client):
    payload = {"asset_id": "DUP-001"}
    assert admin_client.post("/api/v1/batteries", json=payload).status_code == 201
    assert admin_client.post("/api/v1/batteries", json=payload).status_code == 409


def test_soft_delete_admin_only(admin_client, tech_client):
    created = admin_client.post("/api/v1/batteries", json={"asset_id": "DEL-001"})
    battery_id = created.json()["id"]
    assert tech_client.delete(f"/api/v1/batteries/{battery_id}").status_code == 403
    relogin = admin_client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "Password123!"},
    )
    assert relogin.status_code == 200
    assert admin_client.delete(f"/api/v1/batteries/{battery_id}").status_code == 204
    assert admin_client.get(f"/api/v1/batteries/{battery_id}").status_code == 404
