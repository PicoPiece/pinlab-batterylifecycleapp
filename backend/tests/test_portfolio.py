def create_battery(client, asset_id: str) -> dict:
    response = client.post(
        "/api/v1/batteries",
        json={
            "asset_id": asset_id,
            "manufacturer": "Demo",
            "model": "Test pack",
            "chemistry": "LFP",
            "nominal_voltage_v": 48,
            "nominal_capacity_ah": 100,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_portfolio_has_latest_source_and_evidence(admin_client):
    battery = create_battery(admin_client, "PORT-001")
    for metric, value, unit in [("soc", 61, "%"), ("soh", 88, "%"), ("voltage", 51.2, "V")]:
        response = admin_client.post(
            f"/api/v1/batteries/{battery['id']}/measurements",
            json={"metric": metric, "value": value, "unit": unit, "source": "mock"},
        )
        assert response.status_code == 201, response.text

    inspection = admin_client.post(
        f"/api/v1/batteries/{battery['id']}/inspections",
        json={"test_type": "Visual inspection", "result": "passed"},
    )
    assert inspection.status_code == 201, inspection.text

    evidence = admin_client.post(
        f"/api/v1/batteries/{battery['id']}/attachments",
        files={"file": ("evidence.png", b"\x89PNG\r\n\x1a\nDEMO", "image/png")},
    )
    assert evidence.status_code == 201, evidence.text

    response = admin_client.get("/api/v1/batteries/portfolio")
    assert response.status_code == 200, response.text
    row = next(item for item in response.json() if item["asset_id"] == "PORT-001")
    assert row["latest"]["soc"]["value"] == 61
    assert row["latest"]["soh"]["source"] == "mock"
    assert row["latest"]["voltage"]["unit"] == "V"
    assert row["inspection_count"] == 1
    assert row["evidence_count"] == 1
    assert row["latest_measurement_at"] is not None
    assert row["last_inspection_at"] is not None


def test_latest_measurements_include_all_supported_metrics(admin_client):
    battery = create_battery(admin_client, "PORT-002")
    for metric, value, unit in [
        ("soc", 50, "%"),
        ("soh", 90, "%"),
        ("voltage", 50.5, "V"),
        ("current", -2.5, "A"),
        ("temperature", 30.2, "°C"),
    ]:
        admin_client.post(
            f"/api/v1/batteries/{battery['id']}/measurements",
            json={"metric": metric, "value": value, "unit": unit, "source": "manual"},
        )
    response = admin_client.get(f"/api/v1/batteries/{battery['id']}/measurements/latest")
    assert response.status_code == 200
    for metric in ("soc", "soh", "voltage", "current", "temperature"):
        assert response.json()[metric] is not None


def test_global_inspection_list_and_inspection_evidence(admin_client):
    battery = create_battery(admin_client, "PORT-003")
    inspection = admin_client.post(
        f"/api/v1/batteries/{battery['id']}/inspections",
        json={"test_type": "Insulation check", "result": "conditional", "notes": "DEMO/SIMULATED"},
    ).json()

    listing = admin_client.get("/api/v1/inspections")
    assert listing.status_code == 200, listing.text
    item = next(row for row in listing.json()["items"] if row["id"] == inspection["id"])
    assert item["asset_id"] == "PORT-003"
    assert item["evidence_count"] == 0
    assert item["technician"]

    upload = admin_client.post(
        f"/api/v1/inspections/{inspection['id']}/attachments",
        files={"file": ("check.pdf", b"%PDF-1.4 DEMO", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    files = admin_client.get(f"/api/v1/inspections/{inspection['id']}/attachments")
    assert files.status_code == 200
    assert len(files.json()) == 1


def test_dashboard_fleet_health_is_explainable_and_distinct_from_soh(admin_client):
    battery = create_battery(admin_client, "PORT-004")
    admin_client.post(
        f"/api/v1/batteries/{battery['id']}/measurements",
        json={"metric": "soh", "value": 90, "unit": "%", "source": "manual"},
    )
    admin_client.post(
        f"/api/v1/batteries/{battery['id']}/measurements",
        json={"metric": "soc", "value": 60, "unit": "%", "source": "manual"},
    )
    response = admin_client.get("/api/v1/dashboard")
    assert response.status_code == 200
    health = response.json()["fleet_health"]
    assert health["score"] > 0
    assert health["weighted_soh"] == 90
    assert health["formula"] == "70% weighted SOH + 15% data coverage + 15% inspection currency"
    assert "soh" not in health["formula"].lower() or "weighted soh" in health["formula"].lower()
