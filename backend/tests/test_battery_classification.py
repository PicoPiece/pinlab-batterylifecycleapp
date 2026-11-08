from datetime import datetime, timezone

from sqlalchemy import select

from app.models import Battery, BatteryClassification, BatteryStatus, Measurement, SecurityAuditEvent

from .conftest import create_user
from .test_telemetry_dashboard import create_mapped_battery, make_sample
from app.models import Organization, OrganizationRole, UserRole


def test_admin_classifies_and_audits_passport(admin_client, db):
    created = admin_client.post("/api/v1/batteries", json={"asset_id": "CLASS-001"})
    assert created.status_code == 201
    battery = created.json()
    assert battery["classification"] is None

    response = admin_client.patch(
        f"/api/v1/batteries/{battery['id']}/classification",
        json={"classification": "real"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["classification"] == "real"

    actions = set(db.scalars(select(SecurityAuditEvent.action)).all())
    assert "battery.classification.update" in actions
    assert admin_client.patch(
        f"/api/v1/batteries/{battery['id']}/classification",
        json={"classification": "not-a-class"},
    ).status_code == 422


def test_classification_is_not_inferred_from_asset_prefix(admin_client):
    fake_demo_name = admin_client.post(
        "/api/v1/batteries", json={"asset_id": "DEMO-BUT-REAL-001"}
    ).json()
    fake_real_name = admin_client.post(
        "/api/v1/batteries", json={"asset_id": "PL-BUT-DEMO-001"}
    ).json()
    assert admin_client.patch(
        f"/api/v1/batteries/{fake_demo_name['id']}/classification",
        json={"classification": "real"},
    ).json()["classification"] == "real"
    assert admin_client.patch(
        f"/api/v1/batteries/{fake_real_name['id']}/classification",
        json={"classification": "demo"},
    ).json()["classification"] == "demo"
    assert admin_client.get(
        f"/api/v1/batteries/{fake_demo_name['id']}"
    ).json()["classification"] == "real"
    assert admin_client.get(
        f"/api/v1/batteries/{fake_real_name['id']}"
    ).json()["classification"] == "demo"


def test_viewer_cannot_change_classification(viewer_client, db, admin, pinlab_org):
    battery = Battery(
        asset_id="CLASS-VIEWER-001",
        classification=BatteryClassification.real,
        status=BatteryStatus.received,
        organization_id=pinlab_org.id,
        created_by_id=admin.id,
        updated_by_id=admin.id,
    )
    db.add(battery)
    db.commit()
    db.refresh(battery)
    denied = viewer_client.patch(
        f"/api/v1/batteries/{battery.id}/classification",
        json={"classification": "demo"},
    )
    assert denied.status_code == 404
    db.refresh(battery)
    assert battery.classification == BatteryClassification.real


def test_cross_organization_classification_is_hidden(admin_client, db):
    other_org = Organization(slug="classification-other", name="Classification Other", kind="agency")
    db.add(other_org)
    db.commit()
    db.refresh(other_org)
    other_admin = create_user(
        db,
        "classification-other@example.com",
        UserRole.viewer,
        organization=other_org,
        organization_role=OrganizationRole.agency_admin,
    )
    from .conftest import TEST_BASE_URL, login
    from fastapi.testclient import TestClient
    from app.main import app

    battery = admin_client.post(
        "/api/v1/batteries",
        json={"asset_id": "CLASS-CROSS-001", "organization_id": 1},
    ).json()
    client = TestClient(app, base_url=TEST_BASE_URL)
    login(client, other_admin.email)
    try:
        response = client.patch(
            f"/api/v1/batteries/{battery['id']}/classification",
            json={"classification": "demo"},
        )
        assert response.status_code == 404
    finally:
        client.close()


def test_dashboard_reports_backend_classification_counts(admin_client):
    real = admin_client.post("/api/v1/batteries", json={"asset_id": "COUNT-REAL"}).json()
    demo = admin_client.post("/api/v1/batteries", json={"asset_id": "COUNT-DEMO"}).json()
    unclassified = admin_client.post("/api/v1/batteries", json={"asset_id": "COUNT-UNCLASSIFIED"}).json()
    assert admin_client.patch(
        f"/api/v1/batteries/{real['id']}/classification", json={"classification": "real"}
    ).status_code == 200
    assert admin_client.patch(
        f"/api/v1/batteries/{demo['id']}/classification", json={"classification": "demo"}
    ).status_code == 200
    data = admin_client.get("/api/v1/dashboard").json()
    assert data["real_batteries"] == 1
    assert data["demo_batteries"] == 1
    assert data["unclassified_batteries"] == 1
    assert data["total_batteries"] == 3
    assert unclassified["classification"] is None


def test_latest_telemetry_exposes_classification_and_provenance(admin_client, db, admin, pinlab_org):
    battery, gateway = create_mapped_battery(db, admin, pinlab_org, "CLASS-TELEMETRY-001")
    battery.classification = "real"
    now = datetime.now(timezone.utc)
    make_sample(
        db,
        battery,
        gateway,
        message_id="real-sample",
        measured_at=now,
        received_at=now,
        source="REAL_BMS",
    )
    make_sample(
        db,
        battery,
        gateway,
        message_id="simulated-sample",
        measured_at=now,
        received_at=now,
        source="SIMULATED",
    )
    db.commit()

    response = admin_client.get(f"/api/v1/batteries/{battery.id}/telemetry/latest")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["battery_classification"] == "real"
    assert data["has_real_telemetry"] is True
    assert data["telemetry_source"] == "REAL_BMS"
    assert data["latest_any_source"] == "SIMULATED"
    assert data["sample"]["source"] == "REAL_BMS"
    # Automated telemetry must not create a manual measurement record.
    assert db.scalar(select(Measurement).where(Measurement.battery_id == battery.id)) is None


def test_real_classification_with_only_simulated_samples_has_no_verified_sample(
    admin_client, db, admin, pinlab_org
):
    battery, gateway = create_mapped_battery(db, admin, pinlab_org, "CLASS-NOSIM-001")
    battery.classification = "real"
    now = datetime.now(timezone.utc)
    make_sample(
        db,
        battery,
        gateway,
        message_id="sim-only",
        measured_at=now,
        received_at=now,
        source="SIMULATED",
    )
    db.commit()
    data = admin_client.get(f"/api/v1/batteries/{battery.id}/telemetry/latest").json()
    assert data["battery_classification"] == "real"
    assert data["has_real_telemetry"] is False
    assert data["telemetry_source"] is None
    assert data["sample"] is None
    assert data["latest_any_source"] == "SIMULATED"
