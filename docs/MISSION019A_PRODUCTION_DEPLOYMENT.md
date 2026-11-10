# Mission 019A-PROD — Production Deployment

- **Status:** **PASS**
- **Deployed source merge commit:** `c467f7742c53e3d9bfe13a3768cc3c2788a0ab57`
  (`Merge pull request #5 from PicoPiece/mission-019a-rbac-ux`)
- **PR:** https://github.com/PicoPiece/pinlab-batterylifecycleapp/pull/5 (merged)
- **Production:** https://pinlab-app.picopiece.com
- **Deployment date:** 2026-11-10 (16:37–16:40 UTC+07; 09:37–09:40 UTC)
- **Scope:** Frontend only. Backend, PostgreSQL, MQTT, Gateway, firmware,
  Cloudflare Tunnel, OpenProject and telemetry retention unchanged.
- **Application target:** Battery `PL-APESS-0001` / battery 17.

## 1. Preflight

- PR #5 was merged and independently reviewed: **PASS**, no security,
  data-integrity or functional blocker.
- Target merge commit exists and contains only the approved frontend,
  test and documentation change set; no backend or Alembic change.
- `origin/main` documentation head at deployment: `28847b9`
  (post-merge Mission/report update).
- Production before deployment:
  - backend `pinlab-app-backend:rc-933d8d6`
    (`sha256:00ed9b7f77ef2b379f6410e5be8c2f563ce7038300e9b12dbaafafd609275d85`)
  - frontend `pinlab-app-frontend:rc-933d8d6`
    (`sha256:52f4a733c69aadc49491df94dc4a612c75de690c839d5b98efc376898cc8610e`)
  - DB `postgres:17-alpine`, container
    `f395bf86c2ae24992322f1314416a2d8a8a0592ce2dc4689f4639673f9184950`
  - MQTT consumer `pinlab-prod-mqtt-ingest`, container
    `a83a28279e9ba9f605417e55075602dd22e9ba01b6dcb2205e78e647868d29fa`
- Database revision: `f6a7b8c9d0e1`; classification **1 real / 16 demo**.
- Latest preflight REAL_BMS row: `14898`, `GW-000001:boot26:13071`,
  received `2026-11-10T09:37:07Z`.
- Existing backup verified:
  `/home/picopiece/backups/pinlab-app/mission018_2-prod-preflight-20261109T001009Z/`
  - dump SHA256 `b3a902e165998faba7b542d63d28f5076e2ab7a0b1a523cc01943c5814bdae11`
  - SHA256SUMS PASS
  - `pg_restore -l` PASS (156 TOC entries)
- Disk: 85 GiB free; memory: 31 GiB available.
- No unexpected migration or backend diff in the deploy set.

## 2. Build and deployment

Built both immutable application images from the exact merge commit, then
deployed only the frontend:

```bash
git worktree add --detach /tmp/opencode/pinlab-019a-deploy \
  c467f7742c53e3d9bfe13a3768cc3c2788a0ab57
docker build -t pinlab-app-backend:rc-c467f77 backend
docker build -t pinlab-app-frontend:rc-c467f77 frontend
# .env: APP_IMAGE_TAG=rc-c467f77
docker compose up -d --no-deps frontend
```

- Only `pinlab-app-frontend-1` was recreated.
- Backend was **not** recreated or restarted.
- No database, MQTT, Mosquitto, Cloudflare or OpenProject command was run.

New images:

- backend `pinlab-app-backend:rc-c467f77`
  — `sha256:fdaf79cb3f1feb4f5641dccfda2b01e8e51fe259c67876acb75f1fd9d2d352b1`
  (built but not deployed; backend code unchanged)
- frontend `pinlab-app-frontend:rc-c467f77`
  — `sha256:e718e03c75654763bd4b1ea7ce94ae6c1fe69bcce2fcf1effa8d4c34938d2e70`
  — container `45807178966aa83317a2e505d16fdc06392cb601a8c5ec20a675b8966897d97c`

The deployed frontend bundle is `/assets/index-BabMXIFn.js`; its SHA256 matches
the image byte-for-byte:

```text
47fed4d023535778b963a078f64c57da1658d5a2c17d32560e087447be679770
```

## 3. Production verification

- Public Web App / API health: HTTP `200`.
- Production E2E:
  - Mission 019A production: **5/5 PASS**
  - Mission 018.2 regression: **5/5 PASS**
  - Mission 018.1 regression: **4/4 PASS**
  - Mission 018 analytics regression: **12/12 PASS**
  - console errors: **0**
  - mobile widths **360/390/430 px**: no horizontal overflow
- Simple View is the default in a fresh session.
- SOC, voltage, current, remaining capacity, temperature, Gateway, source and
  last-received values are rendered from backend telemetry.
- SOH is `N/A` when the BMS value is `NULL`.
- REAL_BMS classification remains correct for `PL-APESS-0001`.
- Online status, 24h SOC/voltage charts and Technical Details → Advanced
  Diagnostics work.
- Advanced preserves 16 cells, cell history, Relative Voltage and Diagnostic
  Evidence.
- Latest API sample matched PostgreSQL row `14914`:
  - `GW-000001:boot26:13087`, source `REAL_BMS`, classification `real`
  - SOC `34.22%`, pack voltage `52.439 V`, current `0.000 A`
  - remaining/full capacity `34.220/100.000 Ah`
  - 16 cells, 5 temperatures, SOH `NULL` → UI `N/A`
- Post-deployment MQTT rows were continuous across the frontend cutover:
  `14899` through `14914` at 12-second cadence; no telemetry gap attributable
  to deployment.

Screenshots and E2E evidence:

- `ProjectManagement/Mission019A_PROD/simple-desktop.png`
- `ProjectManagement/Mission019A_PROD/advanced-desktop.png`
- `ProjectManagement/Mission019A_PROD/simple-mobile-360.png`
- `ProjectManagement/Mission019A_PROD/simple-mobile-390.png`
- `ProjectManagement/Mission019A_PROD/simple-mobile-430.png`
- `ProjectManagement/Mission019A_PROD/e2e-result.json`

## 4. Infrastructure preservation

Before/after comparison:

| Component | Identifier | Result |
|---|---|---|
| PostgreSQL | `f395bf86c2ae24992322f1314416a2d8a8a0592ce2dc4689f4639673f9184950` | unchanged |
| MQTT consumer | `a83a28279e9ba9f605417e55075602dd22e9ba01b6dcb2205e78e647868d29fa` | unchanged |
| Backend | `80a2286e2250...` | unchanged, still `rc-933d8d6` |
| Mosquitto | host PID `578928` | unchanged |
| Cloudflare Tunnel | host PID `1372505` | unchanged |
| OpenProject web | `fc61e1fb4575` | healthy, unchanged |
| OpenProject worker | `f20b9b1013ef` | unchanged |
| OpenProject cron | `4cbdce0ea7f0` | unchanged |
| OpenProject DB | `ae3870a08d6d` | unchanged |
| OpenProject proxy | `2f3396f0740a` | unchanged |
| OpenProject Hocuspocus | `7fb0a1df0dae` | unchanged |
| OpenProject cache | `44480ac0db30` | unchanged |

OpenProject login/health returned HTTP `200`. No unplanned restart occurred.

## 5. Resources after deployment

- frontend: ~43 MiB / 128 MiB, 0.00% CPU
- backend: ~104 MiB / 512 MiB, 0.11% CPU
- PostgreSQL: ~154 MiB / 512 MiB, 5.04% CPU
- MQTT consumer: ~61 MiB, 0.01% CPU

## 6. Rollback

Application-only rollback, no database action:

```bash
# .env: APP_IMAGE_TAG=rc-933d8d6
docker compose up -d --no-deps frontend
```

- Prior frontend remains available as `pinlab-app-frontend:rc-933d8d6`.
- DB revision stays `f6a7b8c9d0e1`.
- Do not restore the database, downgrade schema or delete telemetry.

## 7. Android compatibility

The existing APK
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

It loads the remote production Web UI, so it receives Mission 019A without an
APK rebuild. No APK was rebuilt or distributed. Physical Android acceptance
remains pending.

## 8. Preview cleanup

After production PASS:

- temporary Mission 019A preview process was stopped;
- port `5191` is closed;
- temporary self-signed certificate and key were removed;
- no production component used the preview certificate.

## 9. Known limitations

- Physical Android acceptance remains pending.
- No BMS configuration, Gateway control, diagnostic writes or OTA.
- Production deployment remains a functional pilot; security/reliability/scale
  audits remain pending.
- The backend image `rc-c467f77` was built from the same merge commit but was
  not deployed; production backend remains `rc-933d8d6`.
