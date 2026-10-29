import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Attachment

ALLOWED_TYPES = {
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/webp": {".webp"},
    "application/pdf": {".pdf"},
}
CHUNK_SIZE = 1024 * 1024
SIGNATURE_BYTES = 16


def _matches_signature(content_type: str, header: bytes) -> bool:
    if content_type == "image/jpeg":
        return header.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/webp":
        return len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP"
    if content_type == "application/pdf":
        return header.startswith(b"%PDF-")
    return False


def _validate_file(safe_name: str, content_type: str, header: bytes) -> None:
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Chỉ hỗ trợ JPEG, PNG, WEBP hoặc PDF",
        )
    extension = Path(safe_name).suffix.lower()
    if extension not in ALLOWED_TYPES[content_type]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Phần mở rộng không khớp với loại file",
        )
    if not header or not _matches_signature(content_type, header):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Nội dung file không khớp với loại file đã khai báo",
        )


def upload_root() -> Path:
    root = Path(settings.upload_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


async def save_upload(
    db: Session,
    *,
    upload: UploadFile,
    battery_id: int,
    inspection_id: int | None,
    uploaded_by_id: int,
) -> Attachment:
    content_type = (upload.content_type or "").lower()
    safe_name = Path(upload.filename or "evidence").name[:255]
    header = await upload.read(SIGNATURE_BYTES)
    try:
        _validate_file(safe_name, content_type, header)
    except HTTPException:
        await upload.close()
        raise

    folder = upload_root() / "batteries" / str(battery_id)
    folder.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid.uuid4().hex}{Path(safe_name).suffix.lower()}"
    target = folder / storage_name
    max_bytes = settings.max_upload_mb * 1024 * 1024
    size = len(header)

    try:
        if size > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File vượt quá {settings.max_upload_mb} MB",
            )
        with target.open("wb") as output:
            output.write(header)
            while True:
                chunk = await upload.read(CHUNK_SIZE)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail=f"File vượt quá {settings.max_upload_mb} MB",
                    )
                output.write(chunk)
    except HTTPException:
        target.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()

    if size == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="File rỗng")

    attachment = Attachment(
        battery_id=battery_id,
        inspection_id=inspection_id,
        filename=safe_name or storage_name,
        content_type=content_type,
        size_bytes=size,
        storage_path=str(target.relative_to(upload_root())),
        uploaded_by_id=uploaded_by_id,
    )
    db.add(attachment)
    return attachment


def attachment_path(attachment: Attachment) -> Path:
    root = upload_root()
    path = (root / attachment.storage_path).resolve()
    if root not in path.parents:
        raise HTTPException(status_code=404, detail="Không tìm thấy file")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Không tìm thấy file")
    return path


def delete_attachment_file(attachment: Attachment) -> None:
    try:
        path = attachment_path(attachment)
    except HTTPException:
        return
    path.unlink(missing_ok=True)
    parent = path.parent
    if parent.is_dir() and not any(parent.iterdir()):
        parent.rmdir()
