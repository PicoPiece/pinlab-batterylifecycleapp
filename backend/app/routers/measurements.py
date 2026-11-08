from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.authorization import AccessContext, get_access_context
from app.database import get_db
from app.models import LifecycleEventType, Measurement, MeasurementMetric, utcnow
from app.routers.batteries import get_battery_for_write_or_404, get_battery_or_404
from app.schemas import MeasurementCreate, MeasurementRead, Page
from app.services.audit import record_event

router = APIRouter(tags=["measurements"])


@router.get("/batteries/{battery_id}/measurements", response_model=Page[MeasurementRead])
def list_measurements(
    battery_id: int,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
    metric: MeasurementMetric | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> Page[MeasurementRead]:
    get_battery_or_404(db, battery_id, ctx)
    filters = [Measurement.battery_id == battery_id]
    if metric:
        filters.append(Measurement.metric == metric)
    total = db.scalar(select(func.count()).select_from(Measurement).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Measurement)
            .where(*filters)
            .order_by(Measurement.measured_at.desc(), Measurement.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/batteries/{battery_id}/measurements/latest", response_model=dict[str, MeasurementRead | None])
def latest_measurements(
    battery_id: int,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> dict[str, MeasurementRead | None]:
    get_battery_or_404(db, battery_id, ctx)
    result: dict[str, MeasurementRead | None] = {metric.value: None for metric in MeasurementMetric}
    for metric in MeasurementMetric:
        item = db.scalar(
            select(Measurement)
            .where(Measurement.battery_id == battery_id, Measurement.metric == metric)
            .order_by(Measurement.measured_at.desc(), Measurement.id.desc())
            .limit(1)
        )
        result[metric.value] = item
    return result


@router.post(
    "/batteries/{battery_id}/measurements",
    response_model=MeasurementRead,
    status_code=status.HTTP_201_CREATED,
)
def create_measurement(
    battery_id: int,
    payload: MeasurementCreate,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> Measurement:
    get_battery_for_write_or_404(db, battery_id, ctx)
    measurement = Measurement(
        battery_id=battery_id,
        metric=payload.metric,
        value=payload.value,
        unit=payload.unit,
        source=payload.source,
        quality=payload.quality,
        measured_at=payload.measured_at or utcnow(),
        notes=payload.notes,
        created_by_id=ctx.user.id,
    )
    db.add(measurement)
    db.flush()
    record_event(
        db,
        battery_id=battery_id,
        event_type=LifecycleEventType.measurement_recorded,
        actor_id=ctx.user.id,
        notes=f"Ghi nhận {payload.metric.value} = {payload.value} {payload.unit}",
        metadata={
            "metric": payload.metric.value,
            "value": payload.value,
            "unit": payload.unit,
            "source": payload.source.value,
            "quality": payload.quality.value,
        },
    )
    db.commit()
    db.refresh(measurement)
    return measurement
