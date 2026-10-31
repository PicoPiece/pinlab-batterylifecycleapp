from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import SecurityAuditEvent


def record_security_event(
    db: Session,
    *,
    actor_id: int,
    action: str,
    target_type: str,
    target_id: int | None = None,
    organization_id: int | None = None,
    metadata: dict | None = None,
) -> SecurityAuditEvent:
    event = SecurityAuditEvent(
        actor_id=actor_id,
        organization_id=organization_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        event_metadata=metadata or {},
        created_at=datetime.now(timezone.utc),
    )
    db.add(event)
    return event
