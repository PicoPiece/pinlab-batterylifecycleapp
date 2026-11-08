from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Battery,
    Gateway,
    GatewayBatteryAssignment,
    Organization,
    TelemetrySample,
)
from app.mqtt.contract import TelemetryValidationError, validate_payload


class GatewayRejected(ValueError):
    """Gateway is unknown, disabled, or not authorized for the topic."""


class PayloadRejected(ValueError):
    """Payload is invalid or does not map to an authorized battery."""


@dataclass(frozen=True)
class IngestResult:
    status: str
    sample_id: int
    battery_id: int
    gateway_id: str


def _resolve_assignment(
    db: Session,
    gateway_db_id: int,
    battery_slot: int,
    measured_at: datetime,
) -> GatewayBatteryAssignment | None:
    return db.scalar(
        select(GatewayBatteryAssignment)
        .where(
            GatewayBatteryAssignment.gateway_id == gateway_db_id,
            GatewayBatteryAssignment.battery_slot == battery_slot,
            GatewayBatteryAssignment.assigned_at <= measured_at,
            or_(
                GatewayBatteryAssignment.unassigned_at.is_(None),
                GatewayBatteryAssignment.unassigned_at > measured_at,
            ),
        )
        .order_by(GatewayBatteryAssignment.assigned_at.desc())
        .limit(1)
    )


def ingest_telemetry(
    db: Session,
    *,
    topic_gateway_id: str,
    payload: object,
    allow_simulated: bool = False,
) -> IngestResult:
    """Validate and persist one MQTT telemetry message.

    A returned result means the database transaction committed. A duplicate
    result is an application-level deduplication acknowledgment, not a new
    MQTT PUBACK/durability guarantee.
    """
    try:
        normalized = validate_payload(payload, allow_simulated=allow_simulated)
    except TelemetryValidationError as exc:
        raise PayloadRejected(str(exc)) from exc

    if normalized["gateway_id"] != topic_gateway_id:
        raise GatewayRejected("Topic gateway_id does not match payload gateway_id")

    gateway = db.scalar(
        select(Gateway).where(
            Gateway.gateway_id == topic_gateway_id,
            Gateway.is_active.is_(True),
        )
    )
    if not gateway:
        raise GatewayRejected("Unknown or disabled gateway")
    organization = db.get(Organization, gateway.organization_id)
    if not organization or not organization.is_active:
        raise GatewayRejected("Gateway organization is unavailable")

    assignment = _resolve_assignment(
        db,
        gateway.id,
        normalized["battery_slot"],
        normalized["measured_at"],
    )
    if not assignment:
        raise PayloadRejected("No authorized battery mapping for this gateway slot and measured_at")
    battery = db.get(Battery, assignment.battery_id)
    if not battery or battery.is_deleted:
        raise PayloadRejected("Mapped battery is unavailable")
    if battery.organization_id != gateway.organization_id:
        raise PayloadRejected("Gateway and battery organization do not match")

    existing = db.scalar(
        select(TelemetrySample).where(
            TelemetrySample.gateway_id == gateway.id,
            TelemetrySample.message_id == normalized["message_id"],
        )
    )
    if existing:
        return IngestResult("duplicate", existing.id, existing.battery_id, gateway.gateway_id)

    sample = TelemetrySample(
        gateway_id=gateway.id,
        battery_id=battery.id,
        organization_id=gateway.organization_id,
        message_id=normalized["message_id"],
        schema_version=normalized["schema_version"],
        battery_slot=normalized["battery_slot"],
        measured_at=normalized["measured_at"],
        received_at=datetime.now(timezone.utc),
        time_quality=normalized["time_quality"],
        source=normalized["source"],
        protocol=normalized["protocol"],
        pack_voltage_v=normalized["pack_voltage_v"],
        pack_current_a=normalized["pack_current_a"],
        soc_pct=normalized["soc_pct"],
        soh_pct=normalized["soh_pct"],
        capacity_remaining_ah=normalized["capacity_remaining_ah"],
        capacity_full_ah=normalized["capacity_full_ah"],
        cell_voltages_mv=normalized["cell_voltages_mv"],
        temperatures_c=normalized["temperatures_c"],
        raw_payload=payload,
    )
    db.add(sample)
    try:
        db.commit()
        db.refresh(sample)
    except IntegrityError:
        db.rollback()
        duplicate = db.scalar(
            select(TelemetrySample).where(
                TelemetrySample.gateway_id == gateway.id,
                TelemetrySample.message_id == normalized["message_id"],
            )
        )
        if duplicate:
            return IngestResult("duplicate", duplicate.id, duplicate.battery_id, gateway.gateway_id)
        raise
    return IngestResult("stored", sample.id, sample.battery_id, gateway.gateway_id)
