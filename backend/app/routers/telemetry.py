from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.authorization import AccessContext, get_access_context
from app.database import get_db
from app.routers.batteries import get_battery_or_404
from app.schemas import DiagnosticEvidenceRead, TelemetryHistoryRead, TelemetryLatestRead
from app.telemetry import diagnostic_evidence, history_telemetry, latest_telemetry

router = APIRouter(prefix="/batteries", tags=["telemetry"])


@router.get("/{battery_id}/telemetry/latest", response_model=TelemetryLatestRead)
def get_latest_telemetry(
    battery_id: int,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
) -> TelemetryLatestRead:
    battery = get_battery_or_404(db, battery_id, ctx)
    return latest_telemetry(db, battery)


@router.get("/{battery_id}/telemetry/history", response_model=TelemetryHistoryRead)
def get_telemetry_history(
    battery_id: int,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
    time_range: Literal["1h", "24h", "7d"] = Query(default="1h", alias="range"),
    include_cells: bool = Query(default=True),
) -> TelemetryHistoryRead:
    battery = get_battery_or_404(db, battery_id, ctx)
    return history_telemetry(db, battery, time_range, include_cells=include_cells)


@router.get("/{battery_id}/telemetry/evidence", response_model=DiagnosticEvidenceRead)
def get_diagnostic_evidence(
    battery_id: int,
    db: Session = Depends(get_db),
    ctx: AccessContext = Depends(get_access_context),
    time_range: Literal["1h", "24h", "7d"] = Query(default="1h", alias="range"),
) -> DiagnosticEvidenceRead:
    battery = get_battery_or_404(db, battery_id, ctx)
    return diagnostic_evidence(db, battery, time_range)
