# IMPLEMENTATION PLAN — Agency Security & Release Readiness

**Status:** Proposed plan only. Do not implement until CTO approval.  
**Audit date:** 2026-10-31  
**Reviewed commit:** `198f2ea`  
**Related:** `AGENCY_ACCESS_AUDIT.md`, `ROLE_PERMISSION_MATRIX.md`, `RELEASE_READINESS_GAPS.md`

## 1. Objective

Add backend-enforced tenant isolation and least-privilege agency roles while preserving the existing React/FastAPI/PostgreSQL architecture, cookie authentication, and current battery/inspection workflows. No BLE, offline sync, real BMS ingestion or native rewrite.

## 2. Prioritized work

### P0 — Required before Agency Pilot

| # | Task | Dependency | Rough effort |
|---:|---|---|---:|
| 1 | Add `organizations`, `organization_memberships`, and battery `organization_id` + assignment table | CTO decision on PinLab Manager scope and data ownership | 2–3 days |
| 2 | Backfill existing data to a single PinLab organization; preserve global asset ID uniqueness initially | Backup + migration review | 1–2 days |
| 3 | Add backend scope dependency: current user → accessible organizations/assets | P0.1–2 | 2–3 days |
| 4 | Apply object auth to batteries, portfolio, dashboard, inspections, measurements, lifecycle and nested routes | P0.3 | 3–4 days |
| 5 | Apply parent ACL to attachment list/upload/download/delete and evidence counts | P0.4 | 1–2 days |
| 6 | Expand roles to Super Admin, PinLab Manager, PinLab Technician, Agency Admin, Agency Technician, Viewer; enforce permitted role transitions | P0.1, CTO scope decision | 2–3 days |
| 7 | Agency-scoped user provisioning/reset/deactivation; prevent agency admin creating PinLab roles | P0.6 | 2 days |
| 8 | Add isolated multi-tenant regression tests for the nine required cases | P0.3–7 | 2–3 days |
| 9 | Add release manifest, Git tag and release-signing decision | CTO approval | 1–2 days |
| 10 | Add audit events for user/role/assignment/attachment changes | P0.1–7 | 1–2 days |

**P0 total:** roughly **16–24 engineer-days**, excluding CTO review and external security testing. Estimate is high-uncertainty because the data migration and role-scope decision are not yet made.

### P1 — Required for controlled pilot hardening

| # | Task | Rough effort |
|---:|---|---:|
| 1 | Per-session revocation or session inventory; document logout vs token expiry | 1–2 days |
| 2 | Distributed rate limiting/shared state if more than one backend replica | 1–2 days |
| 3 | Request timeout/abort, retry affordance, session-expired message | 1–2 days |
| 4 | Last-success timestamp + STALE telemetry rendering | 1 day |
| 5 | Backup/restore evidence and agency restore drill | 2–3 days |
| 6 | Audit log read API with tenant scope | 1–2 days |
| 7 | Release rollback runbook and artifact retention | 1 day |

### P2 — Later; not needed for first pilot

- iOS build/device verification and signing.
- Formal penetration test / security review.
- Managed app distribution and automated update channel.
- Offline sync/local database only if a critical field requirement emerges.
- Real BMS/IoT ingestion, gateway authentication and fleet provisioning.
- Advanced report/export infrastructure.

## 3. Minimal implementation sequence

1. **CTO decisions:** PinLab Manager scope, organization ownership, role migration mapping, asset ID uniqueness, pilot tenant plan.
2. **Schema:** organizations, memberships, battery organization/assignment; reversible migration; backup.
3. **Backfill:** create PinLab organization; assign existing records explicitly; no silent agency classification.
4. **Scope dependency:** one backend dependency returns allowed organization/asset IDs; all queries consume it.
5. **Object ACL:** parent resource check before nested operations; cross-tenant responses become 404.
6. **Role transition controls:** Agency Admin cannot grant PinLab roles; no self-escalation.
7. **Attachment ACL:** reuse existing file validation; authorization before path resolution/download.
8. **Tests:** run the nine-case matrix against synthetic multi-tenant data, then regression suite.
9. **Release:** signed artifact/manifest and CTO gate approval.

Do not implement all endpoints independently; centralize authorization to avoid inconsistent policies.

## 4. Database migration risks

- Existing rows have no organization. A deterministic backfill is required; never infer agency ownership from creator identity.
- Existing `asset_id` is globally unique (`backend/app/models.py:112`); changing to per-organization uniqueness is a larger migration and can break integrations. Keep global uniqueness for the first implementation unless CTO decides otherwise.
- Adding non-null `organization_id` requires a staged migration: nullable → backfill → enforce not-null.
- Assignment tables and memberships need unique constraints to prevent duplicate/ambiguous access.
- SQLite tests and PostgreSQL production can diverge on constraints/enums; run migration and tenant tests on PostgreSQL in an isolated environment.
- Back up database and uploads before any production migration; migration rollback may not recover deleted/reshaped data.
- `inspection.technician_id` and `created_by_id` indicate creator, not current ownership; do not use them as ACLs.
- Attachment storage paths need no move initially; add ACL by parent battery/inspection, not by path guessing.

## 5. Regression and acceptance tests

### Must execute before Agency Pilot

1. Agency A cannot read Agency B batteries — list, detail, portfolio, dashboard.
2. Agency A cannot modify Agency B inspections — including create via another battery ID.
3. Agency A cannot access Agency B attachments — list, download, delete.
4. Agency Technician cannot create admins or change roles.
5. Viewer cannot create/update/delete protected records.
6. Disabled/revoked account cannot call protected APIs, including with an old cookie.
7. Unassigned assets return 404 for Agency Technician unless explicit permission exists.
8. List, detail, export and download enforce identical scope.
9. Login failures return generic errors and do not disclose account existence.

### Test environment rules

- Synthetic organizations and synthetic users only.
- Isolated local/QA PostgreSQL, never production.
- No destructive tests against production.
- Pin cookie/test environment explicitly; current backend tests can fail under `COOKIE_SECURE=true` because TestClient uses HTTP.
- Run backend and frontend regression; then tenant/IDOR suite; then mobile/desktop smoke.

### Existing tests that can be reused

- Auth/CSRF/rate-limit/password tests: `backend/tests/test_auth.py`, `test_password_management.py`.
- Battery CRUD/soft-delete and viewer/technician restrictions: `backend/tests/test_batteries.py`.
- Attachment content validation: `backend/tests/test_attachments.py`.
- Portfolio/dashboard/evidence: `backend/tests/test_portfolio.py`.
- Frontend regression: `frontend/src/tests/`.

Current executed baseline (isolated test env): backend **36/36 PASS** with `COOKIE_SECURE=false`; frontend **6/6 PASS**. No tenant/IDOR tests exist or were executed.

## 6. Reuse instead of rewrite

- Keep FastAPI, SQLAlchemy, PostgreSQL and `/api/v1`.
- Keep cookie auth, Argon2, `token_version`, forced password change, CSRF origin guard and CORS allowlist.
- Keep current React pages and Capacitor wrapper; add organization context and scoped API behavior behind them.
- Keep attachment magic-byte validation and secure download headers.
- Keep lifecycle event audit; extend it for security-sensitive changes.

## 7. CTO decisions required before coding

1. Does PinLab Manager see all agencies or only assigned agencies?
2. Which existing users become which new roles?
3. Is existing data owned by a single PinLab organization, or is there already an agency mapping?
4. Must `asset_id` remain globally unique for the first migration?
5. Is debug-signed APK acceptable for closed internal beta, or is release signing mandatory now?
6. Who provides the synthetic agency test accounts and controlled pilot data?
7. Is a production authenticated smoke test approved, and with which non-admin account?

**No implementation, migration, deployment or production data change is authorized by this plan yet.**
