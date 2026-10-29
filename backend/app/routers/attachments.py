from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_writer
from app.models import Attachment, User
from app.routers.batteries import get_battery_or_404
from app.routers.inspections import get_inspection_or_404
from app.schemas import AttachmentRead
from app.services.attachments import attachment_path, delete_attachment_file, save_upload

router = APIRouter(tags=["attachments"])


@router.get("/batteries/{battery_id}/attachments", response_model=list[AttachmentRead])
def list_attachments(
    battery_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Attachment]:
    get_battery_or_404(db, battery_id)
    return list(
        db.scalars(
            select(Attachment)
            .where(Attachment.battery_id == battery_id)
            .order_by(Attachment.created_at.desc(), Attachment.id.desc())
        ).all()
    )


@router.post(
    "/batteries/{battery_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_battery_attachment(
    battery_id: int,
    file: UploadFile = File(...),
    inspection_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> Attachment:
    get_battery_or_404(db, battery_id)
    if inspection_id is not None:
        inspection = get_inspection_or_404(db, inspection_id)
        if inspection.battery_id != battery_id:
            raise HTTPException(status_code=400, detail="Inspection không thuộc battery này")

    attachment = await save_upload(
        db,
        upload=file,
        battery_id=battery_id,
        inspection_id=inspection_id,
        uploaded_by_id=user.id,
    )
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/inspections/{inspection_id}/attachments", response_model=list[AttachmentRead])
def list_inspection_attachments(
    inspection_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Attachment]:
    get_inspection_or_404(db, inspection_id)
    return list(
        db.scalars(
            select(Attachment)
            .where(Attachment.inspection_id == inspection_id)
            .order_by(Attachment.created_at.desc(), Attachment.id.desc())
        ).all()
    )


@router.post(
    "/inspections/{inspection_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_inspection_attachment(
    inspection_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_writer),
) -> Attachment:
    inspection = get_inspection_or_404(db, inspection_id)
    attachment = await save_upload(
        db,
        upload=file,
        battery_id=inspection.battery_id,
        inspection_id=inspection.id,
        uploaded_by_id=user.id,
    )
    db.commit()
    db.refresh(attachment)
    return attachment


@router.get("/attachments/{attachment_id}/download")
def download_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> FileResponse:
    attachment = db.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Không tìm thấy attachment")
    path = attachment_path(attachment)
    return FileResponse(
        path,
        media_type=attachment.content_type,
        filename=attachment.filename,
    )


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_writer),
) -> None:
    attachment = db.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(status_code=404, detail="Không tìm thấy attachment")
    delete_attachment_file(attachment)
    db.delete(attachment)
    db.commit()
