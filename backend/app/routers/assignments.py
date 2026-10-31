from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.authorization import AccessContext, forbid, get_access_context
from app.database import get_db
from app.models import BatteryAssignment, OrganizationMembership, OrganizationRole, User
from app.routers.batteries import get_battery_or_404
from app.schemas import BatteryAssignmentCreate, BatteryAssignmentRead
from app.services.security_audit import record_security_event

router = APIRouter(tags=["battery-assignments"])


@router.get("/batteries/{battery_id}/assignments", response_model=list[BatteryAssignmentRead])
def list_assignments(
    battery_id: int,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> list[BatteryAssignment]:
    battery = get_battery_or_404(db, battery_id, ctx)
    if not ctx.can_manage_assignments(battery):
        raise forbid()
    return list(
        db.scalars(
            select(BatteryAssignment)
            .where(BatteryAssignment.battery_id == battery_id, BatteryAssignment.is_active.is_(True))
            .order_by(BatteryAssignment.id)
        ).all()
    )


@router.post(
    "/batteries/{battery_id}/assignments",
    response_model=BatteryAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_assignment(
    battery_id: int,
    payload: BatteryAssignmentCreate,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> BatteryAssignment:
    battery = get_battery_or_404(db, battery_id, ctx)
    if not ctx.can_manage_assignments(battery) or battery.organization_id is None:
        raise forbid()
    user = db.get(User, payload.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    membership = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.user_id == user.id,
            OrganizationMembership.organization_id == battery.organization_id,
            OrganizationMembership.is_active.is_(True),
        )
    )
    if not membership or membership.role not in (
        OrganizationRole.pinlab_technician,
        OrganizationRole.agency_technician,
    ):
        raise HTTPException(status_code=400, detail="Người dùng không phải technician của organization")
    assignment = BatteryAssignment(
        battery_id=battery.id,
        user_id=user.id,
        assigned_by_id=ctx.user.id,
    )
    db.add(assignment)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Battery đã được gán cho người dùng này")
    record_security_event(
        db,
        actor_id=ctx.user.id,
        action="battery.assignment.create",
        target_type="battery_assignment",
        target_id=assignment.id,
        organization_id=battery.organization_id,
        metadata={"battery_id": battery.id, "user_id": user.id},
    )
    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def end_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> None:
    assignment = db.get(BatteryAssignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Không tìm thấy assignment")
    battery = get_battery_or_404(db, assignment.battery_id, ctx)
    if not ctx.can_manage_assignments(battery):
        raise forbid()
    assignment.is_active = False
    assignment.ended_at = datetime.now(timezone.utc)
    record_security_event(
        db,
        actor_id=ctx.user.id,
        action="battery.assignment.end",
        target_type="battery_assignment",
        target_id=assignment.id,
        organization_id=battery.organization_id,
        metadata={"battery_id": battery.id, "user_id": assignment.user_id},
    )
    db.commit()
