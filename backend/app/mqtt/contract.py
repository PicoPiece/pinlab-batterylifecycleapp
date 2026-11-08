import contextlib
import json
from datetime import datetime, timezone
from pathlib import Path

import jsonschema

SCHEMA_PATH = Path(__file__).with_name("schema") / "telemetry-v1.schema.json"


class TelemetryValidationError(ValueError):
    pass


@contextlib.contextmanager
def _schema():
    with SCHEMA_PATH.open("r", encoding="utf-8") as handle:
        yield json.load(handle)


def validate_payload(payload: object, *, allow_simulated: bool = False) -> dict:
    if not isinstance(payload, dict):
        raise TelemetryValidationError("Telemetry payload must be a JSON object")
    with _schema() as schema:
        try:
            jsonschema.validate(payload, schema)
        except jsonschema.ValidationError as exc:
            raise TelemetryValidationError(f"Schema validation failed: {exc.message}") from exc
    if payload["source"] == "SIMULATED" and not allow_simulated:
        raise TelemetryValidationError("SIMULATED telemetry is disabled for this consumer")
    try:
        measured_at = datetime.fromisoformat(payload["measured_at"].replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError) as exc:
        raise TelemetryValidationError("measured_at must be an ISO-8601 timestamp") from exc
    if measured_at.tzinfo is None:
        raise TelemetryValidationError("measured_at must include a timezone")
    payload = dict(payload)
    payload["measured_at"] = measured_at.astimezone(timezone.utc)
    return payload
