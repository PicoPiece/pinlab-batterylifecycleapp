# AGENCY ACCESS AUDIT — PinLab Battery Lifecycle App

**Mode:** Read-only audit. No source, schema, database, deployment or production-data changes.  
**Audit date:** 2026-10-31  
**Repository:** `BatteryLifecycleApp`  
**Commit reviewed:** `198f2ea` (`mission-011-mobile-ui-polish`)  
**Current production frontend image:** `pinlab-app-frontend:rc-198f2ea`  
**Excluded:** BLE, offline-first, real BMS ingestion, iOS implementation.

## 1. Executive assessment

| Area | Status | Conclusion |
|---|---|---|
| Authentication | **IMPLEMENTED** | Argon2 password hashing, JWT in HttpOnly/Secure/SameSite=Lax cookie, active-user and token-version checks. |
| Role checks | **PARTIAL** | Three global roles exist: `admin`, `technician`, `viewer`. Role dependencies are enforced by FastAPI. |
| Tenant/agency isolation | **MISSING** | No organization/agency model, membership, asset assignment or tenant filter. |
| Object-level authorization | **MISSING** | Any authenticated user can read any non-deleted battery and its nested data by ID. |
| Attachment authorization | **PARTIAL / HIGH RISK** | Upload type/size checks exist; list/download/delete have no battery/inspection ownership check. |
| User administration | **PARTIAL** | Admin-only, but global admin can create/reset/update any user and assign any role. |
| Auditability | **PARTIAL** | Battery lifecycle events record actor; user/role and attachment changes are not audited. |
| Android release readiness | **PARTIAL** | Capacitor config/versioning exist; APK is debug-signed and no release manifest/tag exists. |
| iOS | **NOT VERIFIED** | No iOS project or build evidence. |
| Automated regression | **PARTIAL** | Existing backend/frontend tests pass under a correct test env; no tenant/IDOR tests exist. |

**Overall:** Internal closed testing can be considered only with strict controls. **Controlled Agency Pilot is NO-GO** until tenant isolation and object authorization are implemented and tested.

## 2. Architecture and current model

- Frontend: React/Vite, routed SPA; Android is a Capacitor same-origin wrapper (`server.url`).
- Backend: FastAPI + SQLAlchemy.
- Database: PostgreSQL; test suite uses temporary SQLite.
- Auth: login sets a JWT cookie; API also accepts Bearer JWT (`backend/app/deps.py:18-38`).
- Current roles: `admin`, `technician`, `viewer` (`backend/app/models.py:21-25`).
- Current user model has no organization/tenant field (`backend/app/models.py:88-101`).
- Battery has creator/updater metadata, but no owner organization or assignment ACL (`backend/app/models.py:108-152`).
- Inspection, measurement, lifecycle and attachment rows are linked to battery IDs only; they have no tenant/ACL columns (`backend/app/models.py:155-245`).

## 3. Verified authorization findings

| # | Finding | Status | Evidence | Risk / impact |
|---:|---|---|---|---|
| 1 | No organization/agency table or membership | **MISSING** | `backend/app/models.py:88-101` | Cannot scope data or delegate agency administration. |
| 2 | Battery list returns every non-deleted battery | **MISSING TENANT FILTER** | `backend/app/routers/batteries.py:39-72` | Any authenticated user sees all agencies’ registry. |
| 3 | Portfolio endpoint returns all batteries | **MISSING TENANT FILTER** | `backend/app/routers/batteries.py:75-146` | Fleet counts/latest evidence leak across agencies. |
| 4 | Battery detail has no object-level check | **MISSING** | `backend/app/routers/batteries.py:181-187` | Change `/batteries/{id}` to access another agency’s battery. |
| 5 | Any `technician` can update any battery | **MISSING SCOPE** | `backend/app/routers/batteries.py:190-223`; `deps.py:57-58` | Cross-agency modification/status changes. |
| 6 | Only global admin can delete battery | **IMPLEMENTED ROLE, MISSING TENANT** | `backend/app/routers/batteries.py:226-243`; `deps.py:57` | Global admin can delete across agencies. |
| 7 | Inspection list is global | **MISSING TENANT FILTER** | `backend/app/routers/inspections.py:22-64` | All inspection records and evidence counts visible. |
| 8 | Inspection create checks battery existence, not ownership | **MISSING OBJECT AUTH** | `backend/app/routers/inspections.py:91-132` | Technician can create inspection on any battery ID. |
| 9 | Inspection detail has no ownership check | **MISSING** | `backend/app/routers/inspections.py:135-141` | URL ID substitution reads another agency’s inspection. |
| 10 | No inspection update/delete endpoints | **IMPLEMENTED SCOPE** | `backend/app/routers/inspections.py` (only list/create/get) | Current modification surface is create; future endpoints need same policy. |
| 11 | Measurement endpoints allow any authenticated read | **MISSING TENANT FILTER** | `backend/app/routers/measurements.py:15-57` | SOC/SOH and measurement history leakage. |
| 12 | Measurement writes allowed for any technician on any battery | **MISSING OBJECT AUTH** | `backend/app/routers/measurements.py:60-101`; `deps.py:58` | Cross-agency data injection. |
| 13 | Lifecycle events are global by battery ID | **MISSING OBJECT AUTH** | `backend/app/routers/lifecycle.py:15-67` | History/notes/actor leakage and unauthorized event creation. |
| 14 | Attachment list has no ownership check | **MISSING** | `backend/app/routers/attachments.py:17-30` | List any battery’s evidence by changing battery ID. |
| 15 | Attachment download has no ownership check | **MISSING** | `backend/app/routers/attachments.py:103-122` | Any authenticated user can download any attachment ID. |
| 16 | Attachment delete has no ownership check | **MISSING** | `backend/app/routers/attachments.py:125-136` | Any technician can delete another agency’s evidence. |
| 17 | Attachment upload validates type, extension and magic bytes | **IMPLEMENTED** | `backend/app/services/attachments.py:11-49` | Good content control; does not replace ACL. |
| 18 | Download sets attachment disposition/nosniff/no-store | **IMPLEMENTED** | `backend/app/routers/attachments.py:113-121` | Good baseline response hardening. |
| 19 | Dashboard aggregates all batteries and evidence | **MISSING TENANT FILTER** | `backend/app/routers/dashboard.py:38-208` | Fleet health, attention queue and recent events leak globally. |
| 20 | User list/create/reset/update is global-admin only | **PARTIAL** | `backend/app/routers/users.py:17-90` | No agency admin; global admin can assign `admin`, reset or deactivate any user. |
| 21 | No audit for user/role changes or attachment lifecycle | **MISSING** | `backend/app/services/audit.py:8-27`; `routers/users.py:25-90`; `routers/attachments.py:33-136` | Sensitive changes are not attributable in an audit trail. |
| 22 | Logout deletes cookie but does not increment token version | **PARTIAL** | `backend/app/routers/auth.py:97-108`; `security.py:27-34` | A captured JWT remains valid until expiry; password/reset does revoke via `token_version`. |
| 23 | Login rate limiting is in-process | **PARTIAL** | `backend/app/rate_limit.py:1-15` | Works only for one backend process; not distributed. |
| 24 | CSRF origin guard rejects unsafe requests with a disallowed Origin | **IMPLEMENTED** | `backend/app/main.py:56-66` | Guard depends on Origin presence; CORS is allowlisted, not wildcard. |
| 25 | CORS is exact allowlist and credentials enabled | **IMPLEMENTED** | `backend/app/main.py:47-53`; `config.py:29-44` | Production validates HTTPS origins. |
| 26 | Production config rejects insecure cookie, public docs, non-HTTPS CORS | **IMPLEMENTED** | `backend/app/config.py:33-45` | Good production guardrail. |
| 27 | Login failure detail is generic | **IMPLEMENTED** | `backend/app/routers/auth.py:38-41` | Does not disclose whether email exists. |

## 4. Tenant isolation assessment

There is currently **no tenant boundary** in the data model or query layer. The frontend can hide controls, but backend authorization is global:

- `require_writer` is `admin` or `technician` globally (`backend/app/deps.py:57-58`).
- `get_current_user` validates authentication, but not organization scope (`backend/app/deps.py:18-43`).
- Battery and nested routes use `get_battery_or_404` with only battery ID and soft-delete state (`backend/app/routers/batteries.py:32-36`).
- List endpoints do not accept or apply an organization/assignment filter.
- No customer/installation organization model exists.

**Critical consequence:** Agency A can change an object ID in a URL and read/modify Agency B data if both are in this database. Lists, detail, nested records, dashboard and attachment download all fail the isolation requirement.

## 5. Existing controls that can be reused

- Argon2 password hashing and JWT creation: `backend/app/security.py:10-34`.
- Active-user, token-version and forced-password-change enforcement: `backend/app/deps.py:18-43`.
- Admin-only user administration and temporary-password reset: `backend/app/routers/users.py:17-69`.
- CSRF Origin guard and allowlisted CORS: `backend/app/main.py:47-66`.
- Login failure rate limit: `backend/app/rate_limit.py:11-50`.
- Attachment content validation and secure download headers: `backend/app/services/attachments.py:11-49`; `backend/app/routers/attachments.py:113-121`.
- Battery lifecycle audit events: `backend/app/services/audit.py:8-27`.
- Soft-deleted battery filtering for list/detail: `backend/app/routers/batteries.py:32-36,48`.
- Responsive frontend and Android same-origin wrapper; no need for a backend rewrite.

## 6. Tests: executed vs proposed

### Executed in isolated test environment

| Test set | Result | Notes |
|---|---|---|
| Backend pytest with `COOKIE_SECURE=false` | **36/36 PASS** | Run in QA backend container; SQLite temp DB; no production DB. |
| Backend pytest with container default `COOKIE_SECURE=true` | **27/36 FAIL** | TestClient over HTTP did not send Secure cookie; test harness is environment-sensitive. |
| Frontend Vitest | **6/6 PASS** | No tenant/authorization tests exist. |
| Existing role test coverage | Partial | Viewer write denial, technician write allow, CSRF, rate limit, password reset/revocation, attachment content checks. |
| Tenant/IDOR tests | **NOT EXECUTED** | No such tests exist; not run against production. |

### Proposed isolated tests (not executed)

1. Agency A cannot read Agency B batteries.
2. Agency A cannot modify Agency B inspections.
3. Agency A cannot access Agency B attachments.
4. Agency Technician cannot create administrators or escalate roles.
5. Viewer cannot create/update/delete protected records.
6. Disabled/revoked account cannot access APIs.
7. Unassigned assets are inaccessible without explicit permission.
8. List/detail/export/download enforce the same scope.
9. Login failures do not reveal sensitive information.

**Tests must run against synthetic data in an isolated local/QA database, not production.**

## 7. Top risks

1. **CRITICAL — No tenant isolation.** All authenticated users can access all battery, inspection, evidence, measurement and dashboard data.
2. **CRITICAL/HIGH — IDOR on attachments and nested objects.** Attachment download/delete and inspection/measurement/lifecycle detail can be accessed by object ID without asset ownership checks.
3. **HIGH — Role model insufficient.** `admin`/`technician`/`viewer` are global; no Agency Admin/Agency Technician or assignment boundary.
4. **HIGH — Global user administration.** Any admin can create another admin or reset any user; no agency-scoped provisioning.
5. **HIGH — Audit gaps.** User/role changes and attachment changes lack an attributable audit trail.
6. **MEDIUM — Session revocation.** Logout only clears the browser cookie; stolen JWTs remain valid until expiry unless password/reset increments `token_version`.
7. **MEDIUM — Release/security process.** Current Android artifact is debug-signed; no release manifest or signed distribution process. See `RELEASE_READINESS_GAPS.md`.
8. **MEDIUM — Stale/network state.** No explicit stale telemetry timestamp; monitoring shows a static `—` for last received (`frontend/src/pages/MonitoringPage.tsx:188`). Network requests have no timeout/retry (`frontend/src/api.ts:47-72`).
9. **LOW/MEDIUM — Tests not hermetic.** Backend tests fail under a Secure-cookie environment unless overridden; test setup must pin cookie mode explicitly.
10. **LOW — In-process rate limiter.** Not effective across multiple backend replicas.

## 8. Recommended next action

Proceed only with a CTO-approved implementation mission that adds tenant membership and object-level authorization at the backend first, followed by agency-scoped provisioning and regression tests. Do not rely on frontend hiding or URL checks. Do not deploy to production until the P0 tests pass against synthetic multi-tenant data.

**No implementation was performed in this audit.**
