# Mission 018.2-PROD — Battery Diagnostics UX Deployment

- **Status:** **PASS**
- **Deployed source commit:** `933d8d63814d4c1eb690ba6c48ed7a6b03769b87`
  (`Merge pull request #4 from PicoPiece/mission-018.2-cell-chart-ux`)
- **Production app:** https://pinlab-app.picopiece.com
- **Battery Detail:** https://pinlab-app.picopiece.com/batteries/17?tab=analytics
- **Deployment date:** 2026-11-09 (07:10–07:16 UTC+07; 00:10–00:16 UTC)
- **New images:** `pinlab-app-backend:rc-933d8d6`,
  `pinlab-app-frontend:rc-933d8d6`
- **Database:** unchanged at Alembic revision `f6a7b8c9d0e1`; no migration applied
- **Evidence:** `docs/mission018_2_prod/`, `ProjectManagement/Mission018_2/after/`,
  `ProjectManagement/Mission018/`, `ProjectManagement/Mission018_1/`

## 1. Preflight

- `origin/main` exactly matched approved commit `933d8d6`.
- Production before deployment:
  - backend `pinlab-app-backend:rc-ba0135c`
    (`sha256:ed363c89efb4ba21fe74bd4400ff3535ff8a9f9af8823c7345176d1e4d3d9eaa`)
  - frontend `pinlab-app-frontend:rc-ba0135c`
    (`sha256:348956f3b3d71cf7d0f8c8660084421193a560f608f6f888bbbff9a7574befbe`)
  - DB `postgres:17-alpine`, container `f395bf86c2ae`
  - MQTT consumer `pinlab-app-mqtt-consumer:rc-mqtt-2f068da`,
    container `a83a28279e9b`, healthy, restart count `0`
- DB revision `f6a7b8c9d0e1`; classification **1 real / 16 demo / 0 unclassified**;
  `PL-APESS-0001` is battery 17 and `real`.
- REAL_BMS telemetry was current at deployment start: 2,855 rows, latest
  `2026-11-09 00:09:56Z`.
- No automatic deployment workflow exists; merging PR #4 did not trigger a
  deployment.
- Compose service set was unchanged (`backend`, `frontend`, `db`).

## 2. Backup and restore verification

- Preflight backup:
  `/home/picopiece/backups/pinlab-app/mission018_2-prod-preflight-20261109T001009Z/`
- Dump SHA256:
  `b3a902e165998faba7b542d63d28f5076e2ab7a0b1a523cc01943c5814bdae11`
- Dump, environment and Compose backups are mode `600`; `SHA256SUMS` verified.
- Restored into an isolated PostgreSQL 17 container:
  - revision `f6a7b8c9d0e1`
  - **1 real / 16 demo**
  - 10 users, 3 organizations, 17 batteries, 14 inspections, 45 manual
    measurements, 2 attachments, 2,856 telemetry rows, 1 gateway, 1 assignment
- Restore/integrity check: **PASS**.
- The production database was not restored, modified or recreated during this
  deployment.

## 3. Build and deployment

Built from detached `origin/main` `933d8d6` in an isolated worktree:

```bash
git worktree add --detach /tmp/opencode/pinlab-0182prod origin/main
docker build -t pinlab-app-backend:rc-933d8d6 backend
docker build -t pinlab-app-frontend:rc-933d8d6 frontend
```

Deployed only the application services:

```bash
# .env: APP_IMAGE_TAG=rc-933d8d6 (prior .env backed up first)
docker compose up -d --no-deps backend frontend
```

Compose recreated only `backend` and `frontend`. `--no-deps` prevented the
`db` dependency from being recreated. No command restarted or replaced
PostgreSQL, Mosquitto, the MQTT consumer, Cloudflare Tunnel or OpenProject.

Post-deployment images:

- backend `pinlab-app-backend:rc-933d8d6`
  — image `sha256:00ed9b7f77ef2b379f6410e5be8c2f563ce7038300e9b12dbaafafd609275d85`
  — container `80a2286e2250`
- frontend `pinlab-app-frontend:rc-933d8d6`
  — image `sha256:52f4a733c69aadc49491df94dc4a612c75de690c839d5b98efc376898cc8610e`
  — container `db09b695a4e4`

Infrastructure continuity:

- PostgreSQL container **unchanged**: `f395bf86c2ae24992322f1314416a2d8a8a0592ce2dc4689f4639673f9184950`
- MQTT consumer **unchanged**: `a83a28279e9ba9f605417e55075602dd22e9ba01b6dcb2205e78e647868d29fa`,
  restart count `0`
- Alembic revision **unchanged**: `f6a7b8c9d0e1`

## 4. Production verification

### Web and API

- Public HTTPS frontend: HTTP `200`; new bundle `/assets/index-Ci7StuDi.js`.
- Fresh browser contexts and hard navigation served the new diagnostics UI.
- Backend health: HTTP `200`; frontend healthy.
- PinLab App and OpenProject both returned HTTP `200`.
- Production E2E:
  - Mission 018.2 cell-chart UX: **5/5 PASS**, 0 console errors
  - Mission 018 regression: **12/12 PASS**, 0 console errors
  - Mission 018.1 classification regression: **4/4 PASS**, 0 console errors
- Desktops and mobile widths **360/390/430 px** passed with zero horizontal
  overflow; mobile screenshots are in `docs/mission018_2_prod/`.

### Live REAL_BMS and cell representation

- `PL-APESS-0001` / battery 17 remains classification `real`.
- Post-deployment MQTT persistence continued without consumer restart:
  - row `2862` — `GW-000001:boot26:1035` — measured `00:11:01Z`,
    received `00:11:06Z`
  - row `2863` — `GW-000001:boot26:1036` — measured `00:11:13Z`,
    received `00:11:16Z`
  - latest at final verification: row `2888` —
    `GW-000001:boot26:1061`, measured `00:15:22Z`, received `00:15:26Z`
- Latest API sample matched PostgreSQL row `2888`:
  - source `REAL_BMS`, classification `real`
  - SOC `35.21%`
  - pack voltage `52.521 V`
  - current `0.000 A`
  - remaining/full capacity `35.210/100.000 Ah`
  - SOH `NULL` → UI `N/A`
  - 16 cell voltages, 5 temperatures
- All **16 cell series** are returned and rendered. The separate cell-delta
  chart makes **17 mounted line components** in the Cell tab.
- Current cell groups: `3278 mV ×3`, `3279 mV ×2`, `3280 mV ×9`,
  `3281 mV ×2`. The overlap explanation remains visible; overlapping values
  are legitimate data, not missing series.
- Selection/highlighting keeps all 16 series; synchronized tooltips show every
  visible cell and explain duplicate values.
- Relative Voltage mode displays deltas while preserving actual cell voltage
  values in tooltips. Absolute mode is unchanged.

### Diagnostic Evidence API

Authenticated production checks returned HTTP `200` for `1h`, `24h` and `7d`:

| Range | Median latency | Samples / expected | Completeness | Basis |
|---|---:|---:|---:|---|
| `1h` | ~195 ms | 355 / 361 | 98.3% | active Gateway assignment |
| `24h` | ~300 ms | 2,865 / 3,027 | 94.6% | active Gateway assignment |
| `7d` | ~343 ms | 2,865 / 3,027 | 94.6% | active Gateway assignment |

The evidence response includes `completeness_basis=active_gateway_assignment_window`,
`monitoring_from_at`/`monitoring_to_at`, 16 cell statistics, 5 temperature
statistics and measurement gaps.

### RBAC

- No production account, membership or organization was created or modified.
- Unauthenticated latest/evidence requests return HTTP `401`.
- The backend suite (**64/64 PASS**) covers authenticated cross-organization
  denial and battery-level authorization. Production battery 17 remains
  restricted to its organization.

## 5. Performance

Measured from the host against production; no high-load benchmark was run.

- Latest telemetry: HTTP `200`, ~156 ms median, ~1.2 KB
- Evidence `1h`: ~195 ms; `24h`: ~300 ms; `7d`: ~343 ms
- Production browser: dashboard navigation ~2.4 s; 24h chart visible ~0.9 s;
  7d chart ~1.0 s
- Container memory/CPU snapshot:
  - backend ~83 MiB / 0.1% CPU
  - frontend ~42 MiB / 3.7% CPU
  - PostgreSQL ~44 MiB / 0.02% CPU
  - MQTT consumer ~59 MiB / 0.01% CPU

## 6. Android compatibility

- `frontend/capacitor.config.ts` supports an optional
  `CAPACITOR_SERVER_URL`; when absent it bundles local assets.
- The current distributed artifact
  `artifacts/android/PinLab-BatteryLifecycle-0.4.0-internal-test-debug.apk`
  contains:

  ```json
  {
    "server": {
      "url": "https://pinlab-app.picopiece.com",
      "cleartext": false
    }
  }
  ```

- **Verdict:** the existing APK loads the remote production Web UI, so it
  receives the Mission 018.2 frontend without an APK rebuild. No APK was
  rebuilt or distributed.
- Physical Xiaomi/Android acceptance remains pending; responsive browser tests
  are not claimed as native PASS.

## 7. Rollback

Application-only rollback is prepared; database rollback is intentionally not
part of it.

```bash
# restore prior application tag
sed -i 's/^APP_IMAGE_TAG=.*/APP_IMAGE_TAG=rc-ba0135c/' .env
docker compose up -d --no-deps backend frontend
```

- Prior backend: `pinlab-app-backend:rc-ba0135c`
- Prior frontend: `pinlab-app-frontend:rc-ba0135c`
- Backup: `/home/picopiece/backups/pinlab-app/mission018_2-prod-preflight-20261109T001009Z/`
- Do **not** restore the database, downgrade schema, delete telemetry or restart
  PostgreSQL/MQTT as part of application rollback.

## 8. Acceptance

**PASS** — Production serves the Mission 018.2 diagnostics UI, all 16 cell
series are represented, real REAL_BMS telemetry remains current, and the
PostgreSQL, MQTT, Gateway and Cloudflare infrastructure was not interrupted.
