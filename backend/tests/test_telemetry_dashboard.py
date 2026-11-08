from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app
from app.models import (
    Battery,
    BatteryStatus,
    Gateway,
    GatewayBatteryAssignment,
    Organization,
    OrganizationRole,
    TelemetrySample,
    UserRole,
)

from .conftest import TEST_BASE_URL, create_user, login


def cells_with(overrides: dict[int, int]) -> list[int]:
    cells = [3300] * 16
    for index, value in overrides.items():
        cells[index] = value
    return cells


def make_sample(
    db,
    battery,
    gateway,
    *,
    message_id: str,
    measured_at: datetime,
    received_at: datetime | None = None,
    cells: list[int] | None = None,
    temperatures: list[float] | None = None,
    pack_voltage_v: float = 52.534,
    pack_current_a: float = 0.0,
    soc_pct: float = 35.45,
    source: str = "REAL_BMS",
) -> TelemetrySample:
    sample = TelemetrySample(
        gateway_id=gateway.id,
        battery_id=battery.id,
        organization_id=battery.organization_id,
        message_id=message_id,
        schema_version=1,
        battery_slot=0,
        measured_at=measured_at,
        received_at=received_at or measured_at,
        time_quality="gateway_ntp",
        source=source,
        protocol="PYLON_485",
        pack_voltage_v=pack_voltage_v,
        pack_current_a=pack_current_a,
        soc_pct=soc_pct,
        soh_pct=None,
        capacity_remaining_ah=35.450,
        capacity_full_ah=100.0,
        cell_voltages_mv=cells or [3300] * 16,
        temperatures_c=temperatures or [32.3, 29.0, 28.9, 29.0, 29.2],
        raw_payload={},
    )
    db.add(sample)
    db.flush()
    return sample


def create_mapped_battery(db, admin, organization, asset_id: str) -> tuple[Battery, Gateway]:
    battery = Battery(
        asset_id=asset_id,
        manufacturer="APESS",
        model="ES-LV-5",
        chemistry="LiFePO4",
        status=BatteryStatus.in_service,
        organization_id=organization.id,
        created_by_id=admin.id,
        updated_by_id=admin.id,
    )
    gateway = Gateway(
        gateway_id=f"GW-{asset_id}",
        name=f"Analytics test gateway {asset_id}",
        organization_id=organization.id,
    )
    db.add_all([battery, gateway])
    db.flush()
    db.add(
        GatewayBatteryAssignment(
            gateway_id=gateway.id,
            battery_slot=0,
            battery_id=battery.id,
            assigned_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
    )
    db.commit()
    db.refresh(battery)
    db.refresh(gateway)
    return battery, gateway


def test_latest_telemetry_is_authorized_and_verified(admin_client, db, admin, pinlab_org):
    battery, gateway = create_mapped_battery(db, admin, pinlab_org, "ANALYTICS-001")
    now = datetime.now(timezone.utc)
    make_sample(
        db,
        battery,
        gateway,
        message_id="analytics-latest",
        measured_at=now - timedelta(seconds=5),
        received_at=now - timedelta(seconds=4),
        cells=cells_with({2: 3250, 8: 3350}),
        pack_voltage_v=52.534,
        soc_pct=35.45,
    )
    db.commit()

    response = admin_client.get(f"/api/v1/batteries/{battery.id}/telemetry/latest")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["asset_id"] == "ANALYTICS-001"
    assert body["sample"]["source"] == "REAL_BMS"
    assert body["sample"]["soh_pct"] is None
    assert body["sample"]["cell_min_mv"] == 3250
    assert body["sample"]["cell_max_mv"] == 3350
    assert body["sample"]["cell_delta_mv"] == 100
    assert body["sample"]["cell_min_index"] == 3
    assert body["sample"]["cell_max_index"] == 9
    assert len(body["sample"]["cell_voltages_mv"]) == 16
    assert len(body["sample"]["temperatures_c"]) == 5
    assert body["gateway"]["gateway_id"] == "GW-ANALYTICS-001"
    assert body["gateway"]["connectivity"]["status"] == "online"


def test_latest_marks_stale_and_offline_from_received_at(admin_client, db, admin, pinlab_org):
    battery, gateway = create_mapped_battery(db, admin, pinlab_org, "ANALYTICS-002")
    now = datetime.now(timezone.utc)
    sample = make_sample(
        db,
        battery,
        gateway,
        message_id="analytics-stale",
        measured_at=now - timedelta(minutes=2),
        received_at=now - timedelta(minutes=2),
    )
    db.commit()

    stale = admin_client.get(f"/api/v1/batteries/{battery.id}/telemetry/latest")
    assert stale.status_code == 200
    assert stale.json()["gateway"]["connectivity"]["status"] == "stale"

    sample.received_at = now - timedelta(minutes=10)
    db.commit()
    offline = admin_client.get(f"/api/v1/batteries/{battery.id}/telemetry/latest")
    assert offline.status_code == 200
    assert offline.json()["gateway"]["connectivity"]["status"] == "offline"


def test_raw_hour_history_keeps_cells_and_temperatures(admin_client, db, admin, pinlab_org):
    battery, gateway = create_mapped_battery(db, admin, pinlab_org, "ANALYTICS-003")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    make_sample(
        db,
        battery,
        gateway,
        message_id="raw-1",
        measured_at=now - timedelta(seconds=30),
        received_at=now - timedelta(seconds=29),
        cells=cells_with({3: 3280}),
    )
    make_sample(
        db,
        battery,
        gateway,
        message_id="raw-2",
        measured_at=now - timedelta(seconds=20),
        received_at=now - timedelta(seconds=19),
        cells=cells_with({3: 3290}),
    )
    db.commit()

    response = admin_client.get(
        f"/api/v1/batteries/{battery.id}/telemetry/history?range=1h"
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["range"] == "1h"
    assert body["bucket_seconds"] == 0
    assert body["point_count"] == 2
    assert [point["cell_delta_mv"] for point in body["pack"]] == [20.0, 10.0]
    assert all(len(point["avg_mv"]) == 16 for point in body["cells"])
    assert body["cells"][0]["avg_mv"][0] == 3300
    assert body["cells"][0]["avg_mv"][3] == 3280
    assert body["cells"][0]["avg_mv"][15] == 3300
    assert all(len(point["values_c"]) == 5 for point in body["temperatures"])
    assert body["pack"][0]["measured_at"] < body["pack"][1]["measured_at"]


def test_bucketed_history_preserves_extrema_and_per_sample_delta(admin_client, db, admin, pinlab_org):
    battery, gateway = create_mapped_battery(db, admin, pinlab_org, "ANALYTICS-004")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    bucket_epoch = int((now - timedelta(hours=2)).timestamp() // 300) * 300
    bucket_time = datetime.fromtimestamp(bucket_epoch, tz=timezone.utc)
    make_sample(
        db,
        battery,
        gateway,
        message_id="bucket-wide",
        measured_at=bucket_time,
        received_at=bucket_time,
        cells=cells_with({2: 3250, 8: 3350}),
    )
    make_sample(
        db,
        battery,
        gateway,
        message_id="bucket-narrow",
        measured_at=bucket_time + timedelta(seconds=40),
        received_at=bucket_time + timedelta(seconds=40),
        cells=cells_with({2: 3270, 8: 3300}),
    )
    db.commit()

    response = admin_client.get(
        f"/api/v1/batteries/{battery.id}/telemetry/history?range=24h"
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["bucket_seconds"] == 300
    assert body["point_count"] == 1
    point = body["pack"][0]
    assert point["cell_min_mv"] == 3250
    assert point["cell_max_mv"] == 3350
    assert point["cell_delta_mv"] == 100
    # Per-cell min/max remain visible even though the bucket average is 3260.
    assert body["cells"][0]["min_mv"][2] == 3250
    assert body["cells"][0]["max_mv"][8] == 3350


def test_analytics_excludes_unverified_sources(admin_client, db, admin, pinlab_org):
    battery, gateway = create_mapped_battery(db, admin, pinlab_org, "ANALYTICS-007")
    now = datetime.now(timezone.utc)
    make_sample(
        db,
        battery,
        gateway,
        message_id="real-only",
        measured_at=now - timedelta(seconds=20),
        received_at=now - timedelta(seconds=19),
        source="REAL_BMS",
    )
    make_sample(
        db,
        battery,
        gateway,
        message_id="simulated-newer",
        measured_at=now - timedelta(seconds=2),
        received_at=now - timedelta(seconds=1),
        source="SIMULATED",
    )
    db.commit()

    latest = admin_client.get(f"/api/v1/batteries/{battery.id}/telemetry/latest")
    assert latest.status_code == 200
    assert latest.json()["sample"]["message_id"] == "real-only"
    assert latest.json()["sample"]["source"] == "REAL_BMS"

    history = admin_client.get(f"/api/v1/batteries/{battery.id}/telemetry/history?range=1h")
    assert history.status_code == 200
    assert history.json()["point_count"] == 1


def test_no_telemetry_returns_empty_latest_and_history(admin_client, db, admin, pinlab_org):
    battery, _ = create_mapped_battery(db, admin, pinlab_org, "ANALYTICS-005")
    latest = admin_client.get(f"/api/v1/batteries/{battery.id}/telemetry/latest")
    assert latest.status_code == 200
    assert latest.json()["sample"] is None
    assert latest.json()["gateway"]["connectivity"]["status"] == "unknown"

    history = admin_client.get(f"/api/v1/batteries/{battery.id}/telemetry/history?range=7d")
    assert history.status_code == 200
    assert history.json()["point_count"] == 0
    assert history.json()["pack"] == []
    assert history.json()["cells"] == []


def test_history_can_omit_cells_for_fast_pack_loading(admin_client, db, admin, pinlab_org):
    battery, gateway = create_mapped_battery(db, admin, pinlab_org, "ANALYTICS-008")
    make_sample(
        db,
        battery,
        gateway,
        message_id="pack-only",
        measured_at=datetime.now(timezone.utc) - timedelta(seconds=5),
    )
    db.commit()
    response = admin_client.get(
        f"/api/v1/batteries/{battery.id}/telemetry/history?range=7d&include_cells=false"
    )
    assert response.status_code == 200
    assert response.json()["point_count"] == 1
    assert response.json()["cells"] == []
    assert len(response.json()["temperatures"]) == 1


def test_invalid_range_is_rejected(admin_client, db, admin, pinlab_org):
    battery, _ = create_mapped_battery(db, admin, pinlab_org, "ANALYTICS-006")
    response = admin_client.get(
        f"/api/v1/batteries/{battery.id}/telemetry/history?range=30d"
    )
    assert response.status_code == 422


def test_cross_organization_telemetry_is_hidden(db, admin, pinlab_org):
    agency_a = Organization(slug="analytics-a", name="Analytics A", kind="agency")
    agency_b = Organization(slug="analytics-b", name="Analytics B", kind="agency")
    db.add_all([agency_a, agency_b])
    db.commit()
    db.refresh(agency_a)
    db.refresh(agency_b)
    battery_a, gateway_a = create_mapped_battery(db, admin, agency_a, "ANALYTICS-A")
    battery_b, gateway_b = create_mapped_battery(db, admin, agency_b, "ANALYTICS-B")
    make_sample(
        db,
        battery_a,
        gateway_a,
        message_id="tenant-a",
        measured_at=datetime.now(timezone.utc) - timedelta(seconds=5),
    )
    make_sample(
        db,
        battery_b,
        gateway_b,
        message_id="tenant-b",
        measured_at=datetime.now(timezone.utc) - timedelta(seconds=5),
    )
    db.commit()
    a_admin = create_user(
        db,
        "analytics-a-admin@example.com",
        UserRole.viewer,
        organization=agency_a,
        organization_role=OrganizationRole.agency_admin,
    )
    client = TestClient(app, base_url=TEST_BASE_URL)
    login(client, a_admin.email)
    try:
        assert client.get(f"/api/v1/batteries/{battery_a.id}/telemetry/latest").status_code == 200
        assert client.get(f"/api/v1/batteries/{battery_a.id}/telemetry/history").status_code == 200
        assert client.get(f"/api/v1/batteries/{battery_a.id}/telemetry/evidence").status_code == 200
        assert client.get(f"/api/v1/batteries/{battery_b.id}/telemetry/latest").status_code == 404
        assert client.get(f"/api/v1/batteries/{battery_b.id}/telemetry/history").status_code == 404
        assert client.get(f"/api/v1/batteries/{battery_b.id}/telemetry/evidence").status_code == 404
    finally:
        client.close()


def _evidence_cells(first: int, last: int) -> list[int]:
    cells = [3280] * 16
    cells[0] = first
    cells[15] = last
    return cells


def test_diagnostic_evidence_is_bounded_and_traceable(admin_client, db, admin, pinlab_org):
    battery, gateway = create_mapped_battery(db, admin, pinlab_org, "EVIDENCE-001")
    battery.classification = "real"
    now = datetime.now(timezone.utc).replace(microsecond=0)
    make_sample(
        db,
        battery,
        gateway,
        message_id="evidence-1",
        measured_at=now - timedelta(seconds=100),
        received_at=now - timedelta(seconds=99),
        cells=_evidence_cells(3278, 3282),
        temperatures=[30.0, 30.1, 30.2, 30.3, 30.4],
    )
    make_sample(
        db,
        battery,
        gateway,
        message_id="evidence-2",
        measured_at=now - timedelta(seconds=45),
        received_at=now - timedelta(seconds=44),
        cells=_evidence_cells(3280, 3281),
        temperatures=[31.0, 31.1, 31.2, 31.3, 31.4],
    )
    make_sample(
        db,
        battery,
        gateway,
        message_id="evidence-3",
        measured_at=now - timedelta(seconds=35),
        received_at=now - timedelta(seconds=34),
        cells=_evidence_cells(3281, 3281),
        temperatures=[32.0, 32.1, 32.2, 32.3, 32.4],
    )
    # A newer SIMULATED row must not contaminate verified evidence.
    make_sample(
        db,
        battery,
        gateway,
        message_id="evidence-simulated",
        measured_at=now,
        received_at=now,
        source="SIMULATED",
    )
    db.commit()

    response = admin_client.get(
        f"/api/v1/batteries/{battery.id}/telemetry/evidence?range=1h"
    )
    assert response.status_code == 200, response.text
    evidence = response.json()
    assert evidence["schema_version"] == "diagnostic-evidence-v1"
    assert evidence["battery_id"] == battery.id
    assert evidence["battery_classification"] == "real"
    assert evidence["sample_count"] == 3
    assert evidence["expected_interval_seconds"] == 10
    assert evidence["data_completeness_pct"] > 0
    assert evidence["pack"]["pack_voltage"]["unit"] == "V"
    assert evidence["pack"]["pack_current"]["unit"] == "A"
    assert evidence["pack"]["peak_abs_current_a"] == 0.0
    assert evidence["pack"]["temperature_min_c"] == 30.0
    assert evidence["pack"]["temperature_max_c"] == 32.4
    assert evidence["cell_delta"]["min"] == 1.0
    assert evidence["cell_delta"]["max"] == 4.0
    assert len(evidence["cells"]) == 16
    assert evidence["cells"][0]["cell_index"] == 1
    assert evidence["cells"][15]["cell_index"] == 16
    assert evidence["cells"][0]["cell_voltage"]["min"] == 3278.0
    assert evidence["cells"][15]["cell_voltage"]["max"] == 3282.0
    assert len(evidence["temperatures"]) == 5
    assert evidence["provenance"]["source"] == "REAL_BMS"
    assert evidence["provenance"]["verified_source_only"] is True
    assert evidence["provenance"]["gateway_id"] == gateway.gateway_id
    # 100s -> 45s is a 55s gap over the 30s threshold.
    assert len(evidence["measurement_gaps"]) == 1
    assert evidence["measurement_gaps"][0]["duration_seconds"] == 55.0
    assert any("not cryptographic proof" in item for item in evidence["limitations"])


def test_diagnostic_evidence_requires_auth():
    client = TestClient(app, base_url=TEST_BASE_URL)
    try:
        assert client.get("/api/v1/batteries/17/telemetry/evidence").status_code == 401
    finally:
        client.close()


def test_diagnostic_completeness_uses_assignment_window(admin_client, db, admin, pinlab_org):
    battery, _ = create_mapped_battery(db, admin, pinlab_org, "EVIDENCE-WINDOW")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    assignment = db.scalar(
        select(GatewayBatteryAssignment).where(
            GatewayBatteryAssignment.battery_id == battery.id,
            GatewayBatteryAssignment.unassigned_at.is_(None),
        )
    )
    assignment.assigned_at = now - timedelta(minutes=30)
    db.commit()

    evidence = admin_client.get(
        f"/api/v1/batteries/{battery.id}/telemetry/evidence?range=24h"
    ).json()
    assert evidence["sample_count"] == 0
    assert evidence["monitoring_from_at"] is not None
    assert evidence["monitoring_to_at"] is not None
    assert evidence["completeness_basis"] == "active_gateway_assignment_window"
    # 30 minutes / 10-second cadence, not the full 24-hour range.
    assert 180 <= evidence["expected_sample_count"] <= 182


def test_diagnostic_evidence_without_telemetry(admin_client, db, admin, pinlab_org):
    battery, _ = create_mapped_battery(db, admin, pinlab_org, "EVIDENCE-EMPTY")
    response = admin_client.get(
        f"/api/v1/batteries/{battery.id}/telemetry/evidence?range=7d"
    )
    assert response.status_code == 200
    evidence = response.json()
    assert evidence["sample_count"] == 0
    assert evidence["data_completeness_pct"] == 0.0
    assert evidence["cells"] == []
    assert evidence["temperatures"] == []
    assert evidence["measurement_gaps"] == []
