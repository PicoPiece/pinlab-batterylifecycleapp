from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_writer
from app.models import LifecycleEvent, LifecycleEventType, User, utcnow
from app.routers.batteries import get_battery_or_404
from app.schemas import LifecycleEventCreate, LifecycleEventRead, Page
from app.services.audit import record_event

router = APIRouter(tags=["lifecycle"])


@router.get("/batteries/{battery_id}/lifecycle-events", response_model=Page[LifecycleEventRead])
def list_events(
    battery_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=200),
) -> Page[LifecycleEventRead]:
    get_battery_or_404(db, battery_id)
    total = db.scalar(
        select(func.count()).select_from(LifecycleEvent).where(LifecycleEvent.battery_id == battery_id)
    ) or 0
    items = list(
        db.scalars(
            select(LifecycleEvent)
            .where(LifecycleEvent.battery_id == battery_id)
            .order_by(LifecycleEvent.event_at.desc(), LifecycleEvent.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post(
    "/batteries/{battery_id}/lifecycle-events",
    response_model=LifecycleEventRead,
    status_code=status.HTTP_201_CREATED,
)
def create_event(
    battery_id: int,
    payload: LifecycleEventCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> LifecycleEvent:
    get_battery_or_404(db, battery_id)
    if payload.event_type == LifecycleEventType.status_changed:
        raise HTTPException(
            status_code=400,
            detail="status_changed chỉ được tạo tự động khi cập nhật trạng thái pin",
        )
    event = record_event(
        db,
        battery_id=battery_id,
        event_type=payload.event_type,
        actor_id=user.id,
        notes=payload.notes,
        metadata=payload.metadata,
        event_at=payload.event_at or utcnow(),
    )
    db.commit()
    db.refresh(event)
    return event
