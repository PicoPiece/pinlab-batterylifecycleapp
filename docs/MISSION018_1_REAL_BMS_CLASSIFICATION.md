# Mission 018.1 — REAL_BMS Integration, Classification & Demo-State Cleanup

- **Status:** Development complete; local production-copy verified; **not deployed**.
- **Branch:** `mission-018.1-real-bms-classification`
- **Draft PR:** https://github.com/PicoPiece/pinlab-batterylifecycleapp/pull/2 (stacked on `mission-018-battery-analytics`)
- **Base:** `mission-018-battery-analytics` (Mission 018 Draft PR)
- **Production context at review:** API/frontend `rc-ac3e599`; Alembic `e5f6a7b8c9d0`; consumer `pinlab-prod-mqtt-ingest` healthy.
- **Production deployment:** none. No production schema, data, MQTT, Cloudflare or firmware change.

## 1. Phase A — Mission 018 review and remaining defects

Mission 018 already provided verified REAL_BMS analytics in the Battery Detail
Analytics tab, including 16-cell history, delta, temperatures and
1h/24h/7d ranges. It did **not** yet fix:

| Observed issue | Root cause | Status |
|---|---|---|
| `Hồ sơ demo` on PL-APESS-0001 | Static `passport.demoProfile` badge in Battery Detail | Fixed |
| Sidebar `Bộ dữ liệu demo` | Static `nav.demoDataset` / `nav.demoNote`; no backend classification | Fixed |
| SOC/SOH/voltage/current/temp empty on Battery Health | Health card read only `measurements`; PL-APESS has zero manual measurements | Fixed; health now uses verified telemetry |
| Manual history 0 records | Correct: no technician-entered measurements | Preserved; clearly separated |
| Monitoring preview | Global fleet Monitoring page remains preview; per-battery analytics was newly implemented | Clarified/link added; global page remains preview |
| `Agency Preview` workspace label | Static workspace environment label | Changed to context-aware workspace/data mode |

Mission 018 analytics was not rebuilt or degraded.

## 2. Phase B — Classification design

No existing `is_demo`, `data_mode`, `asset_type` or `record_origin` field existed.
The smallest additive design is:

- `BatteryClassification = real | demo`
- nullable `batteries.classification`; `NULL` means **unclassified**
- no default, no inference from asset ID prefix, telemetry presence, Gateway
  name or global mode
- explicit inventory/backfill for the reviewed production rows
- authorized manager/super-admin update endpoint using the existing security
  audit table

Full inventory and migration plan:
`docs/MISSION018_1_CLASSIFICATION_INVENTORY.md`.

### Initial inventory result on the isolated copy

- 17 rows reviewed: 1 real (`PL-APESS-0001`, DB ID 17), 16 demo/test.
- Active application count: 1 real + 15 demo + 0 unclassified.
- The 16th demo row is the deleted E2E test asset, retained with demo
  classification for audit consistency.
- Production remains unclassified and unmigrated until CTO approval.

## 3. Backend contract

### Battery

`BatteryRead` now includes:

```json
{ "classification": "real" | "demo" | null }
```

`PATCH /api/v1/batteries/{battery_id}/classification`:

- payload `{ "classification": "real" | "demo" }`
- requires PinLab manager or super-admin
- cross-organization access returns `404`
- writes `battery.classification.update` to the existing security audit table
- never triggered by telemetry ingestion

`DashboardSummary` now includes:

```text
real_batteries
demo_batteries
unclassified_batteries
```

### Latest telemetry

Mission 018 `latest` was extended without replacing its verified sample:

```text
battery_classification
has_real_telemetry
telemetry_source          # source of the verified REAL_BMS sample
latest_any_source         # any source, including SIMULATED
latest_any_at
```

`sample` remains the latest verified `REAL_BMS` sample. A newer SIMULATED
sample is exposed separately and is never treated as verified health data.

## 4. Telemetry trust boundary

The existing Mission 017 consumer enforces authenticated Gateway identity,
topic ACL, schema, active slot assignment and server-side SIMULATED policy.
`source=REAL_BMS` is therefore a trusted-device-origin label, **not
cryptographic proof** that a physical BMS produced the payload. A compromised
authenticated Gateway could claim it.

The ingestion pipeline was intentionally not changed in this mission.
Recommended future hardening: Gateway-signed payloads or a server-side
per-Gateway provenance policy. Any change must preserve Mission 017 production
ingestion.

Production currently contains only `REAL_BMS` telemetry; SIMULATED records are
development/test data and are excluded from verified analytics.

## 5. Battery Health integration

For a REAL Passport with verified telemetry, the Battery Detail health card now
displays from the backend latest response:

- SOC
- pack voltage
- pack current
- remaining/full capacity
- min/max and all five temperature readings
- last received timestamp
- Gateway ID and online/stale/offline state
- `REAL_BMS` source label
- SOH: **N/A** when `soh_pct` is NULL

No Mission 017 values are hardcoded. On the isolated production copy the card
showed the live latest values, including SOC 35.45%, 52.53 V, 0 A,
35.45/100 Ah, 16 cells in Analytics and five temperature readings.

REAL + SIMULATED displays an explicit simulated warning.
DEMO + REAL_BMS displays device values but keeps a classification-review
warning.
REAL + no verified telemetry displays “No real telemetry”.
Manual measurements are not used to fabricate BMS health.

## 6. Demo-state cleanup

- REAL Passport: no static demo badge/banner; shows `Pin thật` / Real battery.
- DEMO Passport: retains `DEMO`, demo banner and mock/simulated provenance.
- Unclassified Passport: neutral unclassified warning; not labeled demo.
- Sidebar and top environment use backend counts:
  - production only
  - production + demo
  - demo only
  - unclassified
- `Agency Preview` workspace label changed to `PinLab Workspace`.
- Global demo disclaimers were replaced by classification summaries.
- Global Monitoring remains explicitly a fleet preview, with a direct link to
  per-battery REAL_BMS Analytics.
- No global demo-mode banner is used merely because sample Passports exist.

## 7. Manual measurements vs automated telemetry

- `measurements` remains technician-entered, with source/quality/timestamp and
  existing inspection relationships.
- `telemetry_samples` remains Gateway/MQTT automated, with 7-day raw retention.
- The Battery Detail manual history is labelled **Manual history** and shows
  an empty state when zero technician measurements exist.
- Automated telemetry is shown in the Analytics tab and the BMS health card.
- No synthetic measurements were inserted to fill the manual history.

## 8. Tests and verification

### Backend

```text
60 passed
```

New classification coverage:

- REAL classification is explicit and auditable
- demo seed records receive `demo`
- classification is not inferred from `DEMO-*` / `PL-*` asset names
- viewer and cross-organization users cannot change classification
- dashboard counts are backend-derived
- latest telemetry exposes classification, verified source and SIMULATED
  provenance separately
- no automatic measurement row is created by telemetry
- existing telemetry, RBAC and analytics tests remain green

### Frontend

```text
9 passed
production build passed
```

### Browser E2E

```text
4/4 Mission 018.1 checks passed
0 console/page errors
```

Covered:

- PL-APESS-0001 REAL badge/health
- no demo banner on real Passport
- REAL_BMS / SOC / SOH N/A / Gateway / five temperatures
- sidebar context “Production + demo”
- manual history empty-state
- DEMO Passport retains warning/banner and mock health
- Mission 018 Analytics preserved
- 390px mobile layout with 0 horizontal overflow
- Mission 018 regression E2E: **12/12 passed**

Android/Capacitor:

- `npx cap sync android` completed successfully after the final frontend build.
- A Gradle APK build was not run because Java is unavailable in the agent
  environment; no Android binary was produced or deployed.
- Physical Android WebView acceptance remains pending.

Evidence:

- `ProjectManagement/Mission018_1/e2e-result.json`
- `ProjectManagement/Mission018_1/screenshots/` full local evidence
- Committed review copies:
  - `docs/mission018_1/real-passport-health.png`
  - `docs/mission018_1/demo-passport.png`
  - `docs/mission018_1/real-analytics.png`
  - `docs/mission018_1/real-passport-mobile.png`

## 9. Production safety

Verified unchanged:

- Production Alembic: `e5f6a7b8c9d0` (classification migration not applied)
- Production API/frontend: `rc-ac3e599`
- Consumer: `pinlab-prod-mqtt-ingest` healthy
- Cloudflare/ESP32/Gateway assignment: untouched
- Raw telemetry retention: 7 days, untouched
- No production Battery classification modified
- No full restore, no ingestion restart, no production deployment

Local only: isolated production copy migrated to `f6a7b8c9d0e1` and inventory
backfilled for verification.

## 10. Deployment readiness checklist

1. CTO approval for migration `f6a7b8c9d0e1` and the exact classification
   inventory.
2. Fresh production PostgreSQL backup and isolated restore verification.
3. Apply additive migration and explicit backfill; verify 1 real / 15 active
   demo / 0 unclassified.
4. Build approved backend/frontend images from the final commit.
5. Preserve existing API/frontend rollback point; do not restore full DB for a
   UI-only issue.
6. Verify existing Passport, inspection, warranty, lifecycle and ownership
   functions.
7. Verify REAL_BMS health, SOH N/A, manual-history separation, sidebar mode and
   demo warnings in production.
8. Confirm producer/consumer, Cloudflare and Gateway assignment remain
   unchanged.
9. Record deployment evidence and update `Mission.md`.
