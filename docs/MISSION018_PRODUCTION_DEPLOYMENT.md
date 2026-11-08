# Mission 018-PROD — Production Dashboard Deployment

- **Status:** **PASS**
- **Deployed main commit:** `ba0135c7f0bc7900a103c0246a5751c7dd837d33`
  (`Merge pull request #2 ... mission-018.1-real-bms-classification`)
- **Production app:** https://pinlab-app.picopiece.com
- **Battery Detail:** https://pinlab-app.picopiece.com/batteries/17
- **Deployment date:** 2026-11-08/09 (UTC/local host time)
- **New images:** `pinlab-app-backend:rc-ba0135c`, `pinlab-app-frontend:rc-ba0135c`

## 1. Pre-deployment verification

- `origin/main` fetched; Mission 017 (#3), Mission 018 (#1), and Mission 018.1
  (#2) are merged.
- Main contained `backend/app/telemetry.py`, the analytics frontend and
  `f6a7b8c9d0e1_battery_classification.py`.
- Previous production images:
  - backend `pinlab-app-backend:rc-ac3e599`
    (`sha256:7114640134319f4a4ae3131abf788fdabe805b1f8f80d0290ee911d802add299`)
  - frontend `pinlab-app-frontend:rc-ac3e599`
    (`sha256:9a264471d0f3260410804be9694796352c55b001ae4b22a828b4d388544da338`)
- Previous Alembic revision: `e5f6a7b8c9d0`.
- `pinlab-prod-mqtt-ingest` healthy; `GW-000001` assigned to battery 17, slot 0.
- Fresh REAL_BMS rows existed before deployment (latest row 427,
  `GW-000001:boot25:265` at 16:59:54Z).

## 2. Backup and verification

- Backup:
  `/home/picopiece/backups/pinlab-app/mission018-prod-prerelease-20261108T170001Z/`
- Dump SHA256:
  `411883f6a7b3fbcaf00cbc423d7a10479200ea675d936cb9221c765006ba4147`
- `SHA256SUMS` verified; dump/env/compose stored with mode `600`.
- Restored into an isolated PostgreSQL 17 container:
  - revision `e5f6a7b8c9d0`
  - 10 users, 3 organizations, 17 batteries, 14 inspections, 45 manual
    measurements, 2 attachments, 427 telemetry rows, 1 gateway, 1 assignment
  - `GW-000001`, slot 0, battery 17, `PL-APESS-0001` present
- Restore/integrity check: **PASS**.

## 3. Migration

Applied only the reviewed additive migration:

```text
e5f6a7b8c9d0 -> f6a7b8c9d0e1
```

Result:

- `classification` column added.
- 1 real, 16 demo, 0 unclassified.
- `PL-APESS-0001` / battery DB ID 17: `real`.
- Existing users, organizations, batteries, inspections, measurements,
  attachments, gateway and assignment counts unchanged.
- Telemetry and Gateway assignment were not modified.
- No new/unexpected Battery Passport was discovered or classified.

## 4. Deployment

Built from exactly `origin/main` `ba0135c` and deployed with the existing
Compose workflow:

```bash
APP_IMAGE_TAG=rc-ba0135c
docker compose up -d backend frontend
```

Compose also reconciled the `db` dependency and recreated the DB container
with the same named data volume. Data integrity was verified immediately after
the restart; all Passport, organization, Gateway, assignment and business
records remained present.

The MQTT consumer logged one transient DB authentication failure during the
DB restart and recovered on retry in the same minute. The consumer restarted
zero times and persisted subsequent telemetry normally.

New image digests:

- backend: `sha256:ed363c89efb4ba21fe74bd4400ff3535ff8a9f9af8823c7345176d1e4d3d9eaa`
- frontend: `sha256:348956f3b3d71cf7d0f8c8660084421193a560f608f6f888bbbff9a7574befbe`

## 5. Live REAL_BMS verification

Post-deployment persistence (new rows after deploy cutoff
`2026-11-08T17:01:30Z`):

- row 436 — `GW-000001:boot25:275` — 17:01:33Z measured / 17:01:37Z received
- row 437 — `GW-000001:boot25:276` — 17:01:46Z / 17:01:48Z
- row 438 — `GW-000001:boot25:277` — 17:01:52Z / 17:01:57Z
- row 447 — `GW-000001:boot25:286` — 17:03:25Z / 17:03:27Z (API latest at
  verification)

All are `source=REAL_BMS`, battery 17, Gateway `GW-000001`, 16 cell voltages,
5 temperatures.

Latest API sample matched PostgreSQL row 447:

- SOC 35.42%
- pack voltage 52.531 V
- current 0.000 A
- remaining/full capacity 35.420/100.000 Ah
- SOH `NULL` -> UI `N/A`
- cell min/max/delta 3278/3281/3 mV; indices 16/5
- measured 17:03:25Z; received 17:03:27Z

API/history:

- latest: HTTP 200, ~154 ms median, ~1.2 KB
- 1h including cells: HTTP 200, ~195 ms, 351 points, 16 cells/series, 5 temps
- 24h pack-only: HTTP 200, ~154 ms, 16 points
- 7d pack-only: HTTP 200, ~170 ms, 4 points
- classification via `/batteries/17`: `real`
- dashboard counts: 1 real, 15 active demo, 0 unclassified

## 6. Web / mobile verification

Production browser E2E against `https://pinlab-app.picopiece.com`:

- Mission 018 dashboard: **12/12 PASS**, 0 console errors
- Mission 018.1 classification/health: **4/4 PASS**, 0 console errors
- Desktop: Battery Health real data, real badge, no demo banner, SOH N/A
- Analytics: Overview, all 16 cell histories, selection, delta, History
  pack/cell/temperature tabs, 1h/24h/7d
- Demo Passport: DEMO badge/banner and mock health warnings remain
- Manual history stays empty/separate for battery 17
- 390 px mobile viewport: 0 horizontal overflow
- Browser navigation: ~2.44 s in production; 24h chart visible ~611 ms;
  7d range ~432 ms
- Server idle observations: backend ~80 MB / 512 MB, frontend ~42 MB / 128 MB,
  DB ~37 MB / 512 MB, consumer ~59 MB / 62.75 GB

Screenshots and E2E JSON are committed under `docs/mission018_prod/`.

## 7. Health and regression

- App health: HTTP 200
- OpenProject login: HTTP 200
- Backend/frontend: healthy
- PostgreSQL: healthy
- `pinlab-prod-mqtt-ingest`: healthy, 0 restarts
- Production business counts after deployment: 10 users, 3 organizations,
  17 batteries, 14 inspections, 45 measurements, 2 attachments.
- Telemetry increased only through normal ongoing ingestion.
- Classification: 1 real, 16 demo, 0 unclassified.
- No authentication failure for application users; MQTT DB transient recovered.
- Existing MQTT broker, Cloudflare route, ESP32 firmware, Gateway assignment
  and 7-day telemetry retention were not changed.

## 8. Android

- Responsive production Web UI verified at Android viewport size.
- Capacitor sync had been verified on Mission 018.1.
- Native APK build could not be completed because Java/Android Gradle
  toolchain is unavailable in this environment.
- **Android native acceptance remains pending.** No APK was distributed,
  installed on customer devices, or published.

## 9. Rollback readiness

- Previous images remain locally available:
  - `pinlab-app-backend:rc-ac3e599`
  - `pinlab-app-frontend:rc-ac3e599`
- Old `.env` image tag was backed up in the pre-release backup directory.
- Rollback command:

```bash
# restore APP_IMAGE_TAG=rc-ac3e599 in the production .env
docker compose up -d backend frontend
```

- The classification migration is additive and compatible with the old image;
  do not downgrade or restore the whole DB automatically.
- If a full restore becomes necessary, it requires separate CTO approval.
- MQTT consumer, broker, Gateway assignment and telemetry retention are
  independent of the web rollback path.

## 10. Final status

Mission 018-PROD: **PASS**.

Production Web displays live REAL_BMS data for `PL-APESS-0001`, classification
is backend-authoritative, Battery Health and Analytics are integrated, and
existing MQTT/business data remain intact. Android native acceptance remains
separately pending.
