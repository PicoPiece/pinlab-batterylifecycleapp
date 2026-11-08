# PinLab Mission Register — Battery Lifecycle App

**Last updated:** 2026-11-08 (+07)
**Repository:** `PicoPiece/pinlab-batterylifecycleapp`
**Default remote branch for this work:** `mission-013-checkpoint2-qa` (not merged to `main`)

> **Mission tracking rule — effective 2026-11-08**
>
> Every future mission affecting this project must update this file with:
> mission number, scope, branch/commit, status, tests/evidence, deployment state,
> blockers and next step. Commit and push the update to the matching project
> repository. Cross-project missions must update the Mission file in each
> affected repository. Never include passwords, tokens, private keys, `.env`
> contents or customer data.
>
> Do not mark a mission ACCEPTED without evidence. Keep IMPLEMENTED, TESTED,
> DEPLOYED and ACCEPTED as separate states.

## Current project state

| Item | Current value |
|---|---|
| Production URL | `https://pinlab-app.picopiece.com` |
| Production Web/backend image | `rc-ac3e599` |
| Production Web/backend source commit | `ac3e5998df92f47abb94d467ddcbf6b8949d1d17` |
| Production database | `pinlab-app` / PostgreSQL 17; Alembic `c9d8e7f6a5b4` |
| Production release stage | Founder Preview / internal testing only |
| Latest Android APK | `artifacts/android/PinLab-BatteryLifecycle-0.4.0-internal-test-debug.apk` |
| APK version | `0.4.0-internal-test` / versionCode 6 |
| APK SHA256 | `765685d856274eee350619732b75dc6a89a4452dd488369db9f583b89deb8c8d` |
| Physical device | Xiaomi 14 Ultra test pending |
| OpenProject | Separate system; do not change from app missions unless explicitly authorized |

## Mission inventory

### Mission 001 — PinLab OpenProject Infrastructure

- **Project:** PinLab Internal IT / OpenProject
- **Scope:** Deploy OpenProject CE, PostgreSQL, Caddy, Cloudflare Tunnel and HTTPS.
- **Status:** **IMPLEMENTED / VERIFIED** on OpenProject host.
- **Evidence:** `ProjectManagement/OpenProject-Deployment-Report.md`, `DEPLOYMENT_BASELINE.md`.
- **Notes:** OpenProject 17.9.3-slim, PostgreSQL 17, HTTPS `pinlab-pm.picopiece.com`.

### Mission 002 — Infrastructure Repository Baseline

- **Project:** `pinlab-infrastructure`
- **Scope:** Sanitized compose overlay, architecture, operations, backup/restore docs.
- **Status:** **IMPLEMENTED / COMMITTED**.
- **Evidence:** `pinlab-infrastructure` commit `20457c8`.
- **Notes:** No secrets committed.

### Mission 003 — OpenProject Portfolio Bootstrap

- **Project:** OpenProject / Project Management
- **Scope:** Create initial PinLab project groups and work packages.
- **Status:** **COMPLETED** according to existing project history.
- **Evidence:** OpenProject projects 3–8 and WPs #38–#70; `OPENPROJECT_WORK_PACKAGES.md`.
- **Notes:** Some WP history and time-entry attribution still require CTO review.

### Mission 004 — CTO Contribution & Time Reconciliation

- **Project:** Project Management / OpenProject
- **Scope:** Reconstruct CTO infrastructure contribution and time entries.
- **Status:** **BASELINE RECORDED; ATTRIBUTION PARTIALLY PENDING**.
- **Evidence:** `Mission004-CTO/CTO_WORK_HISTORY_SUMMARY.md`; 8 OpenProject time entries / 32h on OpenProject infrastructure.
- **Notes:** App-specific human effort remains **Historical contribution — effort not verified**. No retroactive app hours were invented.

### Mission 005 — Battery Lifecycle MVP

- **Project:** BatteryLifecycleApp
- **Scope:** Authentication, RBAC, battery registry, Passport, measurements, inspections, attachments, lifecycle, dashboard, i18n/responsive UI.
- **Status:** **IMPLEMENTED / TESTED / DEPLOYED** as Internal MVP; formal internal acceptance was not completed.
- **Evidence:** `MISSION005_SUMMARY.md`; backend tests, frontend tests, E2E and production smoke; initial commit `bb052af`; later production baseline `244a969`.
- **Notes:** Real BMS, external agency access and advanced security remain future work.

### Mission 006 — BMS / Gateway Feasibility

- **Project:** Battery & Energy Engineering / future IoT
- **Scope:** Research device integration, monitoring and gateway feasibility.
- **Status:** **RESEARCH / PLAN ONLY — NOT IMPLEMENTED**.
- **Evidence:** references in `MVP_COMPLETION_REPORT.md` and design docs; no hardware, ingestion, gateway or real BMS code.
- **Notes:** Hardware availability was not verified. No BLE/Gateway/BMS work started.

### Mission 007 — Unknown / No Evidence

- **Status:** **NOT FOUND IN AVAILABLE PROJECT RECORDS**.
- **Notes:** Do not invent scope or completion. This gap should be resolved by CTO if Mission 007 existed.

### Mission 008A — Agency Preview Design Gate

- **Project:** BatteryLifecycleApp
- **Scope:** Audit current UI and produce agency-preview design specification/mockups.
- **Status:** **IMPLEMENTED / DESIGNED**; design gate completed.
- **Evidence:** `ProjectManagement/Mission008A-Design/`.
- **Notes:** Design only; no production behavior change.

### Mission 008B — Agency Preview Implementation & QA

- **Project:** BatteryLifecycleApp
- **Scope:** Agency-preview UI, read models, responsive/VI-EN design, QA.
- **Status:** **IMPLEMENTED / TESTED IN QA**; commit `797fb01`, follow-up `0b6382a`.
- **Evidence:** `Mission008B-QA/`; 18/18 E2E, frontend/backend tests, screenshots.
- **Notes:** Not the same as tenant authorization; object-level access was still missing at that point.

### Mission 008C — Release Gate

- **Project:** BatteryLifecycleApp
- **Scope:** Read-only production readiness review.
- **Status:** **GATE COMPLETED — NO-GO at that point**.
- **Evidence:** `Mission008C-ReleaseGate/RELEASE_GATE_REPORT.md`.
- **Notes:** Identified secure-cookie/config/backup/authorization gaps; no production changes.

### Mission 008D — Release Preparation

- **Project:** BatteryLifecycleApp
- **Scope:** Fix security/config issues, prepare RC images, deployment and backup/restore evidence.
- **Status:** **IMPLEMENTED / READY FOR CTO APPROVAL**; branch `mission-008b-agency-preview`, commit `0b6382a`; deployment was not executed in that mission.
- **Evidence:** `Mission008D-ReleasePrep/`; backend 30 tests, frontend 6 tests, E2E 18/18, backup/restore PASS.
- **Notes:** No migration in 008B/008D.

### Mission 008E — Password Management & Forced Login

- **Project:** BatteryLifecycleApp
- **Scope:** Self-service password change, forced first-login change, admin password reset, token-version session revocation.
- **Status:** **IMPLEMENTED / TESTED / DEPLOYED**; commit `244a969`.
- **Evidence:** password E2E, production image `rc-244a969`, `MISSION008D`/MVP closure docs.
- **Notes:** No per-session revocation beyond token-version behavior.

### Mission 009 — Android Capacitor POC v0.1

- **Project:** BatteryLifecycleApp / Android
- **Scope:** Capacitor shell around React Web App, QA auth, APK build and emulator QA.
- **Status:** **IMPLEMENTED / TESTED ON EMULATOR**; commit `cc40c1e`; APK `0.1.0`.
- **Evidence:** `docs/android-poc.md`, `artifacts/android/PinLab-BatteryLifecycle-0.1.0-debug.apk`.
- **Notes:** Debug POC; no physical-device acceptance.

### Mission 010 — Android Live Beta v0.2

- **Project:** BatteryLifecycleApp / Android
- **Scope:** Same-origin HTTPS production wrapper, login/read/write validation.
- **Status:** **IMPLEMENTED / TESTED ON EMULATOR**; commit `b42f2d4`; APK `0.2.0`.
- **Evidence:** `docs/android-poc.md`, APK artifacts.
- **Notes:** Physical-device and production authenticated write tests remained blocked/pending.

### Mission 011 — Mobile UI Polish v0.3

- **Project:** BatteryLifecycleApp / Android + Web
- **Scope:** Field-service mobile navigation and responsive UI improvements.
- **Status:** **IMPLEMENTED / TESTED / DEPLOYED (frontend)**; commit `198f2ea`; production frontend image `rc-198f2ea`.
- **Evidence:** mobile screenshots, APK `0.3.0`, `docs/RELEASE_READINESS_GAPS.md`.
- **Notes:** Physical-device v0.3 acceptance was not completed.

### Mission 012 — Organization Tenancy Schema (P0-A)

- **Project:** BatteryLifecycleApp
- **Scope:** Add `organizations`, `organization_memberships`, `batteries.organization_id`, `battery_assignments`; migration rehearsal and demo ownership mapping.
- **Status:** **IMPLEMENTED / TESTED**; branch `mission-012-agency-p0a`, commit `86b2c08`; production deployment occurred later in Mission 013.
- **Evidence:** `docs/P0A_ORGANIZATION_MIGRATION.md`; SQLite and PostgreSQL 17 migration tests.
- **Notes:** No endpoint authorization in P0-A.

### Mission 013 — RBAC, Web Access Control, QA, Production & Android

- **Project:** BatteryLifecycleApp
- **Scope:** P0-B backend authorization, organization-scoped roles, Web Access & Roles UI, battery assignments, QA, production migration, production smoke, Android internal-test APK.
- **Status:** **IMPLEMENTED / TESTED / DEPLOYED / PHYSICAL ACCEPTANCE PENDING**.
- **Commits:**
  - P0-B backend security: `dd446b6`
  - Web Access Control: `6f69991`
  - Integrated QA: `ac3e599`
  - Android build metadata: `dfe56a5`
- **Production deployment:** 2026-11-01; image tag `rc-ac3e599`; Alembic head `c9d8e7f6a5b4`.
- **Evidence:**
  - `docs/P0B_SECURITY_CHECKPOINT.md`
  - `docs/STAGE2_WEB_ACCESS_CONTROL.md`
  - `docs/CHECKPOINT2_QA_ANDROID.md`
  - `ProjectManagement/docs/MISSION013_PRODUCTION_DEPLOYMENT.md`
  - 39/39 backend tests, 6/6 frontend tests, production API role checks 35/35, Web smoke PASS, Android emulator PASS.
- **Production data policy:** normal migration, not rebuild; original 13 batteries, 12 inspections and 45 measurements retained; no customer records found.
- **Security/role state:** CTO admin is `pinlab_super_admin`; existing Chương/Phúc/Phong accounts are preserved but unmapped pending CTO approval; TEST accounts exist clearly labelled TEST.
- **Known blockers:** physical Xiaomi 14 Ultra test pending; debug signing; TEST accounts require password reset; no release keystore.

### Mission 014 — OpenProject Portfolio & Contribution Sync

- **Project:** Project Management / OpenProject
- **Scope:** Reconcile roadmap, delivered software, gateway projects, milestones and contribution evidence.
- **Status:** **BLOCKED BEFORE WRITE**.
- **Evidence:** `ProjectManagement/docs/OPENPROJECT_PORTFOLIO_SYNC_2026-10-31.md` and plan.
- **Blocker:** approved API principal had only Member/ProjectAssistant roles; `POST /api/v3/projects` returned **403 MissingPermission**. No project/WP/time-entry writes were performed.
- **Next step:** CTO provides an approved API token with project/work-package permissions; then apply the prepared inventory/change plan idempotently.

### Mission 015 — Mission Register & Tracking Policy

- **Project:** BatteryLifecycleApp
- **Scope:** Create this `Mission.md`, record all known missions and establish the future update/commit/push rule.
- **Status:** **IMPLEMENTED; COMMITTED/PUSHED** as part of this mission.
- **Evidence:** this file and the associated Git commit.
- **Rule:** future missions update this file in the project they affect, then commit and push.

## Cross-project roadmap status

| Milestone | Status | Evidence / next deliverable |
|---|---|---|
| M1 — Internal Web/Android Release | **In progress / QA-ready** | RBAC and Web deployed; Android APK and emulator tests pass; physical Xiaomi acceptance pending |
| M2 — Real BMS & Gateway PoC | **Not started** | Hardware/interface availability unverified; Mission 006 research only |
| M3 — Controlled Agency Pilot | **Not started** | Requires tenant-isolation acceptance, CTO approval, account mapping and external access policy |
| M4 — Battery Health & Maintenance Lifecycle | **Not started** | Requires M2 telemetry and warning/issue workflow |

## Current known limitations

1. Physical Android device acceptance pending.
2. APK is debug-signed; no release keystore.
3. Existing non-CTO production accounts are unmapped and have no app access.
4. TEST accounts are labelled TEST and require password reset/change.
5. Production monitoring/alerting and off-host backup automation are incomplete.
6. No real BMS, BLE, gateway, telemetry or chart implementation.
7. Mission 007 has no evidence in available records.
8. OpenProject portfolio sync is blocked on API permission.
9. No main merge/push without separate approval.

## Evidence index

- App docs: `docs/P0A_ORGANIZATION_MIGRATION.md`, `docs/P0B_SECURITY_CHECKPOINT.md`,
  `docs/STAGE2_WEB_ACCESS_CONTROL.md`, `docs/CHECKPOINT2_QA_ANDROID.md`,
  `docs/RELEASE_READINESS_GAPS.md`, `docs/ROLE_PERMISSION_MATRIX.md`.
- Project management: `ProjectManagement/MVP-Closure/`,
  `ProjectManagement/Mission004-CTO/`, `ProjectManagement/Mission005-QA/`,
  `ProjectManagement/Mission008A-Design/`, `Mission008B-QA/`,
  `Mission008C-ReleaseGate/`, `Mission008D-ReleasePrep/`,
  `ProjectManagement/docs/MISSION013_PRODUCTION_DEPLOYMENT.md`,
  `ProjectManagement/docs/OPENPROJECT_PORTFOLIO_SYNC_2026-10-31.md`.
- APK: `artifacts/android/PinLab-BatteryLifecycle-0.4.0-internal-test-debug.apk`
- Manifest: `artifacts/android/PinLab-BatteryLifecycle-0.4.0-internal-test-manifest.json`

### Mission 017 — Server MQTT Broker, Ingestion, PostgreSQL & Cloudflare WSS

- **Project:** BatteryLifecycleApp / IoT Gateway
- **Scope:** Read-only infrastructure audit, isolated development Mosquitto broker, MQTT contract v1, manual gateway/battery mapping, ingestion consumer, raw telemetry schema, 7-day retention job, Cloudflare WSS route verification and synthetic network tests.
- **Status:** **IMPLEMENTED / TESTED / EXTERNAL WSS VERIFIED; REAL ESP32 HARDWARE PENDING; NOT PRODUCTION-DEPLOYED**.
- **Branch:** `mission-017-server-mqtt`
- **Evidence:** `docs/MISSION017_MQTT_SERVER.md`, `deploy/mqtt-dev/CLOUDFLARE_ROUTE.md`, `backend/app/mqtt/`, `backend/alembic/versions/e5f6a7b8c9d0_mqtt_gateway_telemetry.py`, `deploy/mqtt-dev/`.
- **Latest commits:** `e91d290` pipeline, `3b2a304` route preparation, `b0c5195` external WSS evidence, `92024db` stability/ACL evidence.

#### Report

- Development Mosquitto broker: authenticated, anonymous disabled, per-device ACL, WebSocket listener, QoS 1, connection/packet limits and bounded logs.
- MQTT contract v1 and simulated sample created; ingestion validates schema, gateway identity, organization mapping, historical slot assignment and message deduplication.
- Dev PostgreSQL migration `e5f6a7b8c9d0` adds `gateways`, `gateway_battery_assignments`, `telemetry_samples`; no production migration.
- Retention dry-run/apply deletes only `telemetry_samples` older than 7 days; Passport/business history retained.
- Backend tests: **44/44 PASS**.
- Exact identity verified: Gateway `GW-000001`, username/client ID `gw-000001`, slot `0`, battery `DEMO-MQTT-001`, topic `pinlab/v1/gateways/GW-000001/telemetry`.
- External WSS `wss://mqtt-pinlab.picopiece.com/mqtt` verified with public DNS/TLS, WebSocket upgrade, authenticated QoS 1 publish, QA PostgreSQL persistence, ACL denial and broker-reconnect stability.
- QA proof: `verify-wss-1794124282` sample id 9; stability samples `stability-1794124309-0/317-1/325-2`; unauthorized topic returned MQTT v5 `Not authorized`.
- Existing `pinlab-app` health and `pinlab-pm` login remained **200**.
- No public 1883/8883; no production database writes; no real hardware PASS claimed.
- **Credential status:** development device credential `gw-000001` rotated 2026-11-08; protected local handoff file mode 600; no secret committed or logged. **Next:** ESP32-S3/APESS/PACE hardware integration and physical validation using the secure credential handoff.
