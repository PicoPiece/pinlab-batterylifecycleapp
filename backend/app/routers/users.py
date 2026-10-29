import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models import User
from app.schemas import AdminPasswordResetResponse, UserCreate, UserRead, UserUpdate
from app.security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[User]:
    return list(db.scalars(select(User).order_by(User.full_name)).all())


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> User:
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name.strip(),
        hashed_password=hash_password(payload.password),
        role=payload.role,
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email đã tồn tại")
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", response_model=AdminPasswordResetResponse)
def reset_user_password(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
) -> AdminPasswordResetResponse:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if user.id == current.id:
        raise HTTPException(status_code=400, detail="Dùng chức năng đổi mật khẩu cho tài khoản của bạn")
    temporary_password = secrets.token_hex(24)
    user.hashed_password = hash_password(temporary_password)
    user.must_change_password = True
    user.token_version += 1
    db.commit()
    db.refresh(user)
    return AdminPasswordResetResponse(
        temporary_password=temporary_password,
        user=UserRead.model_validate(user),
    )


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    data = payload.model_dump(exclude_unset=True)
    if user.id == current.id and data.get("is_active") is False:
        raise HTTPException(status_code=400, detail="Không thể tự vô hiệu hóa tài khoản")
    for key, value in data.items():
        if value is not None:
            setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user
