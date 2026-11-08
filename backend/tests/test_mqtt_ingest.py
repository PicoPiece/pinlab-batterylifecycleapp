import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models import (
    Battery,
    BatteryStatus,
    Gateway,
    GatewayBatteryAssignment,
    TelemetrySample,
)
from app.mqtt.contract import TelemetryValidationError, validate_payload
from app.mqtt.ingest import GatewayRejected, PayloadRejected, ingest_telemetry
from app.retention import expire_telemetry


def payload_for(gateway_id="GW-000001", message_id="msg-1", measured_at=None, source="SIMULATED"):
    path = Path(__file__).parents[1] / "app" / "mqtt" / "schema" / "telemetry-v1.simulated.json"
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
    payload["gateway_id"] = gateway_id
    payload["message_id"] = message_id
    payload["source"] = source
    payload["measured_at"] = (measured_at or datetime.now(timezone.utc)).isoformat().replace("+00:00", "Z")
    return payload


@pytest.fixture()
def gateway_mapping(db, admin, pinlab_org):
    battery = Battery(
        asset_id="DEMO-MQTT-001",
        serial_number="SIM-MQTT-001",
        status=BatteryStatus.received,
        organization_id=pinlab_org.id,
        created_by_id=admin.id,
        updated_by_id=admin.id,
    )
    db.add(battery)
    db.flush()
    gateway = Gateway(
        gateway_id="GW-000001",
        name="MQTT TEST Gateway",
        organization_id=pinlab_org.id,
    )
    db.add(gateway)
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
    return gateway, battery


def test_valid_telemetry_persists_and_deduplicates(db, gateway_mapping):
    gateway, battery = gateway_mapping
    payload = payload_for()
    result = ingest_telemetry(db, topic_gateway_id=gateway.gateway_id, payload=payload, allow_simulated=True)
    assert result.status == "stored"
    assert result.battery_id == battery.id
    assert db.scalar(select(TelemetrySample)) is not None
    again = ingest_telemetry(db, topic_gateway_id=gateway.gateway_id, payload=payload, allow_simulated=True)
    assert again.status == "duplicate"
    assert db.query(TelemetrySample).count() == 1


def test_unknown_gateway_and_topic_mismatch_are_rejected(db, gateway_mapping):
    gateway, _ = gateway_mapping
    with pytest.raises(GatewayRejected):
        ingest_telemetry(
            db,
            topic_gateway_id="GW-999999",
            payload=payload_for(gateway_id="GW-999999"),
            allow_simulated=True,
        )
    with pytest.raises(GatewayRejected):
        ingest_telemetry(db, topic_gateway_id="GW-OTHER", payload=payload_for(), allow_simulated=True)


def test_invalid_payload_and_simulated_gate(db, gateway_mapping):
    gateway, _ = gateway_mapping
    payload = payload_for()
    payload["cell_voltages_mv"] = [3200] * 15
    with pytest.raises(PayloadRejected):
        ingest_telemetry(db, topic_gateway_id=gateway.gateway_id, payload=payload, allow_simulated=True)
    with pytest.raises(TelemetryValidationError):
        validate_payload(payload_for(), allow_simulated=False)


def test_mapping_history_uses_measured_at(db, admin, pinlab_org, gateway_mapping):
    gateway, old_battery = gateway_mapping
    new_battery = Battery(
        asset_id="DEMO-MQTT-002",
        status=BatteryStatus.received,
        organization_id=pinlab_org.id,
        created_by_id=admin.id,
        updated_by_id=admin.id,
    )
    db.add(new_battery)
    db.flush()
    old_at = datetime.now(timezone.utc) - timedelta(days=10)
    active = db.scalar(
        select(GatewayBatteryAssignment).where(
            GatewayBatteryAssignment.gateway_id == gateway.id,
            GatewayBatteryAssignment.battery_slot == 0,
            GatewayBatteryAssignment.unassigned_at.is_(None),
        )
    )
    active.assigned_at = old_at
    active.unassigned_at = old_at + timedelta(days=2)
    db.add(
        GatewayBatteryAssignment(
            gateway_id=gateway.id,
            battery_slot=0,
            battery_id=new_battery.id,
            assigned_at=old_at + timedelta(days=2),
        )
    )
    db.commit()
    result = ingest_telemetry(
        db,
        topic_gateway_id=gateway.gateway_id,
        payload=payload_for(message_id="old-msg", measured_at=old_at + timedelta(hours=1)),
        allow_simulated=True,
    )
    assert result.battery_id == old_battery.id


def test_retention_only_removes_expired_telemetry(db, gateway_mapping):
    gateway, _ = gateway_mapping
    old_at = datetime.now(timezone.utc) - timedelta(days=10)
    new_at = datetime.now(timezone.utc) - timedelta(days=1)
    active = db.scalar(
        select(GatewayBatteryAssignment).where(
            GatewayBatteryAssignment.gateway_id == gateway.id,
            GatewayBatteryAssignment.battery_slot == 0,
            GatewayBatteryAssignment.unassigned_at.is_(None),
        )
    )
    active.assigned_at = old_at - timedelta(days=1)
    db.commit()
    ingest_telemetry(
        db,
        topic_gateway_id=gateway.gateway_id,
        payload=payload_for(message_id="old-msg", measured_at=old_at),
        allow_simulated=True,
    )
    ingest_telemetry(
        db,
        topic_gateway_id=gateway.gateway_id,
        payload=payload_for(message_id="new-msg", measured_at=new_at),
        allow_simulated=True,
    )
    cutoff, count = expire_telemetry(db, days=7, apply=True)
    assert count == 1
    remaining = list(db.scalars(select(TelemetrySample)).all())
    assert len(remaining) == 1 and remaining[0].message_id == "new-msg"
    assert db.scalar(select(Battery).where(Battery.asset_id == "DEMO-MQTT-001")) is not None
