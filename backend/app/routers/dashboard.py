from datetime import datetime, timedelta, timezone

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
    FleetHealth,
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

    active_batteries = list(db.scalars(select(Battery).where(active_filter)).all())
    active_ids = [battery.id for battery in active_batteries]
    latest: dict[tuple[int, MeasurementMetric], Measurement] = {}
    if active_ids:
        measurements = db.scalars(
            select(Measurement)
            .where(Measurement.battery_id.in_(active_ids))
            .order_by(Measurement.measured_at.desc(), Measurement.id.desc())
        ).all()
        for measurement in measurements:
            key = (measurement.battery_id, measurement.metric)
            if key not in latest:
                latest[key] = measurement

    soc_values = [
        float(value.value)
        for (battery_id, metric), value in latest.items()
        if metric == MeasurementMetric.soc
    ]
    soh_values = [
        float(value.value)
        for (battery_id, metric), value in latest.items()
        if metric == MeasurementMetric.soh
    ]

    inspection_rows = db.execute(
        select(Inspection.battery_id, func.max(Inspection.inspected_at)).group_by(Inspection.battery_id)
    ).all()
    last_inspection: dict[int, datetime] = {battery_id: last_at for battery_id, last_at in inspection_rows}
    now = datetime.now(timezone.utc)
    needs_attention: list[AttentionBattery] = []
    for battery in active_batteries:
        reasons: list[str] = []
        severity = "data"
        soc = latest.get((battery.id, MeasurementMetric.soc))
        soh = latest.get((battery.id, MeasurementMetric.soh))
        temperature = latest.get((battery.id, MeasurementMetric.temperature))
        if soc is None:
            reasons.append("missing_soc")
        if soh is None:
            reasons.append("missing_soh")
        if battery.id not in last_inspection:
            reasons.append("no_inspection")
        if battery.status in (BatteryStatus.received, BatteryStatus.inspecting, BatteryStatus.quarantined):
            reasons.append("needs_inspection")
            severity = "high"
        if soh is not None and float(soh.value) < 80:
            reasons.append("low_soh")
            severity = "review"
        if temperature is not None and float(temperature.value) >= 40:
            reasons.append("high_temperature")
            severity = "high"
        if reasons:
            needs_attention.append(
                AttentionBattery(
                    battery_id=battery.id,
                    asset_id=battery.asset_id,
                    reasons=reasons,
                    severity=severity,
                )
            )

    severity_order = {"high": 0, "review": 1, "data": 2}
    needs_attention.sort(key=lambda item: (severity_order.get(item.severity, 3), item.battery_id))
    needs_attention = needs_attention[:6]

    # Demo-only operational score. SOH is a separate weighted measurement metric.
    weighted_pairs = [
        (float(soh.value), float(battery.nominal_capacity_ah or 1))
        for battery in active_batteries
        if (soh := latest.get((battery.id, MeasurementMetric.soh))) is not None
    ]
    weighted_soh = (
        sum(value * capacity for value, capacity in weighted_pairs) / sum(capacity for _, capacity in weighted_pairs)
        if weighted_pairs and sum(capacity for _, capacity in weighted_pairs)
        else None
    )
    covered = sum(
        1
        for battery in active_batteries
        if (battery.id, MeasurementMetric.soc) in latest
        and (battery.id, MeasurementMetric.soh) in latest
    )
    data_coverage = (covered / total * 100) if total else 0.0
    inspected_recently = 0
    for battery in active_batteries:
        last_at = last_inspection.get(battery.id)
        if last_at is not None:
            if last_at.tzinfo is None:
                last_at = last_at.replace(tzinfo=timezone.utc)
            if last_at >= now - timedelta(days=365):
                inspected_recently += 1
    inspection_currency = (inspected_recently / total * 100) if total else 0.0
    fleet_score = (
        0.70 * (weighted_soh or 0)
        + 0.15 * data_coverage
        + 0.15 * inspection_currency
    )
    fleet_health = FleetHealth(
        score=round(fleet_score, 1),
        weighted_soh=round(weighted_soh, 1) if weighted_soh is not None else None,
        data_coverage=round(data_coverage, 1),
        inspection_currency=round(inspection_currency, 1),
        formula="70% weighted SOH + 15% data coverage + 15% inspection currency",
    )

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
        fleet_health=fleet_health,
    )
