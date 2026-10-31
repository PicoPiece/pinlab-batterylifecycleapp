# Monitoring & Chart Architecture — Read-only Assessment

**Date:** 2026-10-31
**Status:** READ-ONLY analysis. No telemetry tables, charts, BLE, gateway or firmware changes were made.

## 1. Existing measurement model

`backend/app/models.py` → `Measurement` (`measurements` table):

| Field | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `battery_id` | FK batteries | indexed; parent authorizes access |
| `metric` | enum | `soc`, `soh`, `voltage`, `current`, `temperature` |
| `value` | numeric(12,4) | one value per row |
| `unit` | varchar(20) | `%`, `V`, `A`, `°C` etc. |
| `source` | enum | `manual`, `mock`, `bms_udan`, `inverter_modbus` |
| `quality` | enum | `measured`, `estimated`, `unknown` |
| `measured_at` | timestamptz | sample timestamp |
| `notes` | text | mock records carry SIMULATED prefix |
| `created_by_id` | FK users | |
| `created_at` | timestamptz | database insert time |

Related: `Battery` (organization and asset identity), `Inspection` and `LifecycleEvent` (operational context). No device, gateway, telemetry-ingest or timeseries-specific table exists.

## 2. Existing API

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/batteries/{id}/measurements?metric=&page=&page_size=` | paginated history, newest first |
| `GET /api/v1/batteries/{id}/measurements/latest` | latest value for each of five metrics |
| `POST /api/v1/batteries/{id}/measurements` | manual/mock measurement; battery write scope required |
| `GET /api/v1/batteries/portfolio` | latest snapshots plus latest measurement timestamp |
| `GET /api/v1/dashboard` | aggregate SOC/SOH availability/distribution and recent activity |
| `GET /api/v1/integrations/providers` | provider metadata only; no ingestion endpoint |

All measurement endpoints now inherit the same battery `AccessContext` scope as the Battery Passport.

## 3. Existing frontend monitoring surface

- `frontend/src/pages/MonitoringPage.tsx`: fleet selector plus latest snapshot cards for SOC, SOH, voltage, current and temperature.
- `frontend/src/pages/BatteryDetailPage.tsx`: latest values and a recent measurement history table.
- `frontend/src/pages/DashboardPage.tsx`: aggregate KPI/status distribution presentation.
- No chart component exists. `recharts` is present in `package.json` but is not imported anywhere in `frontend/src`.
- Monitoring page explicitly labels the experience as preview/not connected and mock values with source/quality/timestamp.
- There are no time-series charts, zooming, downsampling, live streaming, alarms or device connection state.

## 4. Data provenance today

- Seed records in `backend/app/seed.py` use `source=mock`, `quality=estimated`, `notes="SIMULATED — ..."`.
- QA aggregate read-only check: **52 measurements, all `mock` / `estimated`**.
- No actual BMS or gateway ingestion path exists.
- The UI does not present mock values as live or measured production telemetry.

## 5. Missing fields for future BMS telemetry

Future ingestion should add, without changing the current measurement semantics:

1. Device/gateway identity: `device_id`, `gateway_id`, hardware/firmware version.
2. Tenant ownership: battery → organization is the current authorization path; device records must resolve to the same organization.
3. Idempotency: `external_sample_id` / `source_sequence` + unique constraint.
4. Device/sample timestamps: `device_measured_at`, `received_at`, `ingested_at`, clock-quality/offset.
5. Pack topology: pack/module/cell identifiers, parallel strings.
6. Cell-level telemetry: min/max/number of cell voltages, min/max temperatures, balancing state.
7. Pack state: SOC, SOH, cycle count, charge/discharge state, current limits, contactor state.
8. Alarm/event data: alarm code, severity, reset/acknowledgement, BMS fault flags.
9. Sampling metadata: interval, sample rate, raw payload hash, protocol, quality.
10. Retention/downsampling policy and time-series indexes (e.g. `(battery_id, metric, measured_at)`).
11. Ingestion authentication distinct from human session cookies.
12. Server-side alert evaluation and audit trail; do not trust device timestamps blindly.

## 6. Recommended future boundary

Do not extend `measurements` into a full telemetry lake without an approved ingestion design. A minimal future increment should add a separate device/ingest model and preserve the current measurement table for manually verified or curated values. Any future chart must consume the same scoped battery authorization and must label `source`/`quality`/timestamp.

## 7. Not done

- No telemetry tables.
- No ingestion endpoint.
- No charts.
- No BLE/ESP32/gateway/firmware work.
- No production data query or migration.
