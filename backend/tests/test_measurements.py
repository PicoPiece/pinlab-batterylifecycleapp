def create_battery(client, asset_id="TEST-001"):
    response = client.post("/api/v1/batteries", json={"asset_id": asset_id, "chemistry": "LFP"})
    assert response.status_code == 201, response.text
    return response.json()


def test_measurement_latest_and_dashboard(admin_client):
    battery = create_battery(admin_client, "MEAS-001")
    for metric, value in [("soc", 55), ("soh", 91)]:
        response = admin_client.post(
            f"/api/v1/batteries/{battery['id']}/measurements",
            json={"metric": metric, "value": value, "unit": "%", "source": "manual"},
        )
        assert response.status_code == 201, response.text

    latest = admin_client.get(f"/api/v1/batteries/{battery['id']}/measurements/latest")
    assert latest.status_code == 200
    assert latest.json()["soc"]["value"] == 55
    assert latest.json()["soh"]["value"] == 91

    dashboard = admin_client.get("/api/v1/dashboard")
    assert dashboard.status_code == 200
    data = dashboard.json()
    assert data["total_batteries"] == 1
    assert data["soc_available"] == 1
    assert data["soh_available"] == 1


def test_inspection_creates_lifecycle_event(admin_client):
    battery = create_battery(admin_client, "INSP-001")
    response = admin_client.post(
        f"/api/v1/batteries/{battery['id']}/inspections",
        json={
            "test_type": "Visual inspection",
            "result": "passed",
            "measured_parameters": {"visual": "ok"},
            "notes": "Không phát hiện bất thường",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["result"] == "passed"

    events = admin_client.get(f"/api/v1/batteries/{battery['id']}/lifecycle-events")
    assert events.status_code == 200
    assert any(item["event_type"] == "inspected" for item in events.json()["items"])


def test_mock_measurement_is_labeled(admin_client):
    battery = create_battery(admin_client, "MOCK-001")
    response = admin_client.post(
        f"/api/v1/batteries/{battery['id']}/measurements",
        json={"metric": "soc", "value": 50, "unit": "%", "source": "mock"},
    )
    assert response.status_code == 201
    assert response.json()["notes"].startswith("SIMULATED")
