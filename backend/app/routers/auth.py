from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import OrganizationMembership, OrganizationRole, User
from app.rate_limit import (
    clear_login_failures,
    is_login_blocked,
    login_key,
    record_login_failure,
)
from app.schemas import AccessMembershipRead, AccessRead, ChangePasswordRequest, LoginRequest, UserRead
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserRead)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> User:
    host = request.client.host if request.client else "unknown"
    key = login_key(host, payload.email)
    blocked, retry_after = is_login_blocked(key)
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau.",
            headers={"Retry-After": str(retry_after)},
        )

    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not user.is_active or not verify_password(payload.password, user.hashed_password):
        record_login_failure(key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email hoặc mật khẩu không đúng")

    clear_login_failures(key)
    token = create_access_token(user)
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    host = request.client.host if request.client else "unknown"
    key = login_key(host, f"change:{user.id}")
    blocked, retry_after = is_login_blocked(key)
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Quá nhiều lần thử. Vui lòng thử lại sau.",
            headers={"Retry-After": str(retry_after)},
        )
    if not verify_password(payload.current_password, user.hashed_password):
        record_login_failure(key)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu hiện tại không đúng")
    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu mới phải khác mật khẩu hiện tại")

    clear_login_failures(key)
    user.hashed_password = hash_password(payload.new_password)
    user.must_change_password = False
    user.token_version += 1
    db.commit()
    response.delete_cookie(
        settings.cookie_name,
        path="/",
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        httponly=True,
    )
    response.headers["Cache-Control"] = "no-store"
    response.status_code = status.HTTP_204_NO_CONTENT


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    response.delete_cookie(
        settings.cookie_name,
        path="/",
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        httponly=True,
    )
    response.headers["Cache-Control"] = "no-store"
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserRead)
def me(response: Response, user: User = Depends(get_current_user)) -> User:
    response.headers["Cache-Control"] = "no-store"
    return user


@router.get("/access", response_model=AccessRead)
def access(
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccessRead:
    memberships = list(
        db.scalars(
            select(OrganizationMembership)
            .where(
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.is_active.is_(True),
            )
            .order_by(OrganizationMembership.id)
        ).all()
    )
    roles = {membership.role for membership in memberships}
    writer_roles = {
        OrganizationRole.pinlab_super_admin,
        OrganizationRole.pinlab_manager,
        OrganizationRole.pinlab_technician,
        OrganizationRole.agency_admin,
        OrganizationRole.agency_technician,
    }
    can_create_battery = bool(
        roles
        & {
            OrganizationRole.pinlab_super_admin,
            OrganizationRole.pinlab_manager,
            OrganizationRole.pinlab_technician,
            OrganizationRole.agency_admin,
        }
    )
    response.headers["Cache-Control"] = "no-store"
    return AccessRead(
        user=UserRead.model_validate(user),
        is_super_admin=OrganizationRole.pinlab_super_admin in roles,
        is_manager=OrganizationRole.pinlab_manager in roles,
        is_agency_admin=OrganizationRole.agency_admin in roles,
        can_write=bool(roles & writer_roles),
        can_create_battery=can_create_battery,
        can_manage_access=bool(
            roles
            & {
                OrganizationRole.pinlab_super_admin,
                OrganizationRole.pinlab_manager,
                OrganizationRole.agency_admin,
            }
        ),
        memberships=[
            AccessMembershipRead(
                id=membership.id,
                organization_id=membership.organization_id,
                organization_name=membership.organization_name,
                organization_slug=membership.organization_slug,
                role=membership.role,
                is_active=membership.is_active,
            )
            for membership in memberships
        ],
    )
