from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.authorization import AccessContext, forbid, get_access_context
from app.database import get_db
from app.models import Organization, OrganizationMembership, OrganizationRole, User, UserRole
from app.schemas import (
    OrganizationCreate,
    OrganizationMembershipCreate,
    OrganizationMembershipRead,
    OrganizationMembershipUpdate,
    OrganizationRead,
    OrganizationUserCreate,
    SecurityAuditEventRead,
    UserRead,
)
from app.security import hash_password
from app.services.security_audit import record_security_event

router = APIRouter(prefix="/organizations", tags=["organizations"])


def _membership_or_404(db: Session, membership_id: int) -> OrganizationMembership:
    membership = db.get(OrganizationMembership, membership_id)
    if not membership:
        raise HTTPException(status_code=404, detail="Không tìm thấy membership")
    return membership


@router.get("", response_model=list[OrganizationRead])
def list_organizations(
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> list[Organization]:
    if ctx.is_super_admin or ctx.is_manager:
        return list(db.scalars(select(Organization).order_by(Organization.name)).all())
    if ctx.is_agency_admin:
        return list(
            db.scalars(select(Organization).where(Organization.id.in_(ctx.writable_org_ids))).all()
        )
    raise forbid()


@router.post("", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
def create_organization(
    payload: OrganizationCreate,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> Organization:
    if not ctx.is_super_admin:
        raise forbid()
    organization = Organization(slug=payload.slug, name=payload.name, kind=payload.kind)
    db.add(organization)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Organization slug đã tồn tại")
    record_security_event(
        db,
        actor_id=ctx.user.id,
        action="organization.create",
        target_type="organization",
        target_id=organization.id,
        organization_id=organization.id,
        metadata={"slug": organization.slug, "kind": organization.kind.value},
    )
    db.commit()
    db.refresh(organization)
    return organization


@router.post(
    "/{organization_id}/users",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
def create_organization_user(
    organization_id: int,
    payload: OrganizationUserCreate,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> User:
    if not ctx.can_manage_org(organization_id):
        raise forbid()
    if not ctx.can_grant_role(payload.role):
        raise HTTPException(status_code=403, detail="Không được cấp role vượt phạm vi")
    if not db.get(Organization, organization_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy organization")
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name.strip(),
        hashed_password=hash_password(payload.password),
        role=UserRole.viewer,
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    try:
        db.flush()
        db.add(
            OrganizationMembership(
                user_id=user.id,
                organization_id=organization_id,
                role=payload.role,
            )
        )
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email đã tồn tại")
    record_security_event(
        db,
        actor_id=ctx.user.id,
        action="organization.user.create",
        target_type="user",
        target_id=user.id,
        organization_id=organization_id,
        metadata={"role": payload.role.value},
    )
    db.commit()
    db.refresh(user)
    return user


@router.get("/{organization_id}/memberships", response_model=list[OrganizationMembershipRead])
def list_memberships(
    organization_id: int,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> list[OrganizationMembership]:
    if not ctx.can_manage_org(organization_id):
        raise forbid()
    return list(
        db.scalars(
            select(OrganizationMembership)
            .where(OrganizationMembership.organization_id == organization_id)
            .order_by(OrganizationMembership.id)
        ).all()
    )


@router.post(
    "/{organization_id}/memberships",
    response_model=OrganizationMembershipRead,
    status_code=status.HTTP_201_CREATED,
)
def create_membership(
    organization_id: int,
    payload: OrganizationMembershipCreate,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> OrganizationMembership:
    if not ctx.can_manage_org(organization_id):
        raise forbid()
    if not ctx.can_grant_role(payload.role):
        raise HTTPException(status_code=403, detail="Không được cấp role vượt phạm vi")
    if not db.get(Organization, organization_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy organization")
    user = db.get(User, payload.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    membership = OrganizationMembership(
        user_id=payload.user_id,
        organization_id=organization_id,
        role=payload.role,
    )
    db.add(membership)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Người dùng đã thuộc organization này")
    record_security_event(
        db,
        actor_id=ctx.user.id,
        action="membership.create",
        target_type="organization_membership",
        target_id=membership.id,
        organization_id=organization_id,
        metadata={"user_id": user.id, "role": payload.role.value},
    )
    db.commit()
    db.refresh(membership)
    return membership


@router.patch("/memberships/{membership_id}", response_model=OrganizationMembershipRead)
def update_membership(
    membership_id: int,
    payload: OrganizationMembershipUpdate,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> OrganizationMembership:
    membership = _membership_or_404(db, membership_id)
    if not ctx.can_manage_org(membership.organization_id):
        raise forbid()
    if payload.role is not None:
        if not ctx.can_grant_role(payload.role):
            raise HTTPException(status_code=403, detail="Không được cấp role vượt phạm vi")
        membership.role = payload.role
    if payload.is_active is not None:
        membership.is_active = payload.is_active
    record_security_event(
        db,
        actor_id=ctx.user.id,
        action="membership.update",
        target_type="organization_membership",
        target_id=membership.id,
        organization_id=membership.organization_id,
        metadata={
            "user_id": membership.user_id,
            "role": membership.role.value,
            "is_active": membership.is_active,
        },
    )
    db.commit()
    db.refresh(membership)
    return membership


@router.get("/{organization_id}/audit", response_model=list[SecurityAuditEventRead])
def list_audit(
    organization_id: int,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> list:
    if not ctx.can_manage_org(organization_id):
        raise forbid()
    from app.models import SecurityAuditEvent

    return list(
        db.scalars(
            select(SecurityAuditEvent)
            .where(SecurityAuditEvent.organization_id == organization_id)
            .order_by(SecurityAuditEvent.created_at.desc(), SecurityAuditEvent.id.desc())
            .limit(200)
        ).all()
    )
