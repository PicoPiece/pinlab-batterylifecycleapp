from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Battery, BatteryStatus, Inspection, LifecycleEvent, Measurement, MeasurementMetric, User
from app.schemas import (
    AttentionBattery,
    BucketCount,
    DashboardSummary,
    RecentEvent,
    RecentInspection,
    StatusCount,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

BUCKETS = [
    ("0–20%", 0, 20),
    ("20–40%", 20, 40),
    ("40–60%", 40, 60),
    ("60–80%", 60, 80),
    ("80–100%", 80, 101),
]


def bucket_counts(values: list[float]) -> list[BucketCount]:
    result = []
    for label, lower, upper in BUCKETS:
        result.append(BucketCount(bucket=label, count=sum(1 for value in values if lower <= value < upper)))
    return result


@router.get("", response_model=DashboardSummary)
def dashboard(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DashboardSummary:
    active_filter = Battery.is_deleted.is_(False)
    total = db.scalar(select(func.count()).select_from(Battery).where(active_filter)) or 0
    rows = db.execute(
        select(Battery.status, func.count()).where(active_filter).group_by(Battery.status)
    ).all()
    counts = {status: count for status, count in rows}
    by_status = [StatusCount(status=status, count=counts.get(status, 0)) for status in BatteryStatus]

    active_rows = db.execute(
        select(Battery.id, Battery.asset_id, Battery.status).where(active_filter)
    ).all()
    active_ids = [row.id for row in active_rows]
    latest: dict[tuple[int, MeasurementMetric], float] = {}
    if active_ids:
        measurements = db.scalars(
            select(Measurement)
            .where(
                Measurement.battery_id.in_(active_ids),
                Measurement.metric.in_([MeasurementMetric.soc, MeasurementMetric.soh]),
            )
            .order_by(Measurement.measured_at.desc(), Measurement.id.desc())
        ).all()
        for measurement in measurements:
            key = (measurement.battery_id, measurement.metric)
            if key not in latest:
                latest[key] = float(measurement.value)

    soc_values = [value for (battery_id, metric), value in latest.items() if metric == MeasurementMetric.soc]
    soh_values = [value for (battery_id, metric), value in latest.items() if metric == MeasurementMetric.soh]

    inspected_battery_ids = set(db.scalars(select(Inspection.battery_id).distinct()).all())
    needs_attention: list[AttentionBattery] = []
    for row in active_rows:
        reasons: list[str] = []
        if (row.id, MeasurementMetric.soc) not in latest:
            reasons.append("Thiếu SOC")
        if (row.id, MeasurementMetric.soh) not in latest:
            reasons.append("Thiếu SOH")
        if row.id not in inspected_battery_ids:
            reasons.append("Chưa có inspection")
        if row.status in (BatteryStatus.received, BatteryStatus.inspecting, BatteryStatus.quarantined):
            reasons.append("Cần kiểm tra/kiểm định")
        if reasons:
            needs_attention.append(
                AttentionBattery(battery_id=row.id, asset_id=row.asset_id, reasons=reasons)
            )
    needs_attention = needs_attention[:6]

    inspection_rows = db.execute(
        select(Inspection, Battery.asset_id, User.full_name)
        .join(Battery, Inspection.battery_id == Battery.id)
        .join(User, Inspection.technician_id == User.id)
        .where(Battery.is_deleted.is_(False))
        .order_by(Inspection.inspected_at.desc(), Inspection.id.desc())
        .limit(5)
    ).all()
    recent_inspections = [
        RecentInspection(
            id=inspection.id,
            battery_id=inspection.battery_id,
            asset_id=asset_id,
            test_type=inspection.test_type,
            result=inspection.result,
            inspected_at=inspection.inspected_at,
            technician=technician,
        )
        for inspection, asset_id, technician in inspection_rows
    ]

    event_rows = db.execute(
        select(LifecycleEvent, Battery.asset_id, User.full_name)
        .join(Battery, LifecycleEvent.battery_id == Battery.id)
        .join(User, LifecycleEvent.actor_id == User.id)
        .where(Battery.is_deleted.is_(False))
        .order_by(LifecycleEvent.event_at.desc(), LifecycleEvent.id.desc())
        .limit(8)
    ).all()
    recent_events = [
        RecentEvent(
            id=event.id,
            battery_id=event.battery_id,
            asset_id=asset_id,
            event_type=event.event_type,
            event_at=event.event_at,
            actor=actor,
        )
        for event, asset_id, actor in event_rows
    ]

    return DashboardSummary(
        total_batteries=total,
        by_status=by_status,
        soc_available=len(soc_values),
        soh_available=len(soh_values),
        soc_distribution=bucket_counts(soc_values),
        soh_distribution=bucket_counts(soh_values),
        needs_attention=needs_attention,
        recent_inspections=recent_inspections,
        recent_events=recent_events,
    )
