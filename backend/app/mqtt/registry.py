from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Battery, Gateway, GatewayBatteryAssignment, Organization


class RegistryError(ValueError):
    pass


def register_gateway(
    db: Session,
    *,
    gateway_id: str,
    name: str,
    organization_id: int,
    is_active: bool = True,
) -> Gateway:
    organization = db.get(Organization, organization_id)
    if not organization or not organization.is_active:
        raise RegistryError("Organization is not active")
    gateway = db.scalar(select(Gateway).where(Gateway.gateway_id == gateway_id))
    if gateway is None:
        gateway = Gateway(
            gateway_id=gateway_id,
            name=name,
            organization_id=organization_id,
            is_active=is_active,
        )
        db.add(gateway)
    else:
        gateway.name = name
        gateway.organization_id = organization_id
        gateway.is_active = is_active
    db.commit()
    db.refresh(gateway)
    return gateway


def assign_battery(
    db: Session,
    *,
    gateway_id: str,
    battery_slot: int,
    battery_id: int,
    assigned_at: datetime | None = None,
) -> GatewayBatteryAssignment:
    gateway = db.scalar(select(Gateway).where(Gateway.gateway_id == gateway_id))
    if not gateway or not gateway.is_active:
        raise RegistryError("Gateway is unknown or disabled")
    battery = db.get(Battery, battery_id)
    if not battery or battery.is_deleted:
        raise RegistryError("Battery is unavailable")
    if battery.organization_id != gateway.organization_id:
        raise RegistryError("Gateway and battery must belong to the same organization")
    assigned_at = assigned_at or datetime.now(timezone.utc)
    active = db.scalar(
        select(GatewayBatteryAssignment).where(
            GatewayBatteryAssignment.gateway_id == gateway.id,
            GatewayBatteryAssignment.battery_slot == battery_slot,
            GatewayBatteryAssignment.unassigned_at.is_(None),
        )
    )
    if active:
        if active.battery_id == battery_id:
            return active
        active.unassigned_at = assigned_at
    assignment = GatewayBatteryAssignment(
        gateway_id=gateway.id,
        battery_slot=battery_slot,
        battery_id=battery_id,
        assigned_at=assigned_at,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


def unassign_battery(
    db: Session,
    *,
    gateway_id: str,
    battery_slot: int,
    unassigned_at: datetime | None = None,
) -> GatewayBatteryAssignment:
    gateway = db.scalar(select(Gateway).where(Gateway.gateway_id == gateway_id))
    if not gateway:
        raise RegistryError("Gateway is unknown")
    assignment = db.scalar(
        select(GatewayBatteryAssignment).where(
            GatewayBatteryAssignment.gateway_id == gateway.id,
            GatewayBatteryAssignment.battery_slot == battery_slot,
            GatewayBatteryAssignment.unassigned_at.is_(None),
        )
    )
    if not assignment:
        raise RegistryError("No active assignment")
    assignment.unassigned_at = unassigned_at or datetime.now(timezone.utc)
    db.commit()
    db.refresh(assignment)
    return assignment
