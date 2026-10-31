"""Centralized organization/asset authorization for P0-B.

This module deliberately contains no endpoint-specific business logic. Routers
must call these helpers before returning or mutating organization-scoped data.
"""
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy import false, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    Battery,
    BatteryAssignment,
    OrganizationMembership,
    OrganizationRole,
    User,
)


@dataclass(frozen=True)
class AccessContext:
    user: User
    memberships: tuple[OrganizationMembership, ...]
    roles: frozenset[OrganizationRole]
    assigned_battery_ids: frozenset[int]

    @property
    def is_super_admin(self) -> bool:
        return OrganizationRole.pinlab_super_admin in self.roles

    @property
    def is_manager(self) -> bool:
        return OrganizationRole.pinlab_manager in self.roles

    @property
    def is_agency_admin(self) -> bool:
        return OrganizationRole.agency_admin in self.roles

    @property
    def readable_org_ids(self) -> frozenset[int]:
        return frozenset(
            m.organization_id
            for m in self.memberships
            if m.role in (OrganizationRole.agency_admin, OrganizationRole.viewer)
        )

    @property
    def writable_org_ids(self) -> frozenset[int]:
        return frozenset(
            m.organization_id
            for m in self.memberships
            if m.role == OrganizationRole.agency_admin
        )

    @property
    def organization_ids(self) -> frozenset[int]:
        return frozenset(m.organization_id for m in self.memberships)

    def can_read_battery(self, battery: Battery) -> bool:
        if self.is_super_admin:
            return True
        if self.is_manager:
            return battery.organization_id is not None
        if battery.id in self.assigned_battery_ids and battery.organization_id in self.organization_ids:
            return True
        return battery.organization_id is not None and battery.organization_id in self.readable_org_ids

    def can_write_battery(self, battery: Battery) -> bool:
        if self.is_super_admin or self.is_manager:
            return True
        if battery.id in self.assigned_battery_ids and battery.organization_id in self.organization_ids:
            return True
        return battery.organization_id is not None and battery.organization_id in self.writable_org_ids

    def can_create_battery_in_org(self, organization_id: int | None) -> bool:
        if self.is_super_admin or self.is_manager:
            return True
        if organization_id is None:
            return False
        if organization_id in self.writable_org_ids:
            return True
        # Internal technicians may create an asset in their own PinLab org; the
        # creation endpoint assigns the new asset to them.
        return any(
            m.role == OrganizationRole.pinlab_technician and m.organization_id == organization_id
            for m in self.memberships
        )

    def can_manage_assignments(self, battery: Battery) -> bool:
        if self.is_super_admin or self.is_manager:
            return True
        return battery.organization_id is not None and battery.organization_id in self.writable_org_ids

    def can_manage_org(self, organization_id: int) -> bool:
        if self.is_super_admin or self.is_manager:
            return True
        return organization_id in self.writable_org_ids

    def can_grant_role(self, role: OrganizationRole) -> bool:
        if self.is_super_admin:
            return True
        if self.is_manager:
            return role in {
                OrganizationRole.agency_admin,
                OrganizationRole.agency_technician,
                OrganizationRole.viewer,
            }
        if self.is_agency_admin:
            return role in {OrganizationRole.agency_technician, OrganizationRole.viewer}
        return False

    def battery_filter(self):
        """Return a SQLAlchemy clause for visible batteries, or None for all."""
        if self.is_super_admin:
            return None
        if self.is_manager:
            return Battery.organization_id.is_not(None)
        clauses = []
        if self.readable_org_ids:
            clauses.append(Battery.organization_id.in_(self.readable_org_ids))
        if self.assigned_battery_ids and self.organization_ids:
            clauses.append(
                Battery.id.in_(self.assigned_battery_ids) & Battery.organization_id.in_(self.organization_ids)
            )
        return or_(*clauses) if clauses else false()


def get_access_context(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccessContext:
    memberships = tuple(
        db.scalars(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.is_active.is_(True),
            )
        ).all()
    )
    if not memberships:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có membership hợp lệ")
    roles = frozenset(m.role for m in memberships)
    assigned = frozenset(
        db.scalars(
            select(BatteryAssignment.battery_id).where(
                BatteryAssignment.user_id == user.id,
                BatteryAssignment.is_active.is_(True),
            )
        ).all()
    )
    return AccessContext(user=user, memberships=memberships, roles=roles, assigned_battery_ids=assigned)


def require_super_admin(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    context = get_access_context(db=db, user=user)
    if not context.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền thực hiện")
    return user


def forbid() -> HTTPException:
    # 404 avoids confirming that an object exists in another tenant.
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài nguyên")
