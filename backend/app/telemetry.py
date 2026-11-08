"""Authorized read models for the Battery Analytics dashboard.

The raw telemetry table is intentionally kept behind a small service layer so
the router can enforce battery/organization authorization once and the query
strategy stays testable.

Freshness policy:
- ``online``  <= 30 seconds since the last server receive timestamp
- ``stale``   <= 5 minutes
- ``offline`` > 5 minutes
These thresholds are deliberately conservative for the 10-second production
publish cadence and are returned to the client so the UI can explain them.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from statistics import stdev
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import (
    Battery,
    Gateway,
    GatewayBatteryAssignment,
    TelemetrySample,
)
from app.schemas import (
    DiagnosticCellStatsRead,
    DiagnosticEvidenceRead,
    DiagnosticGapRead,
    DiagnosticPackStatsRead,
    DiagnosticProvenanceRead,
    DiagnosticStatsRead,
    DiagnosticTemperatureStatsRead,
    TelemetryCellPoint,
    TelemetryConnectivityRead,
    TelemetryGatewayRead,
    TelemetryHistoryRead,
    TelemetryLatestRead,
    TelemetryPackPoint,
    TelemetrySampleRead,
    TelemetryTemperaturePoint,
)

RANGE_SPECS: dict[str, dict[str, int]] = {
    "1h": {"seconds": 3600, "bucket_seconds": 0, "max_points": 1000},
    "24h": {"seconds": 86400, "bucket_seconds": 300, "max_points": 1200},
    "7d": {"seconds": 604800, "bucket_seconds": 1800, "max_points": 1200},
}

ONLINE_AFTER_SECONDS = 30
STALE_AFTER_SECONDS = 5 * 60
VERIFIED_SOURCE = "REAL_BMS"
SQLITE_FALLBACK_ROW_LIMIT = 20000
EVIDENCE_SCHEMA_VERSION = "diagnostic-evidence-v1"
EXPECTED_INTERVAL_SECONDS = 10
GAP_THRESHOLD_SECONDS = 30
MAX_EVIDENCE_GAPS = 100


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    return float(value)


def _cell_stats(cells: list[int]) -> tuple[int, int, float, int, int]:
    if not cells:
        return 0, 0, 0.0, 0, 0
    minimum = min(cells)
    maximum = max(cells)
    average = sum(cells) / len(cells)
    return minimum, maximum, round(average, 2), cells.index(minimum) + 1, cells.index(maximum) + 1


def _sample_read(sample: TelemetrySample) -> TelemetrySampleRead:
    cells = [int(value) for value in (sample.cell_voltages_mv or [])]
    minimum, maximum, average, min_index, max_index = _cell_stats(cells)
    return TelemetrySampleRead(
        id=sample.id,
        message_id=sample.message_id,
        source=sample.source,
        protocol=sample.protocol,
        time_quality=sample.time_quality,
        measured_at=_utc(sample.measured_at) or sample.measured_at,
        received_at=_utc(sample.received_at) or sample.received_at,
        pack_voltage_v=_float(sample.pack_voltage_v),
        pack_current_a=_float(sample.pack_current_a),
        soc_pct=_float(sample.soc_pct),
        soh_pct=float(sample.soh_pct) if sample.soh_pct is not None else None,
        capacity_remaining_ah=_float(sample.capacity_remaining_ah),
        capacity_full_ah=_float(sample.capacity_full_ah),
        cell_voltages_mv=cells,
        cell_min_mv=minimum,
        cell_max_mv=maximum,
        cell_avg_mv=average,
        cell_delta_mv=maximum - minimum,
        cell_min_index=min_index,
        cell_max_index=max_index,
        temperatures_c=[float(value) for value in (sample.temperatures_c or [])],
    )


def _connectivity(
    last_seen_at: datetime | None,
    now: datetime,
) -> TelemetryConnectivityRead:
    last_seen = _utc(last_seen_at)
    if last_seen is None:
        return TelemetryConnectivityRead(
            status="unknown",
            last_seen_at=None,
            freshness_seconds=None,
            online_after_seconds=ONLINE_AFTER_SECONDS,
            stale_after_seconds=STALE_AFTER_SECONDS,
        )
    age = max(0, int((now - last_seen).total_seconds()))
    if age <= ONLINE_AFTER_SECONDS:
        status = "online"
    elif age <= STALE_AFTER_SECONDS:
        status = "stale"
    else:
        status = "offline"
    return TelemetryConnectivityRead(
        status=status,
        last_seen_at=last_seen,
        freshness_seconds=age,
        online_after_seconds=ONLINE_AFTER_SECONDS,
        stale_after_seconds=STALE_AFTER_SECONDS,
    )


def _current_assignment(db: Session, battery_id: int) -> GatewayBatteryAssignment | None:
    return db.scalar(
        select(GatewayBatteryAssignment)
        .where(
            GatewayBatteryAssignment.battery_id == battery_id,
            GatewayBatteryAssignment.unassigned_at.is_(None),
        )
        .order_by(GatewayBatteryAssignment.assigned_at.desc(), GatewayBatteryAssignment.id.desc())
        .limit(1)
    )


def latest_telemetry(
    db: Session,
    battery: Battery,
    *,
    now: datetime | None = None,
) -> TelemetryLatestRead:
    """Return the latest stored sample plus current Gateway freshness.

    ``measured_at`` describes the BMS reading. ``received_at`` is used only
    for ingestion health, so a clock-skewed BMS cannot keep a dead gateway
    marked online.
    """
    current_now = _utc(now) or datetime.now(timezone.utc)
    sample = db.scalar(
        select(TelemetrySample)
        .where(
            TelemetrySample.battery_id == battery.id,
            TelemetrySample.source == VERIFIED_SOURCE,
        )
        .order_by(TelemetrySample.measured_at.desc(), TelemetrySample.id.desc())
        .limit(1)
    )
    latest_any = db.scalar(
        select(TelemetrySample)
        .where(TelemetrySample.battery_id == battery.id)
        .order_by(TelemetrySample.measured_at.desc(), TelemetrySample.id.desc())
        .limit(1)
    )
    # Connectivity is based on server receive time for any authenticated
    # telemetry source; the UI separately labels whether the latest values are
    # verified REAL_BMS or merely simulated.
    last_seen_at = db.scalar(
        select(func.max(TelemetrySample.received_at)).where(
            TelemetrySample.battery_id == battery.id
        )
    )
    assignment = _current_assignment(db, battery.id)

    gateway: Gateway | None = None
    battery_slot: int | None = None
    assigned_at: datetime | None = None
    if assignment is not None:
        gateway = assignment.gateway
        battery_slot = assignment.battery_slot
        assigned_at = assignment.assigned_at
    elif sample is not None:
        gateway = db.get(Gateway, sample.gateway_id)
        battery_slot = sample.battery_slot

    gateway_read: TelemetryGatewayRead | None = None
    if gateway is not None and battery_slot is not None:
        gateway_read = TelemetryGatewayRead(
            gateway_id=gateway.gateway_id,
            name=gateway.name,
            battery_slot=battery_slot,
            organization_id=gateway.organization_id,
            assigned_at=_utc(assigned_at),
            connectivity=_connectivity(last_seen_at, current_now),
        )

    return TelemetryLatestRead(
        battery_id=battery.id,
        asset_id=battery.asset_id,
        battery_classification=battery.classification,
        has_real_telemetry=sample is not None,
        telemetry_source=sample.source if sample is not None else None,
        latest_any_source=latest_any.source if latest_any is not None else None,
        latest_any_at=_utc(latest_any.measured_at) if latest_any is not None else None,
        gateway=gateway_read,
        sample=_sample_read(sample) if sample is not None else None,
        server_time=current_now,
    )


def _raw_history(
    db: Session,
    battery_id: int,
    from_at: datetime,
    to_at: datetime,
    max_points: int,
    include_cells: bool = True,
) -> tuple[list[TelemetryPackPoint], list[TelemetryCellPoint], list[TelemetryTemperaturePoint]]:
    rows = list(
        db.scalars(
            select(TelemetrySample)
            .where(
                TelemetrySample.battery_id == battery_id,
                TelemetrySample.source == VERIFIED_SOURCE,
                TelemetrySample.measured_at >= from_at,
                TelemetrySample.measured_at <= to_at,
            )
            .order_by(TelemetrySample.measured_at.desc(), TelemetrySample.id.desc())
            .limit(max_points)
        ).all()
    )
    rows.reverse()
    pack: list[TelemetryPackPoint] = []
    cells: list[TelemetryCellPoint] = []
    temperatures: list[TelemetryTemperaturePoint] = []
    for row in rows:
        cell_values = [int(value) for value in (row.cell_voltages_mv or [])]
        minimum, maximum, average, _, _ = _cell_stats(cell_values)
        measured_at = _utc(row.measured_at) or row.measured_at
        pack.append(
            TelemetryPackPoint(
                measured_at=measured_at,
                pack_voltage_v=_float(row.pack_voltage_v),
                pack_current_a=_float(row.pack_current_a),
                soc_pct=_float(row.soc_pct),
                capacity_remaining_ah=_float(row.capacity_remaining_ah),
                capacity_full_ah=_float(row.capacity_full_ah),
                cell_min_mv=float(minimum),
                cell_max_mv=float(maximum),
                cell_avg_mv=average,
                cell_delta_mv=float(maximum - minimum),
            )
        )
        if include_cells:
            cells.append(
                TelemetryCellPoint(
                    measured_at=measured_at,
                    avg_mv=[float(value) for value in cell_values],
                    min_mv=[float(value) for value in cell_values],
                    max_mv=[float(value) for value in cell_values],
                )
            )
        temperatures.append(
            TelemetryTemperaturePoint(
                measured_at=measured_at,
                values_c=[float(value) for value in (row.temperatures_c or [])],
            )
        )
    return pack, cells, temperatures


def _postgres_history(
    db: Session,
    battery_id: int,
    from_at: datetime,
    to_at: datetime,
    bucket_seconds: int,
    max_points: int,
    include_cells: bool = True,
) -> tuple[list[TelemetryPackPoint], list[TelemetryCellPoint], list[TelemetryTemperaturePoint]]:
    """Aggregate only in PostgreSQL for the production path.

    Cell delta is calculated per raw sample *before* the bucket aggregation;
    the bucket keeps the maximum observed delta. Per-cell min/max are retained
    so a short voltage deviation is not averaged away by a bucket average.
    """
    params = {
        "battery_id": battery_id,
        "from_at": from_at,
        "to_at": to_at,
        "bucket_seconds": bucket_seconds,
        "max_points": max_points,
        "source": VERIFIED_SOURCE,
    }
    pack_rows = db.execute(
        text(
            """
            WITH base AS (
                SELECT t.measured_at,
                       t.pack_voltage_v,
                       t.pack_current_a,
                       t.soc_pct,
                       t.capacity_remaining_ah,
                       t.capacity_full_ah,
                       stats.min_mv,
                       stats.max_mv,
                       stats.avg_mv,
                       (stats.max_mv - stats.min_mv) AS delta_mv
                FROM telemetry_samples t
                CROSS JOIN LATERAL (
                    SELECT min(v.value::numeric) AS min_mv,
                           max(v.value::numeric) AS max_mv,
                           avg(v.value::numeric) AS avg_mv
                    FROM json_array_elements_text(t.cell_voltages_mv) AS v(value)
                ) stats
                WHERE t.battery_id = :battery_id
                  AND t.source = :source
                  AND t.measured_at >= :from_at
                  AND t.measured_at <= :to_at
            ), bucketed AS (
                SELECT to_timestamp(
                           floor(extract(epoch FROM measured_at) / :bucket_seconds)
                           * :bucket_seconds
                       ) AS measured_at,
                       avg(pack_voltage_v)::float AS pack_voltage_v,
                       avg(pack_current_a)::float AS pack_current_a,
                       avg(soc_pct)::float AS soc_pct,
                       avg(capacity_remaining_ah)::float AS capacity_remaining_ah,
                       avg(capacity_full_ah)::float AS capacity_full_ah,
                       min(min_mv)::float AS cell_min_mv,
                       max(max_mv)::float AS cell_max_mv,
                       avg(avg_mv)::float AS cell_avg_mv,
                       max(delta_mv)::float AS cell_delta_mv
                FROM base
                GROUP BY 1
            )
            SELECT measured_at, pack_voltage_v, pack_current_a, soc_pct,
                   capacity_remaining_ah, capacity_full_ah,
                   cell_min_mv, cell_max_mv, cell_avg_mv, cell_delta_mv
            FROM bucketed
            ORDER BY measured_at
            LIMIT :max_points
            """
        ),
        params,
    ).mappings().all()
    pack = [
        TelemetryPackPoint(
            measured_at=_utc(row["measured_at"]) or row["measured_at"],
            pack_voltage_v=_float(row["pack_voltage_v"]),
            pack_current_a=_float(row["pack_current_a"]),
            soc_pct=_float(row["soc_pct"]),
            capacity_remaining_ah=_float(row["capacity_remaining_ah"]),
            capacity_full_ah=_float(row["capacity_full_ah"]),
            cell_min_mv=_float(row["cell_min_mv"]),
            cell_max_mv=_float(row["cell_max_mv"]),
            cell_avg_mv=_float(row["cell_avg_mv"]),
            cell_delta_mv=_float(row["cell_delta_mv"]),
        )
        for row in pack_rows
    ]

    cell_rows = []
    if include_cells:
        cell_rows = db.execute(
            text(
                """
                WITH base AS (
                    SELECT t.measured_at,
                           cell.ordinality::int AS cell_index,
                           cell.value::numeric AS mv
                    FROM telemetry_samples t
                    CROSS JOIN LATERAL json_array_elements_text(t.cell_voltages_mv)
                        WITH ORDINALITY AS cell(value, ordinality)
                    WHERE t.battery_id = :battery_id
                      AND t.source = :source
                      AND t.measured_at >= :from_at
                      AND t.measured_at <= :to_at
                ), bucketed AS (
                    SELECT to_timestamp(
                               floor(extract(epoch FROM measured_at) / :bucket_seconds)
                               * :bucket_seconds
                           ) AS measured_at,
                           cell_index,
                           avg(mv)::float AS avg_mv,
                           min(mv)::float AS min_mv,
                           max(mv)::float AS max_mv
                    FROM base
                    GROUP BY 1, 2
                )
                SELECT measured_at, cell_index, avg_mv, min_mv, max_mv
                FROM bucketed
                ORDER BY measured_at, cell_index
                """
            ),
            params,
        ).mappings().all()

    temperature_rows = db.execute(
        text(
            """
            WITH base AS (
                SELECT t.measured_at,
                       temperature.ordinality::int AS sensor_index,
                       temperature.value::numeric AS temperature_c
                FROM telemetry_samples t
                CROSS JOIN LATERAL json_array_elements_text(t.temperatures_c)
                    WITH ORDINALITY AS temperature(value, ordinality)
                WHERE t.battery_id = :battery_id
                  AND t.source = :source
                  AND t.measured_at >= :from_at
                  AND t.measured_at <= :to_at
            ), bucketed AS (
                SELECT to_timestamp(
                           floor(extract(epoch FROM measured_at) / :bucket_seconds)
                           * :bucket_seconds
                       ) AS measured_at,
                       sensor_index,
                       avg(temperature_c)::float AS temperature_c
                FROM base
                GROUP BY 1, 2
            )
            SELECT measured_at, sensor_index, temperature_c
            FROM bucketed
            ORDER BY measured_at, sensor_index
            """
        ),
        params,
    ).mappings().all()

    cell_buckets: dict[datetime, dict[int, tuple[float, float, float]]] = {}
    for row in cell_rows:
        key = _utc(row["measured_at"]) or row["measured_at"]
        cell_buckets.setdefault(key, {})[int(row["cell_index"])] = (
            _float(row["avg_mv"]),
            _float(row["min_mv"]),
            _float(row["max_mv"]),
        )
    cell_count = max((max(values) for values in cell_buckets.values()), default=0)
    cells = []
    for key in sorted(cell_buckets):
        values = cell_buckets[key]
        cells.append(
            TelemetryCellPoint(
                measured_at=key,
                avg_mv=[values.get(index, (None, None, None))[0] for index in range(1, cell_count + 1)],
                min_mv=[values.get(index, (None, None, None))[1] for index in range(1, cell_count + 1)],
                max_mv=[values.get(index, (None, None, None))[2] for index in range(1, cell_count + 1)],
            )
        )

    temperature_buckets: dict[datetime, dict[int, float]] = {}
    for row in temperature_rows:
        key = _utc(row["measured_at"]) or row["measured_at"]
        temperature_buckets.setdefault(key, {})[int(row["sensor_index"])] = _float(row["temperature_c"])
    sensor_count = max((max(values) for values in temperature_buckets.values()), default=0)
    temperatures = [
        TelemetryTemperaturePoint(
            measured_at=key,
            values_c=[
                temperature_buckets[key].get(index)
                for index in range(1, sensor_count + 1)
            ],
        )
        for key in sorted(temperature_buckets)
    ]
    return pack, cells, temperatures


def _fallback_history(
    db: Session,
    battery_id: int,
    from_at: datetime,
    to_at: datetime,
    bucket_seconds: int,
    max_points: int,
    include_cells: bool = True,
) -> tuple[list[TelemetryPackPoint], list[TelemetryCellPoint], list[TelemetryTemperaturePoint]]:
    """Small SQLite-only fallback for the test suite.

    Production uses the PostgreSQL aggregation path above. This path keeps the
    same semantics but is intentionally bounded so unit tests remain fast.
    """
    rows = list(
        db.scalars(
            select(TelemetrySample)
            .where(
                TelemetrySample.battery_id == battery_id,
                TelemetrySample.source == VERIFIED_SOURCE,
                TelemetrySample.measured_at >= from_at,
                TelemetrySample.measured_at <= to_at,
            )
            .order_by(TelemetrySample.measured_at.asc(), TelemetrySample.id.asc())
            .limit(SQLITE_FALLBACK_ROW_LIMIT)
        ).all()
    )
    groups: dict[datetime, list[TelemetrySample]] = {}
    for row in rows:
        measured_at = _utc(row.measured_at) or row.measured_at
        if bucket_seconds:
            epoch = int(measured_at.timestamp())
            key = datetime.fromtimestamp(epoch - (epoch % bucket_seconds), tz=timezone.utc)
        else:
            key = measured_at
        groups.setdefault(key, []).append(row)
    pack: list[TelemetryPackPoint] = []
    cells: list[TelemetryCellPoint] = []
    temperatures: list[TelemetryTemperaturePoint] = []
    for key in sorted(groups)[:max_points]:
        bucket = groups[key]
        stats = [_cell_stats([int(value) for value in (row.cell_voltages_mv or [])]) for row in bucket]
        pack.append(
            TelemetryPackPoint(
                measured_at=key,
                pack_voltage_v=sum(_float(row.pack_voltage_v) for row in bucket) / len(bucket),
                pack_current_a=sum(_float(row.pack_current_a) for row in bucket) / len(bucket),
                soc_pct=sum(_float(row.soc_pct) for row in bucket) / len(bucket),
                capacity_remaining_ah=sum(_float(row.capacity_remaining_ah) for row in bucket) / len(bucket),
                capacity_full_ah=sum(_float(row.capacity_full_ah) for row in bucket) / len(bucket),
                cell_min_mv=float(min(item[0] for item in stats)),
                cell_max_mv=float(max(item[1] for item in stats)),
                cell_avg_mv=sum(item[2] for item in stats) / len(stats),
                cell_delta_mv=float(max(item[1] - item[0] for item in stats)),
            )
        )
        if include_cells:
            cell_count = max((len(row.cell_voltages_mv or []) for row in bucket), default=0)
            cells.append(
                TelemetryCellPoint(
                    measured_at=key,
                    avg_mv=[
                        sum(float(row.cell_voltages_mv[index]) for row in bucket if index < len(row.cell_voltages_mv)) / max(1, sum(1 for row in bucket if index < len(row.cell_voltages_mv)))
                        for index in range(cell_count)
                    ],
                    min_mv=[
                        min(float(row.cell_voltages_mv[index]) for row in bucket if index < len(row.cell_voltages_mv))
                        if any(index < len(row.cell_voltages_mv) for row in bucket) else None
                        for index in range(cell_count)
                    ],
                    max_mv=[
                        max(float(row.cell_voltages_mv[index]) for row in bucket if index < len(row.cell_voltages_mv))
                        if any(index < len(row.cell_voltages_mv) for row in bucket) else None
                        for index in range(cell_count)
                    ],
                )
            )
        sensor_count = max((len(row.temperatures_c or []) for row in bucket), default=0)
        temperatures.append(
            TelemetryTemperaturePoint(
                measured_at=key,
                values_c=[
                    sum(float(row.temperatures_c[index]) for row in bucket if index < len(row.temperatures_c)) / max(1, sum(1 for row in bucket if index < len(row.temperatures_c)))
                    for index in range(sensor_count)
                ],
            )
        )
    return pack, cells, temperatures


def history_telemetry(
    db: Session,
    battery: Battery,
    range_key: str,
    *,
    include_cells: bool = True,
    now: datetime | None = None,
) -> TelemetryHistoryRead:
    if range_key not in RANGE_SPECS:
        raise ValueError(f"Unsupported telemetry range: {range_key}")
    spec = RANGE_SPECS[range_key]
    current_now = _utc(now) or datetime.now(timezone.utc)
    from_at = current_now - timedelta(seconds=spec["seconds"])
    bucket_seconds = spec["bucket_seconds"]
    max_points = spec["max_points"]
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        if bucket_seconds:
            pack, cells, temperatures = _postgres_history(
                db, battery.id, from_at, current_now, bucket_seconds, max_points, include_cells
            )
        else:
            pack, cells, temperatures = _raw_history(
                db, battery.id, from_at, current_now, max_points, include_cells
            )
    else:
        pack, cells, temperatures = _fallback_history(
            db, battery.id, from_at, current_now, bucket_seconds, max_points, include_cells
        )
    return TelemetryHistoryRead(
        battery_id=battery.id,
        asset_id=battery.asset_id,
        range=range_key,
        from_at=from_at,
        to_at=current_now,
        bucket_seconds=bucket_seconds,
        point_count=len(pack),
        pack=pack,
        cells=cells,
        temperatures=temperatures,
        generated_at=current_now,
    )


def _stat_read(values: list[float], unit: str) -> DiagnosticStatsRead:
    count = len(values)
    if not count:
        return DiagnosticStatsRead(count=0, min=None, max=None, avg=None, stddev=None, unit=unit)
    average = sum(values) / count
    deviation = stdev(values) if count > 1 else None
    return DiagnosticStatsRead(
        count=count,
        min=min(values),
        max=max(values),
        avg=average,
        stddev=deviation,
        unit=unit,
    )


def _sql_stat(count: int, minimum: Any, maximum: Any, average: Any, deviation: Any, unit: str) -> DiagnosticStatsRead:
    return DiagnosticStatsRead(
        count=int(count or 0),
        min=_float(minimum) if minimum is not None else None,
        max=_float(maximum) if maximum is not None else None,
        avg=_float(average) if average is not None else None,
        stddev=_float(deviation) if deviation is not None else None,
        unit=unit,
    )


def _evidence_limitations() -> list[str]:
    return [
        "SOH is unavailable from this BMS; it is not inferred from SOC, voltage or capacity.",
        "Cell voltage delta is an observation; it is not a battery fault threshold.",
        "Current polarity has not been certified; charging/discharging is not inferred.",
        "Raw telemetry retention is 7 days; this evidence covers only the requested bounded range.",
        "REAL_BMS provenance depends on authenticated Gateway identity, topic ACL, schema and active assignment; it is not cryptographic proof of physical origin.",
        "Measurement gaps use a 30-second threshold and are inferred from measured_at timestamps.",
    ]


def _expected_sample_count(from_at: datetime, to_at: datetime) -> int:
    seconds = max(0.0, (to_at - from_at).total_seconds())
    return max(1, int(seconds // EXPECTED_INTERVAL_SECONDS) + 1)


def _completeness(sample_count: int, expected: int) -> float:
    if sample_count <= 0:
        return 0.0
    return round(min(100.0, sample_count / max(1, expected) * 100.0), 1)


def _monitoring_window(
    assignment: GatewayBatteryAssignment | None,
    from_at: datetime,
    to_at: datetime,
) -> tuple[datetime | None, datetime | None, int, str]:
    """Return the effective monitoring window and its expected sample count.

    Pre-assignment and pre-retention periods are not device outages. The
    expected count is based on the active Gateway assignment window inside the
    requested range. If there is no active assignment, completeness is not
    computed rather than inventing an availability window.
    """
    if assignment is None:
        return None, None, 0, "no_active_gateway_assignment"
    start = max(from_at, _utc(assignment.assigned_at) or from_at)
    end = min(to_at, _utc(assignment.unassigned_at) or to_at)
    if end <= start:
        return None, None, 0, "no_monitoring_window_in_range"
    return start, end, _expected_sample_count(start, end), "active_gateway_assignment_window"


def _empty_evidence(
    battery: Battery,
    range_key: str,
    from_at: datetime,
    to_at: datetime,
    now: datetime,
    assignment: GatewayBatteryAssignment | None,
) -> DiagnosticEvidenceRead:
    monitoring_from, monitoring_to, expected, completeness_basis = _monitoring_window(assignment, from_at, to_at)
    empty = lambda unit: DiagnosticStatsRead(count=0, min=None, max=None, avg=None, stddev=None, unit=unit)
    gateway_id = assignment.gateway.gateway_id if assignment else None
    slot = assignment.battery_slot if assignment else None
    return DiagnosticEvidenceRead(
        schema_version=EVIDENCE_SCHEMA_VERSION,
        generated_at=now,
        battery_id=battery.id,
        asset_id=battery.asset_id,
        organization_id=battery.organization_id,
        battery_classification=battery.classification,
        gateway_id=gateway_id,
        battery_slot=slot,
        range=range_key,
        from_at=from_at,
        to_at=to_at,
        monitoring_from_at=monitoring_from,
        monitoring_to_at=monitoring_to,
        completeness_basis=completeness_basis,
        latest_measured_at=None,
        latest_received_at=None,
        sample_count=0,
        expected_sample_count=expected,
        data_completeness_pct=0.0,
        expected_interval_seconds=EXPECTED_INTERVAL_SECONDS,
        time_quality=[],
        pack=DiagnosticPackStatsRead(
            pack_voltage=empty("V"),
            pack_current=empty("A"),
            peak_abs_current_a=None,
            soc=empty("%"),
            capacity_remaining_ah=empty("Ah"),
            capacity_full_ah=empty("Ah"),
            temperature_min_c=None,
            temperature_max_c=None,
        ),
        cells=[],
        cell_delta=empty("mV"),
        temperatures=[],
        measurement_gaps=[],
        gap_threshold_seconds=GAP_THRESHOLD_SECONDS,
        provenance=DiagnosticProvenanceRead(
            source=None,
            protocol=None,
            time_quality=[],
            gateway_id=gateway_id,
            battery_slot=slot,
            assignment_assigned_at=_utc(assignment.assigned_at) if assignment else None,
            verified_source_only=True,
        ),
        limitations=_evidence_limitations(),
    )


def _postgres_evidence(
    db: Session,
    battery: Battery,
    range_key: str,
    from_at: datetime,
    to_at: datetime,
    now: datetime,
    assignment: GatewayBatteryAssignment | None,
) -> DiagnosticEvidenceRead:
    params = {
        "battery_id": battery.id,
        "from_at": from_at,
        "to_at": to_at,
        "source": VERIFIED_SOURCE,
        "gap_threshold": GAP_THRESHOLD_SECONDS,
        "max_gaps": MAX_EVIDENCE_GAPS,
    }
    pack_row = db.execute(
        text(
            """
            WITH base AS (
                SELECT t.measured_at,
                       t.received_at,
                       t.pack_voltage_v,
                       t.pack_current_a,
                       t.soc_pct,
                       t.capacity_remaining_ah,
                       t.capacity_full_ah,
                       stats.min_mv,
                       stats.max_mv,
                       stats.avg_mv,
                       (stats.max_mv - stats.min_mv) AS delta_mv,
                       temps.min_c,
                       temps.max_c
                FROM telemetry_samples t
                CROSS JOIN LATERAL (
                    SELECT min(v.value::numeric) AS min_mv,
                           max(v.value::numeric) AS max_mv,
                           avg(v.value::numeric) AS avg_mv
                    FROM json_array_elements_text(t.cell_voltages_mv) AS v(value)
                ) stats
                CROSS JOIN LATERAL (
                    SELECT min(v.value::numeric) AS min_c,
                           max(v.value::numeric) AS max_c
                    FROM json_array_elements_text(t.temperatures_c) AS v(value)
                ) temps
                WHERE t.battery_id = :battery_id
                  AND t.source = :source
                  AND t.measured_at >= :from_at
                  AND t.measured_at <= :to_at
            )
            SELECT count(*)::int AS sample_count,
                   min(pack_voltage_v)::float AS voltage_min,
                   max(pack_voltage_v)::float AS voltage_max,
                   avg(pack_voltage_v)::float AS voltage_avg,
                   stddev_samp(pack_voltage_v)::float AS voltage_stddev,
                   min(pack_current_a)::float AS current_min,
                   max(pack_current_a)::float AS current_max,
                   avg(pack_current_a)::float AS current_avg,
                   stddev_samp(pack_current_a)::float AS current_stddev,
                   max(abs(pack_current_a))::float AS peak_abs_current,
                   min(soc_pct)::float AS soc_min,
                   max(soc_pct)::float AS soc_max,
                   avg(soc_pct)::float AS soc_avg,
                   stddev_samp(soc_pct)::float AS soc_stddev,
                   min(capacity_remaining_ah)::float AS remaining_min,
                   max(capacity_remaining_ah)::float AS remaining_max,
                   avg(capacity_remaining_ah)::float AS remaining_avg,
                   stddev_samp(capacity_remaining_ah)::float AS remaining_stddev,
                   min(capacity_full_ah)::float AS full_min,
                   max(capacity_full_ah)::float AS full_max,
                   avg(capacity_full_ah)::float AS full_avg,
                   stddev_samp(capacity_full_ah)::float AS full_stddev,
                   min(min_c)::float AS temp_min,
                   max(max_c)::float AS temp_max,
                   min(delta_mv)::float AS delta_min,
                   max(delta_mv)::float AS delta_max,
                   avg(delta_mv)::float AS delta_avg,
                   stddev_samp(delta_mv)::float AS delta_stddev,
                   min(measured_at) AS first_measured_at,
                   max(measured_at) AS latest_measured_at,
                   max(received_at) AS latest_received_at
            FROM base
            """
        ),
        params,
    ).mappings().one()
    sample_count = int(pack_row["sample_count"] or 0)
    monitoring_from, monitoring_to, expected, completeness_basis = _monitoring_window(assignment, from_at, to_at)
    if sample_count == 0:
        return _empty_evidence(battery, range_key, from_at, to_at, now, assignment)

    cell_rows = db.execute(
        text(
            """
            SELECT cell.ordinality::int AS cell_index,
                   count(*)::int AS sample_count,
                   min(cell.value::numeric)::float AS minimum,
                   max(cell.value::numeric)::float AS maximum,
                   avg(cell.value::numeric)::float AS average,
                   stddev_samp(cell.value::numeric)::float AS deviation
            FROM telemetry_samples t
            CROSS JOIN LATERAL json_array_elements_text(t.cell_voltages_mv)
                WITH ORDINALITY AS cell(value, ordinality)
            WHERE t.battery_id = :battery_id
              AND t.source = :source
              AND t.measured_at >= :from_at
              AND t.measured_at <= :to_at
            GROUP BY cell.ordinality
            ORDER BY cell.ordinality
            """
        ),
        params,
    ).mappings().all()
    temperature_rows = db.execute(
        text(
            """
            SELECT temp.ordinality::int AS sensor_index,
                   count(*)::int AS sample_count,
                   min(temp.value::numeric)::float AS minimum,
                   max(temp.value::numeric)::float AS maximum,
                   avg(temp.value::numeric)::float AS average,
                   stddev_samp(temp.value::numeric)::float AS deviation
            FROM telemetry_samples t
            CROSS JOIN LATERAL json_array_elements_text(t.temperatures_c)
                WITH ORDINALITY AS temp(value, ordinality)
            WHERE t.battery_id = :battery_id
              AND t.source = :source
              AND t.measured_at >= :from_at
              AND t.measured_at <= :to_at
            GROUP BY temp.ordinality
            ORDER BY temp.ordinality
            """
        ),
        params,
    ).mappings().all()
    time_quality_rows = db.execute(
        text(
            """
            SELECT DISTINCT time_quality
            FROM telemetry_samples
            WHERE battery_id = :battery_id
              AND source = :source
              AND measured_at >= :from_at
              AND measured_at <= :to_at
            ORDER BY time_quality
            """
        ),
        params,
    ).scalars().all()
    latest_meta = db.execute(
        text(
            """
            SELECT source, protocol
            FROM telemetry_samples
            WHERE battery_id = :battery_id
              AND source = :source
              AND measured_at >= :from_at
              AND measured_at <= :to_at
            ORDER BY measured_at DESC, id DESC
            LIMIT 1
            """
        ),
        params,
    ).mappings().first()
    gaps = db.execute(
        text(
            """
            WITH samples AS (
                SELECT measured_at,
                       lag(measured_at) OVER (ORDER BY measured_at) AS previous_measured_at
                FROM telemetry_samples
                WHERE battery_id = :battery_id
                  AND source = :source
                  AND measured_at >= :from_at
                  AND measured_at <= :to_at
            )
            SELECT previous_measured_at,
                   measured_at AS next_measured_at,
                   extract(epoch FROM (measured_at - previous_measured_at))::float AS duration_seconds
            FROM samples
            WHERE previous_measured_at IS NOT NULL
              AND measured_at - previous_measured_at > make_interval(secs => :gap_threshold)
            ORDER BY measured_at
            LIMIT :max_gaps
            """
        ),
        params,
    ).mappings().all()

    cells = [
        DiagnosticCellStatsRead(
            cell_index=int(row["cell_index"]),
            cell_voltage=_sql_stat(
                row["sample_count"], row["minimum"], row["maximum"], row["average"], row["deviation"], "mV"
            ),
        )
        for row in cell_rows
    ]
    temperatures = [
        DiagnosticTemperatureStatsRead(
            sensor_index=int(row["sensor_index"]),
            temperature=_sql_stat(
                row["sample_count"], row["minimum"], row["maximum"], row["average"], row["deviation"], "°C"
            ),
        )
        for row in temperature_rows
    ]
    gateway_id = assignment.gateway.gateway_id if assignment else None
    slot = assignment.battery_slot if assignment else None
    return DiagnosticEvidenceRead(
        schema_version=EVIDENCE_SCHEMA_VERSION,
        generated_at=now,
        battery_id=battery.id,
        asset_id=battery.asset_id,
        organization_id=battery.organization_id,
        battery_classification=battery.classification,
        gateway_id=gateway_id,
        battery_slot=slot,
        range=range_key,
        from_at=from_at,
        to_at=to_at,
        monitoring_from_at=monitoring_from,
        monitoring_to_at=monitoring_to,
        completeness_basis=completeness_basis,
        latest_measured_at=_utc(pack_row["latest_measured_at"]),
        latest_received_at=_utc(pack_row["latest_received_at"]),
        sample_count=sample_count,
        expected_sample_count=expected,
        data_completeness_pct=_completeness(sample_count, expected),
        expected_interval_seconds=EXPECTED_INTERVAL_SECONDS,
        time_quality=[str(item) for item in time_quality_rows],
        pack=DiagnosticPackStatsRead(
            pack_voltage=_sql_stat(sample_count, pack_row["voltage_min"], pack_row["voltage_max"], pack_row["voltage_avg"], pack_row["voltage_stddev"], "V"),
            pack_current=_sql_stat(sample_count, pack_row["current_min"], pack_row["current_max"], pack_row["current_avg"], pack_row["current_stddev"], "A"),
            peak_abs_current_a=_float(pack_row["peak_abs_current"]),
            soc=_sql_stat(sample_count, pack_row["soc_min"], pack_row["soc_max"], pack_row["soc_avg"], pack_row["soc_stddev"], "%"),
            capacity_remaining_ah=_sql_stat(sample_count, pack_row["remaining_min"], pack_row["remaining_max"], pack_row["remaining_avg"], pack_row["remaining_stddev"], "Ah"),
            capacity_full_ah=_sql_stat(sample_count, pack_row["full_min"], pack_row["full_max"], pack_row["full_avg"], pack_row["full_stddev"], "Ah"),
            temperature_min_c=_float(pack_row["temp_min"]),
            temperature_max_c=_float(pack_row["temp_max"]),
        ),
        cells=cells,
        cell_delta=_sql_stat(sample_count, pack_row["delta_min"], pack_row["delta_max"], pack_row["delta_avg"], pack_row["delta_stddev"], "mV"),
        temperatures=temperatures,
        measurement_gaps=[
            DiagnosticGapRead(
                previous_measured_at=_utc(row["previous_measured_at"]) or row["previous_measured_at"],
                next_measured_at=_utc(row["next_measured_at"]) or row["next_measured_at"],
                duration_seconds=_float(row["duration_seconds"]),
                missing_sample_estimate=max(0, int(_float(row["duration_seconds"]) / EXPECTED_INTERVAL_SECONDS) - 1),
            )
            for row in gaps
        ],
        gap_threshold_seconds=GAP_THRESHOLD_SECONDS,
        provenance=DiagnosticProvenanceRead(
            source=latest_meta["source"] if latest_meta else None,
            protocol=latest_meta["protocol"] if latest_meta else None,
            time_quality=[str(item) for item in time_quality_rows],
            gateway_id=gateway_id,
            battery_slot=slot,
            assignment_assigned_at=_utc(assignment.assigned_at) if assignment else None,
            verified_source_only=True,
        ),
        limitations=_evidence_limitations(),
    )


def _fallback_evidence(
    db: Session,
    battery: Battery,
    range_key: str,
    from_at: datetime,
    to_at: datetime,
    now: datetime,
    assignment: GatewayBatteryAssignment | None,
) -> DiagnosticEvidenceRead:
    rows = list(
        db.scalars(
            select(TelemetrySample)
            .where(
                TelemetrySample.battery_id == battery.id,
                TelemetrySample.source == VERIFIED_SOURCE,
                TelemetrySample.measured_at >= from_at,
                TelemetrySample.measured_at <= to_at,
            )
            .order_by(TelemetrySample.measured_at.asc(), TelemetrySample.id.asc())
            .limit(SQLITE_FALLBACK_ROW_LIMIT)
        ).all()
    )
    if not rows:
        return _empty_evidence(battery, range_key, from_at, to_at, now, assignment)
    pack_voltage = [_float(row.pack_voltage_v) for row in rows]
    pack_current = [_float(row.pack_current_a) for row in rows]
    soc = [_float(row.soc_pct) for row in rows]
    remaining = [_float(row.capacity_remaining_ah) for row in rows]
    full = [_float(row.capacity_full_ah) for row in rows]
    deltas = []
    cell_values: dict[int, list[float]] = {}
    temp_values: dict[int, list[float]] = {}
    for row in rows:
        cells = [float(value) for value in (row.cell_voltages_mv or [])]
        if cells:
            deltas.append(max(cells) - min(cells))
        for index, value in enumerate(cells):
            cell_values.setdefault(index, []).append(value)
        for index, value in enumerate(row.temperatures_c or []):
            temp_values.setdefault(index, []).append(float(value))
    gaps = []
    for previous, current in zip(rows, rows[1:]):
        duration = (_utc(current.measured_at) - _utc(previous.measured_at)).total_seconds()
        if duration > GAP_THRESHOLD_SECONDS:
            gaps.append(
                DiagnosticGapRead(
                    previous_measured_at=_utc(previous.measured_at) or previous.measured_at,
                    next_measured_at=_utc(current.measured_at) or current.measured_at,
                    duration_seconds=duration,
                    missing_sample_estimate=max(0, int(duration / EXPECTED_INTERVAL_SECONDS) - 1),
                )
            )
            if len(gaps) >= MAX_EVIDENCE_GAPS:
                break
    latest = rows[-1]
    monitoring_from, monitoring_to, expected, completeness_basis = _monitoring_window(assignment, from_at, to_at)
    gateway_id = assignment.gateway.gateway_id if assignment else None
    slot = assignment.battery_slot if assignment else None
    all_temps = [value for values in temp_values.values() for value in values]
    return DiagnosticEvidenceRead(
        schema_version=EVIDENCE_SCHEMA_VERSION,
        generated_at=now,
        battery_id=battery.id,
        asset_id=battery.asset_id,
        organization_id=battery.organization_id,
        battery_classification=battery.classification,
        gateway_id=gateway_id,
        battery_slot=slot,
        range=range_key,
        from_at=from_at,
        to_at=to_at,
        monitoring_from_at=monitoring_from,
        monitoring_to_at=monitoring_to,
        completeness_basis=completeness_basis,
        latest_measured_at=_utc(latest.measured_at),
        latest_received_at=_utc(latest.received_at),
        sample_count=len(rows),
        expected_sample_count=expected,
        data_completeness_pct=_completeness(len(rows), expected),
        expected_interval_seconds=EXPECTED_INTERVAL_SECONDS,
        time_quality=sorted({str(row.time_quality) for row in rows}),
        pack=DiagnosticPackStatsRead(
            pack_voltage=_stat_read(pack_voltage, "V"),
            pack_current=_stat_read(pack_current, "A"),
            peak_abs_current_a=max((abs(value) for value in pack_current), default=None),
            soc=_stat_read(soc, "%"),
            capacity_remaining_ah=_stat_read(remaining, "Ah"),
            capacity_full_ah=_stat_read(full, "Ah"),
            temperature_min_c=min(all_temps) if all_temps else None,
            temperature_max_c=max(all_temps) if all_temps else None,
        ),
        cells=[
            DiagnosticCellStatsRead(cell_index=index + 1, cell_voltage=_stat_read(values, "mV"))
            for index, values in sorted(cell_values.items())
        ],
        cell_delta=_stat_read(deltas, "mV"),
        temperatures=[
            DiagnosticTemperatureStatsRead(sensor_index=index + 1, temperature=_stat_read(values, "°C"))
            for index, values in sorted(temp_values.items())
        ],
        measurement_gaps=gaps,
        gap_threshold_seconds=GAP_THRESHOLD_SECONDS,
        provenance=DiagnosticProvenanceRead(
            source=latest.source,
            protocol=latest.protocol,
            time_quality=sorted({str(row.time_quality) for row in rows}),
            gateway_id=gateway_id,
            battery_slot=slot,
            assignment_assigned_at=_utc(assignment.assigned_at) if assignment else None,
            verified_source_only=True,
        ),
        limitations=_evidence_limitations(),
    )


def diagnostic_evidence(
    db: Session,
    battery: Battery,
    range_key: str,
    *,
    now: datetime | None = None,
) -> DiagnosticEvidenceRead:
    if range_key not in RANGE_SPECS:
        raise ValueError(f"Unsupported evidence range: {range_key}")
    spec = RANGE_SPECS[range_key]
    current_now = _utc(now) or datetime.now(timezone.utc)
    from_at = current_now - timedelta(seconds=spec["seconds"])
    assignment = _current_assignment(db, battery.id)
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        return _postgres_evidence(db, battery, range_key, from_at, current_now, current_now, assignment)
    return _fallback_evidence(db, battery, range_key, from_at, current_now, current_now, assignment)
