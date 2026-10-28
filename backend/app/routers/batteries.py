from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin, require_writer
from app.models import Battery, BatteryStatus, LifecycleEventType, User
from app.schemas import BatteryCreate, BatteryRead, BatteryUpdate, Page
from app.services.audit import record_event

router = APIRouter(prefix="/batteries", tags=["batteries"])


def get_battery_or_404(db: Session, battery_id: int, include_deleted: bool = False) -> Battery:
    battery = db.get(Battery, battery_id)
    if not battery or (battery.is_deleted and not include_deleted):
        raise HTTPException(status_code=404, detail="Không tìm thấy pin")
    return battery


@router.get("", response_model=Page[BatteryRead])
def list_batteries(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    search: str | None = Query(default=None, max_length=120),
    status_filter: BatteryStatus | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> Page[BatteryRead]:
    filters = [Battery.is_deleted.is_(False)]
    if status_filter:
        filters.append(Battery.status == status_filter)
    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            or_(
                Battery.asset_id.ilike(pattern),
                Battery.serial_number.ilike(pattern),
                Battery.manufacturer.ilike(pattern),
                Battery.model.ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(Battery).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Battery)
            .where(*filters)
            .order_by(Battery.updated_at.desc(), Battery.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=BatteryRead, status_code=status.HTTP_201_CREATED)
def create_battery(
    payload: BatteryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> Battery:
    battery = Battery(
        **payload.model_dump(),
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(battery)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Asset ID đã tồn tại")

    event_type = LifecycleEventType.received if battery.status == BatteryStatus.received else LifecycleEventType.status_changed
    record_event(
        db,
        battery_id=battery.id,
        event_type=event_type,
        actor_id=user.id,
        notes="Pin được đăng ký vào hệ thống",
        metadata={"asset_id": battery.asset_id, "initial_status": battery.status.value},
    )
    db.commit()
    db.refresh(battery)
    return battery


@router.get("/{battery_id}", response_model=BatteryRead)
def get_battery(
    battery_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Battery:
    return get_battery_or_404(db, battery_id)


@router.patch("/{battery_id}", response_model=BatteryRead)
def update_battery(
    battery_id: int,
    payload: BatteryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> Battery:
    battery = get_battery_or_404(db, battery_id)
    data = payload.model_dump(exclude_unset=True)
    old_status = battery.status

    for key, value in data.items():
        setattr(battery, key, value)
    battery.updated_by_id = user.id

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Asset ID đã tồn tại")

    if "status" in data and battery.status != old_status:
        record_event(
            db,
            battery_id=battery.id,
            event_type=LifecycleEventType.status_changed,
            actor_id=user.id,
            notes=f"Trạng thái: {old_status.value} → {battery.status.value}",
            metadata={"from": old_status.value, "to": battery.status.value},
        )

    db.commit()
    db.refresh(battery)
    return battery


@router.delete("/{battery_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_battery(
    battery_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> None:
    battery = get_battery_or_404(db, battery_id)
    battery.is_deleted = True
    battery.status = BatteryStatus.retired
    battery.updated_by_id = user.id
    record_event(
        db,
        battery_id=battery.id,
        event_type=LifecycleEventType.retired,
        actor_id=user.id,
        notes="Pin bị xóa mềm khỏi registry",
    )
    db.commit()
