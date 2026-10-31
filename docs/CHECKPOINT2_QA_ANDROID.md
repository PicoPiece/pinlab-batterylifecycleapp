# Checkpoint 2.5 — Integrated QA and Android Internal QA APK

**Date:** 2026-10-31
**Branch:** `mission-013-checkpoint2-qa`
**Baseline:** Stage 2 `6f699915d36ae75fd8794a15fcbe1696e526c877`
**Production:** unchanged. No production migration, deployment, main merge or external APK distribution.
**Credentials:** no QA passwords or secrets are stored in this document or Git.

## 1. Integrated QA environment

A disposable isolated environment was used:

| Component | Configuration |
|---|---|
| PostgreSQL | 17.11, disposable container `pinlab-qa-pg`, local port 55432 |
| Backend | FastAPI container `pinlab-qa-api`, local port 8010 |
| Frontend | React/Vite build served through nginx container `pinlab-qa-web` |
| HTTPS QA endpoint | Cloudflare Quick Tunnel to the same-origin nginx origin |
| QA data | synthetic accounts, batteries, inspections, measurements and assignments only |

The QA endpoint is **ephemeral** and must be re-created for a later test session. It is not production and has no uptime guarantee.

## 2. Migration results

Commands were run against the isolated QA PostgreSQL database only.

- Full chain applied: `<base> → 5e56d69bbfb0 → a1b2c3d4e5f6 → b7f3a1c9d2e4 → c9d8e7f6a5b4`.
- Current head: `c9d8e7f6a5b4`.
- Verified tables: `organizations`, `organization_memberships`, `battery_assignments`, `security_audit_events`, plus existing battery/inspection/auth tables.
- `PinLab Internal` organization exists from P0-A.
- Super Admin was bootstrapped with the documented command:
  `python -m app.bootstrap --email qa-super@example.com`
- No production or pre-existing QA application database was changed.

## 3. Synthetic accounts

Passwords are delivered separately through the QA operator's secure channel; they are not included here.

| Account | Role/scope |
|---|---|
| `qa-super@example.com` | PinLab Super Admin |
| `qa-manager@example.com` | PinLab Manager, all organizations |
| `qa-pinlab-tech@example.com` | PinLab Technician; assigned PinLab asset |
| `qa-a-admin@example.com` | Agency A Admin |
| `qa-a-tech@example.com` | Agency A Technician; assigned QA-A-001 |
| `qa-b-admin@example.com` | Agency B Admin |
| `qa-b-tech@example.com` | Agency B Technician; assigned QA-B-001 |
| `qa-viewer@example.com` | Viewer, Agency A read-only |
| `qa-disabled@example.com` | Disabled account |
| `qa-no-membership@example.com` | Authenticated but no membership |

Synthetic assets: `QA-PL-001`, `QA-A-001`, `QA-A-002`, `QA-B-001`, `QA-B-002`.
Assignments exist for PinLab, Agency A and Agency B. A-002 and B-002 remain intentionally unassigned.

## 4. Checkpoint A evidence

### Backend/API checks

- **67/67 API checks PASS** against the PostgreSQL QA backend.
- Asset visibility:
  - Super Admin: all 5 assets.
  - PinLab Manager: all 5.
  - Agency A Admin: only QA-A-001/002.
  - Agency B Admin: only QA-B-001/002.
  - Agency A Technician: only assigned QA-A-001.
  - Agency B Technician: only assigned QA-B-001.
  - Viewer: Agency A assets, read-only.
  - PinLab Technician: only assigned QA-PL-001.
- Agency A cannot read/update B battery; cannot read/create B inspection; cannot list/download B attachments.
- Agency B cannot download A attachment.
- Viewer cannot create battery (403) or update it.
- Unassigned A-002 is 404 to A Technician.
- Agency Admin cannot grant a PinLab role (403) or create a B user (404).
- No-membership account: `/auth/access` empty; protected list 403.
- Disabled account cannot authenticate; an existing session is denied after deactivation.
- Assignment and ownership data are scoped; dashboard A Admin total = 2.

### Web browser smoke

Synthetic QA stack, Chromium:

- **11/11 role/browser checks PASS**:
  Super Admin access workspace, org selector, asset/assignment view, audit view, registry/passport, logout; Agency A Admin scope; Agency Technician assigned-only and hidden admin/create; Viewer read-only/hidden route; disabled login denied; no page/console errors.
- **6/6 admin workflow checks PASS**:
  internal user creation, deactivation/reactivation, password reset modal, organization user creation, assignment view, runtime errors.
- **Agency Technician inspection + evidence upload PASS** via the Web UI.
- **HTTPS same-origin tunnel Web login/access smoke PASS** with secure cookie settings.

### Regression

- Backend: **39/39 PASS** (HTTPS TestClient, `COOKIE_SECURE=true`).
- Frontend unit tests: **6/6 PASS**.
- Frontend TypeScript production build: **PASS**.

## 5. Checkpoint B — Android Internal QA APK

### Build identity

- Package: `com.pinlab.batterylifecycle`
- Version name: `0.4.0-qa`
- Version code: `5`
- Release channel: `internal-qa`
- Signing: Android debug certificate (not a production release key)
- Build: `assembleDebug`
- Remote QA URL: the ephemeral HTTPS tunnel origin in the release manifest
- No API secrets, passwords or signing keys are embedded in the APK.

The APK uses Capacitor `server.url` to load the QA origin. This preserves the existing HttpOnly cookie, SameSite and Origin/CSRF behavior. The QA backend was verified with `COOKIE_SECURE=true`.

### Bundled-frontend investigation

Bundling the React assets would make the WebView origin different from the HTTPS API origin. That would require a deliberate cookie/CSRF/Origin model change and a CORS policy for the native origin. No evidence supported making that change safely within this checkpoint, so the QA build retains the remote same-origin `server.url`. This is a documented compatibility boundary, not a production decision.

### Android QA result

Tested on the local Android emulator (`sdk_gphone64_x86_64`, Android 16 / API 36) with the QA HTTPS tunnel. **No physical Android device was available; physical-device PASS is not claimed.**

- Fresh install/update: PASS.
- Remote QA login: PASS.
- Agency A Admin dashboard and asset list: PASS; only QA-A-001 and QA-A-002 shown, no B assets.
- Logout: PASS.
- Session persistence after force-stop/restart: PASS.
- ONLINE → OFFLINE → ONLINE indicator during network loss/recovery: PASS.
- Debug-signed APK install: PASS.
- Basic role scoping on Android: PASS for Agency A Admin (same backend scope as Web).
- Physical device checklist: pending.

### Minimal offline/error UX

- Added clear ONLINE/OFFLINE pill.
- Health check polling updates connectivity.
- Dashboard last-successful-refresh timestamp is shown in the sidebar.
- Existing forms already surface API errors and do not claim server persistence when an API call fails.
- No offline cache/synchronization was added.
- Inspection drafts remain `sessionStorage` only; they are not durable across process death and are not a substitute for server persistence.
- Because the QA APK uses remote `server.url`, the app shell itself cannot open from a cold start with no network. This is a known limitation of the selected QA packaging.

## 6. Release artifact and manifest

The release manifest is generated alongside the APK with:

- package, versionName/versionCode, build type, channel
- Git commit
- QA endpoint
- artifact SHA256 and size
- signing type
- known limitations and acceptance checklist

## 7. Known limitations

1. No physical Android device validation; emulator only.
2. APK is debug-signed; no production release keystore or signed release artifact.
3. QA tunnel is ephemeral and has no uptime guarantee.
4. Remote `server.url` means no cold-start offline shell; offline indicator applies after the shell has loaded.
5. No offline cache, background sync or durable inspection drafts.
6. No per-session revocation; existing cookie/token-version behavior only.
7. PinLab Manager read access is broad; writes are audited, reads are not.
8. No production migration/deployment and no external distribution.
9. Reports/exports remain absent; warranty/customer APIs remain preview-only.

## 8. Account provisioning instructions

1. Use the approved QA Super Admin account through the secure QA channel.
2. Open **Access & roles** and create an internal account or organization-scoped account with a temporary password.
3. Assign the required organization role.
4. For technicians, assign the specific battery in **Assets & assignments**.
5. Hand the temporary password to the tester through a secure channel; no password is committed or included in this report.
6. For a new internal Super Admin, run `python -m app.bootstrap --email <approved-email>` in the QA environment.

## 9. Physical-device acceptance checklist (pending)

- [ ] Install the QA APK from the supplied manifest path.
- [ ] Confirm package `com.pinlab.batterylifecycle`, version `0.4.0-qa`, versionCode 5.
- [ ] Confirm HTTPS QA endpoint loads and certificate is valid.
- [ ] Login as Agency A Admin; confirm only Agency A assets.
- [ ] Confirm no Agency B asset appears in list/search/detail.
- [ ] Login as Agency A Technician; confirm only assigned QA-A-001.
- [ ] Login as Viewer; confirm read-only and no edit/admin actions.
- [ ] Create an inspection and upload evidence as an assigned technician.
- [ ] Attempt to open an unassigned/battery from another agency; confirm denial.
- [ ] Logout, force-stop, relaunch; confirm logout/session behavior.
- [ ] Disable network; confirm OFFLINE and last-refresh timestamp; re-enable and confirm recovery.
- [ ] Record device model, Android version, APK SHA256, tester and timestamp.
