from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_writer
from app.models import Attachment, Battery, Inspection, LifecycleEventType, User, utcnow
from app.routers.batteries import get_battery_or_404
from app.schemas import InspectionCreate, InspectionRead, InspectionSummary, Page
from app.services.audit import record_event

router = APIRouter(tags=["inspections"])


def get_inspection_or_404(db: Session, inspection_id: int) -> Inspection:
    inspection = db.get(Inspection, inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="Không tìm thấy lần kiểm tra")
    return inspection


@router.get("/inspections", response_model=Page[InspectionSummary])
def list_all_inspections(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> Page[InspectionSummary]:
    total = db.scalar(
        select(func.count())
        .select_from(Inspection)
        .join(Battery, Inspection.battery_id == Battery.id)
        .where(Battery.is_deleted.is_(False))
    ) or 0
    evidence_rows = db.execute(
        select(Attachment.inspection_id, func.count(Attachment.id))
        .where(Attachment.inspection_id.is_not(None))
        .group_by(Attachment.inspection_id)
    ).all()
    evidence = {inspection_id: count for inspection_id, count in evidence_rows}
    rows = db.execute(
        select(Inspection, Battery.asset_id, User.full_name)
        .join(Battery, Inspection.battery_id == Battery.id)
        .join(User, Inspection.technician_id == User.id)
        .where(Battery.is_deleted.is_(False))
        .order_by(Inspection.inspected_at.desc(), Inspection.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [
        InspectionSummary(
            id=inspection.id,
            battery_id=inspection.battery_id,
            asset_id=asset_id,
            test_type=inspection.test_type,
            result=inspection.result,
            inspected_at=inspection.inspected_at,
            technician=technician,
            notes=inspection.notes,
            evidence_count=int(evidence.get(inspection.id, 0)),
        )
        for inspection, asset_id, technician in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/batteries/{battery_id}/inspections", response_model=Page[InspectionRead])
def list_inspections(
    battery_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> Page[InspectionRead]:
    get_battery_or_404(db, battery_id)
    total = db.scalar(
        select(func.count()).select_from(Inspection).where(Inspection.battery_id == battery_id)
    ) or 0
    items = list(
        db.scalars(
            select(Inspection)
            .where(Inspection.battery_id == battery_id)
            .order_by(Inspection.inspected_at.desc(), Inspection.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post(
    "/batteries/{battery_id}/inspections",
    response_model=InspectionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_inspection(
    battery_id: int,
    payload: InspectionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> Inspection:
    get_battery_or_404(db, battery_id)
    inspection = Inspection(
        battery_id=battery_id,
        test_type=payload.test_type,
        inspected_at=payload.inspected_at or utcnow(),
        technician_id=user.id,
        measured_parameters=payload.measured_parameters,
        result=payload.result,
        notes=payload.notes,
        created_by_id=user.id,
    )
    db.add(inspection)
    db.flush()

    event_type = (
        LifecycleEventType.inspected
        if "inspect" in payload.test_type.lower()
        else LifecycleEventType.tested
    )
    record_event(
        db,
        battery_id=battery_id,
        event_type=event_type,
        actor_id=user.id,
        notes=f"{payload.test_type}: {payload.result.value}",
        metadata={"inspection_id": inspection.id, "result": payload.result.value},
        event_at=inspection.inspected_at,
    )
    db.commit()
    db.refresh(inspection)
    return inspection


@router.get("/inspections/{inspection_id}", response_model=InspectionRead)
def get_inspection(
    inspection_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Inspection:
    return get_inspection_or_404(db, inspection_id)
