# Mission 018 — PinLab Battery Analytics Dashboard

- **Status:** Development complete; tests pass; **not deployed to production**.
- **Feature branch:** `mission-018-battery-analytics`
- **Draft PR:** https://github.com/PicoPiece/pinlab-batterylifecycleapp/pull/1
- **Production baseline at development time:** API/frontend `rc-ac3e599`; Alembic `e5f6a7b8c9d0`; consumer `pinlab-prod-mqtt-ingest`.
- **Scope:** Battery Detail analytics for `PL-APESS-0001` using verified `REAL_BMS` telemetry only.

## 1. Product structure

The existing Battery Detail page now has an **Analytics** tab. The tab contains:

1. **Overview** — compact operating summary plus synchronized SOC, pack voltage,
   pack current and cell-delta charts.
2. **Cell Analysis** — min/max/average summary, all 16 cell histories,
   individual cell selection, per-cell min/max history, current cell readings
   and cell-delta history.
3. **History** — shared time range and grouped panels for pack history,
   individual cell history and five temperature sensors.

The existing Overview, Inspections, Lifecycle and Warranty passport functions
remain unchanged.

## 2. Authorization and data integrity

- All telemetry endpoints require the existing authenticated session and
  organization access context.
- The endpoint takes only a Battery ID. It never trusts a client-supplied
  organization ID.
- Battery visibility is checked with the existing `get_battery_or_404`
  authorization helper. Cross-organization requests return `404`.
- Analytics queries are restricted to `source = REAL_BMS`; `SIMULATED` samples
  are not mixed into diagnostics.
- `measured_at` is used for chart history. `received_at` is used for
  Gateway health/last-seen.
- `SOH = NULL` is rendered as **N/A**; no health or alarm is inferred.
- Current sign is displayed as measured. The UI does not infer charging or
  discharging.
- Latest values remain visible when stale/offline, with an explicit status
  and freshness hint.

### Freshness thresholds

| Status | Condition |
|---|---|
| ONLINE | last `received_at` ≤ 30 seconds |
| STALE | 30 seconds < last `received_at` ≤ 5 minutes |
| OFFLINE | last `received_at` > 5 minutes |
| UNKNOWN | no verified sample or no Gateway assignment |

## 3. API

Authenticated endpoints:

```text
GET /api/v1/batteries/{battery_id}/telemetry/latest
GET /api/v1/batteries/{battery_id}/telemetry/history?range=1h|24h|7d&include_cells=true|false
```

Implemented in `backend/app/routers/telemetry.py` and
`backend/app/telemetry.py`; schemas are in `backend/app/schemas.py`.

`latest` returns:

- Gateway identity, slot, assigned time and freshness.
- Latest verified sample with pack values, 16 cell voltages, five
  temperatures, min/max/average cell values, min/max cell numbers and delta.
- `server_time` for client freshness display.

`history` returns:

- Bounded `pack` points with SOC, voltage, current, capacity, per-bucket cell
  min/max/average and cell delta.
- `cells` points with per-cell average/min/max over the bucket, when
  `include_cells=true`.
- `temperatures` points with five sensor values.
- `bucket_seconds`, `from_at`, `to_at` and `point_count`.

The overview/history pack request uses `include_cells=false` so the large cell
series is loaded only when Cell Analysis or the history cell panel is opened.

## 4. Query strategy

| Range | Query strategy | Target/hard bound |
|---|---|---|
| 1h | Raw samples; newest 1,000 maximum | ~360 expected |
| 24h | 5-minute PostgreSQL buckets | ~288 points |
| 7d | 30-minute PostgreSQL buckets | ~336 points |

Production PostgreSQL performs bucketing, averaging, min/max and extrema
calculations. The browser never receives seven days of raw samples.

- Cell delta is calculated **per raw measurement** before bucket aggregation;
  each bucket keeps the maximum observed delta.
- Cell bucket records retain per-cell average, minimum and maximum so a short
  deviation is not lost to the bucket average.
- Existing `ix_telemetry_battery_measured_at` supports the Battery/time filter.
  No schema migration or extra index was added; the query plan was inspected
  against the existing table.
- A small SQLite-only fallback supports the existing unit-test suite. It is
  not used by production.

## 5. Frontend

Files:

- `frontend/src/components/telemetry/TelemetryDashboard.tsx`
- `frontend/src/components/telemetry/TelemetryCharts.tsx`
- `frontend/src/components/telemetry/telemetryUtils.ts`
- `frontend/src/telemetry.css`
- `frontend/src/pages/BatteryDetailPage.tsx`

Implementation details:

- Reuses the existing Recharts dependency; no new chart library or dashboard
  application was added.
- The Analytics component is dynamically imported, so the chart bundle loads
  only when the Analytics tab is opened.
- Latest polling runs every 15 seconds only while the document is visible.
- History loads on range change/tab demand; it is not polled.
- AbortController cancels stale latest/history/cell requests.
- Missing timestamps insert explicit null rows so charts render a gap rather
  than a fabricated interpolation.
- `connectNulls={false}`, synchronized `syncId`, tooltips and Recharts Brush
  zoom are used.
- Cell charts support summary (min/max/average), all 16, and custom cell
  selection. Clicking a current cell switches to its custom history.
- Mobile uses grouped History tabs and horizontally scrollable primary tabs;
  16 cell cards use a two-column layout at phone widths.
- `prefers-reduced-motion` is respected; chart animation is disabled.

## 6. Verification

### Backend

```text
53 passed
```

Including `backend/tests/test_telemetry_dashboard.py`:

- latest verified metrics and cell min/max indices
- stale/offline freshness from `received_at`
- raw 1h cell/temperature history
- 24h bucket extrema and per-sample delta preservation
- `include_cells=false` pack-only loading
- exclusion of `SIMULATED` samples
- empty telemetry behavior
- invalid range rejection
- cross-organization access denial

### Frontend

```text
3 test files passed
9 tests passed
production build passed
```

Telemetry tests cover null-gap insertion, 16-cell transforms and five-sensor
temperature transforms.

### Browser E2E

Executed against an isolated copy of the production database with authorized
read-only access. No production service was modified.

```text
cd frontend
BASE_URL=http://127.0.0.1:5181 npm run test:e2e:mission018
12/12 checks passed
0 console/page errors
```

Covered:

- Overview, Cell Analysis and History
- verified `REAL_BMS` context and `GW-000001`
- 16 current cell readings
- all 16 historical cell series
- cell selection switching to custom history
- History pack/cell/temperature panels
- 1h, 24h and 7d range requests
- mobile 390 px layout with no horizontal overflow

Evidence:

- `/home/picopiece/PinLab/Projects/ProjectManagement/Mission018/e2e-result.json`
- Full local evidence: `ProjectManagement/Mission018/screenshots/` (desktop overview, cell summary, all 16 cells, selected cell, history pack/cell/temperature, mobile overview/cells).
- Committed review copies: `docs/mission018/desktop-overview.png`,
  `docs/mission018/desktop-cells-all.png`,
  `docs/mission018/desktop-history-cell.png`,
  `docs/mission018/mobile-overview.png`.

## 7. Performance measurements

### API on isolated production copy (208 real samples at final verification)

| Request | Median latency | Response size |
|---|---:|---:|
| latest | ~20 ms | ~1.0 KB |
| 1h pack-only | ~30–40 ms | ~66 KB |
| 1h including cells | ~40–60 ms | ~151 KB |
| 24h pack-only | ~40 ms | ~2.8 KB |
| 7d pack-only | ~40 ms | ~0.9 KB |

### Synthetic 60,480-row PostgreSQL performance dataset

Used only in the isolated development copy; not production data.

| Request | Latency | Result size |
|---|---:|---:|
| 7d pack + temperatures (`include_cells=false`) | ~1.9 s | ~106 KB / 337 pack points |
| 7d including all 16 cell series | ~3.4 s | ~244 KB / 337 buckets, 5,392 grouped cell rows |
| 24h including cells | ~0.6 s | ~237 KB / 289 points |

Query plan observations on the 60k-row test dataset:

- Pack aggregation: ~746 ms; 337 groups; sequential scan appropriate because
  all 60k rows matched the single test Battery.
- Per-cell 7d aggregation: ~2.2 s; 969k expanded cell values, grouped to 5,392
  rows. This path is intentionally on-demand (Cell Analysis/history cell
  panel), not loaded by Overview.
- Existing Battery/time index remains available; no migration was added.

Browser observations:

- used JS heap: ~37.3 MB / 64 MB total on the 208-sample production copy.
- 24h chart visible: ~0.5–0.6 s in local Vite development mode.
- 7d pack history visible: ~0.37 s on the 208-sample copy.
- 390 px viewport: 0 px horizontal overflow.
- Idle development containers: API ~78 MB RAM / ~0.13% CPU; PostgreSQL
  ~157 MB RAM / ~0.00% CPU (`docker stats --no-stream`).

The 7d cell-series aggregation is the main performance risk. If production
latency is unacceptable at full 60k rows, the next safe optimization is a
separate `/telemetry/cells` endpoint or a pre-aggregated rollup; neither is
implemented or deployed in this mission.

## 8. Deployment readiness checklist

Before a separately authorized production deployment:

1. Obtain CTO approval for the exact API/frontend image tags and deployment
   window.
2. Confirm production DB remains at `e5f6a7b8c9d0`; no Mission 018 migration is
   required.
3. Build backend and frontend images from the approved commit.
4. Preserve the production MQTT consumer, broker, Gateway credentials,
   Cloudflare routes and Battery Passport mapping.
5. Run schema/read-only smoke tests against production and verify the
   `PL-APESS-0001` record.
6. Verify existing Passport, inspection, warranty, lifecycle and ownership
   functions remain functional.
7. Verify no secrets are present in image/build logs.
8. Re-run desktop/mobile acceptance and monitor API latency for 1h/24h/7d.
9. Keep a rollback point for the API/frontend only; do not restore the entire
   database.

## 9. Explicit non-goals

- No production deployment during Mission 018.
- No CAN, OTA, flash cache, BLE or BMS write support.
- No Grafana, ThingsBoard, Redis, TimescaleDB or separate dashboard app.
- No MQTT credentials exposed to the browser.
- No production schema changes or telemetry data mutation.
