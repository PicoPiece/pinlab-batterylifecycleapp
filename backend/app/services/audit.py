from datetime import datetime

from sqlalchemy.orm import Session

from app.models import LifecycleEvent, LifecycleEventType


def record_event(
    db: Session,
    *,
    battery_id: int,
    event_type: LifecycleEventType,
    actor_id: int,
    notes: str | None = None,
    metadata: dict | None = None,
    event_at: datetime | None = None,
) -> LifecycleEvent:
    event = LifecycleEvent(
        battery_id=battery_id,
        event_type=event_type,
        actor_id=actor_id,
        notes=notes,
        event_metadata=metadata or {},
        event_at=event_at or datetime.now().astimezone(),
    )
    db.add(event)
    return event
