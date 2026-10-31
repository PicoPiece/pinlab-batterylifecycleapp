# Stage 2 — Web Access Control Checkpoint

**Date:** 2026-10-31
**Branch:** `mission-013-stage2-web-access`
**Base:** P0-B `dd446b6`
**Production:** unchanged. No deployment, migration, push or merge performed.
**Scope:** Minimal Web administration UI and supporting read-only authorization endpoint. No Android or telemetry work.

## 1. Implemented Web features

The existing `/users` route now serves an Access & Roles workspace, reusing the current card, table, form and modal styles.

### People & access

- PinLab Internal user list for Super Admin.
- Create internal accounts (legacy global role remains; organization role is assigned through membership).
- Activate/deactivate internal accounts.
- Existing secure password reset for internal accounts.
- Organization selector scoped by backend authorization.
- Organization creation for Super Admin only.
- Organization membership list with user name/email.
- Role assignment restricted to the caller's grantable roles.
- Organization-scoped user creation for Agency Admin/Manager/Super Admin.
- Organization membership activation/deactivation.
- Organization-scoped password reset using the existing password/token-version mechanism.
- Add an existing internal account to an organization (Super Admin).

### Assets & assignments

- Scoped battery selector from the backend portfolio.
- Display current organization ownership.
- Change battery organization only when the backend permits it (Super Admin/Manager).
- List active technician assignments.
- Assign an eligible technician from the selected battery's organization.
- End a technician assignment.
- Ownership, assignment and audit changes are recorded server-side.

### Audit history

- Displays `security_audit_events` for the selected organization: actor, action, target, timestamp and metadata.
- Only users with organization management permission can request it.

### UI hiding and route protection

- Navigation item is shown only when `/auth/access` reports `can_manage_access`.
- `/users` is wrapped by `RequireAccess`; direct access by Technician/Viewer redirects to the dashboard.
- Add-battery buttons use `can_create_battery`, not global role.
- Inspection/measurement/asset edit controls use effective write scope from `/auth/access`.
- Agency Technician does not see the add-battery action.
- The backend remains authoritative; hidden UI is not an authorization control.

## 2. Supporting backend changes

- Added `GET /api/v1/auth/access` returning the current user's effective roles, organization memberships, write/manage/create permissions and no secrets.
- Added membership display fields (`user_email`, `user_full_name`, `organization_name`).
- Added assignment display fields (`user_email`, `user_full_name`, `battery_asset_id`).
- Added audit actor display fields.
- Added `POST /api/v1/organizations/{org_id}/users/{user_id}/reset-password` with organization membership checks.
- No new database migration was required for Stage 2.

## 3. Tests and verification

| Check | Result |
|---|---|
| Backend full suite (HTTPS TestClient, secure cookies) | **39/39 PASS** |
| Existing backend regression | **37/37 PASS** |
| Tenant/role/assignment/audit negative tests | **PASS** |
| `/auth/access` with and without membership | **PASS** |
| Organization-scoped password reset; cross-org reset denied | **PASS** |
| Frontend TypeScript + production build | **PASS** |
| Existing frontend unit tests | **6/6 PASS** |
| Browser smoke with synthetic SQLite + Vite | **PASS** |
| Production/QA migration | **Not executed** |

Browser smoke used synthetic local data only: admin access workspace rendered; Agency Admin workspace was scoped and did not show PinLab internal controls; Agency Technician and Viewer saw no Access nav and direct `/users` redirected; no add-battery button for those roles; an admin assignment was completed through the UI; admin `/users` at 390px had no horizontal page overflow; no page/console errors.

Covered role scenarios in the synthetic backend test:

- Super Admin bootstrap membership.
- PinLab Manager cross-agency visibility.
- Agency A Admin / Technician.
- Agency B Admin.
- Viewer.
- No-membership account.
- Disabled account.
- Unassigned technician.
- Cross-tenant battery, inspection, attachment and mutation requests.
- Organization role escalation denial.
- Organization-scoped user creation and password reset.
- Assignment and ownership audit records.

## 4. Production migration and bootstrap plan — DO NOT EXECUTE

This is a proposed runbook only. Production is untouched.

### Preconditions

1. CTO approves the exact user-to-organization/role mapping.
2. A verified production backup exists and restore has been rehearsed.
3. Production migration window and rollback authority are named.
4. All non-`DEMO-*` batteries have a manual ownership decision or remain explicitly `NULL`.
5. Approved bootstrap account email is recorded; no password is placed in Git or chat.

### Migration sequence

1. Take a verified backup; record current Alembic head (`a1b2c3d4e5f6` expected before P0-A).
2. Rehearse `b7f3a1c9d2e4` and `c9d8e7f6a5b4` on a restored copy.
3. Run `alembic upgrade head` in the approved window.
4. Confirm `organizations`, `organization_memberships`, `batteries.organization_id`, `battery_assignments`, `security_audit_events`.
5. Confirm only `DEMO-*` batteries were mapped to `PinLab Internal`; all ambiguous/non-demo assets remain `NULL`.
6. Run the explicit bootstrap for the approved account:
   `python -m app.bootstrap --email approved-admin@example.com`
7. Create approved memberships and technician assignments using the Stage 2 UI/API.
8. Deploy backend and frontend together. Because data access now requires membership, do not expose the new backend to users before bootstrap.
9. Verify Super Admin login, Agency A/B isolation, technician assignment, viewer read-only and attachment download denial.
10. Keep the prior backend/frontend images available for rollback.

### Important lockout risk

Existing production admin accounts do not automatically become Super Admin. Deploying the authorization backend before the approved bootstrap will produce **403** for users without memberships. Treat bootstrap as part of the same controlled window.

### Rollback

- Schema rollback: downgrade `c9d8e7f6a5b4`, then `b7f3a1c9d2e4` only with backup and CTO approval.
- Application rollback: restore previous backend/frontend images; additive tables can remain unused.
- Do not downgrade after production writes to tenancy/audit tables without a recovery plan.

## 5. Remaining security gaps

1. No real per-session revocation; logout clears the cookie, while password/reset increments `token_version`.
2. Agency Admin can create/deactivate scoped memberships, but there is no full organization user lifecycle (rename, delete, bulk import).
3. No reports/exports endpoints exist; future ones must call `AccessContext`.
4. Warranty/customer/installation APIs remain preview-only.
5. PinLab Manager read access is intentionally broad; writes are audited, reads are not.
6. No rate limiting specific to organization administration.
7. No CSRF token beyond the existing Origin/Referer enforcement.
8. No physical Android/device validation in this stage.
9. No production deployment/migration performed.

## 6. Next stage prerequisites (Android)

- CTO approval for Stage 3.
- Production or approved QA backend with access-control migration/bootstrap completed in an isolated environment.
- Approved test accounts for Super Admin, Agency Admin/Technician, PinLab Technician, Viewer.
- Physical Android device and approved internal distribution channel.
- Release keystore ownership/handling approved; APK signing and version metadata.
- Bundled-shell authentication/CSRF/CORS compatibility proof before replacing `server.url`.
- Stage 3 offline cache/draft design approved, including logout cache clearing.
