# P0-B STAGE 1 CHECKPOINT — Backend Security

**Date:** 2026-10-31  
**Branch:** `mission-013-p0b-security`  
**Scope:** Stage 1 only — backend tenant/object authorization and negative tests.  
**Not included:** Web administration UI (Stage 2), Android packaging/offline (Stage 3), production migration/deployment.  
**Production:** unchanged.

## 1. Implemented authorization

Added `backend/app/authorization.py` with a reusable `AccessContext`:

- `pinlab_super_admin`: global access.
- `pinlab_manager`: all organizations for operational access; no global user administration.
- `pinlab_technician`: explicitly assigned batteries only.
- `agency_admin`: own organization only; can manage memberships/assignments in that organization.
- `agency_technician`: assigned batteries only, within membership scope.
- `viewer`: organization read-only.
- No active membership: 403 on protected data endpoints.

Cross-tenant object IDs are returned as **404**. Assignment and membership changes are written to `security_audit_events`.

## 2. Endpoint coverage

| Surface | Enforcement |
|---|---|
| Battery list/portfolio/detail/update/delete | `AccessContext` scope + object ACL |
| Battery creation | Scoped organization; Agency Admin own org; internal technician creates + auto-assigns own asset |
| Inspection list/detail/create | Battery scope; cross-tenant 404 |
| Measurement/lifecycle | Battery scope |
| Dashboard | All aggregates scoped to visible batteries |
| Attachments list/upload/download/delete | Parent battery ACL |
| Organization list/memberships | Scoped admin; role escalation blocked |
| Organization user creation | Agency Admin own organization; agency-scoped roles only |
| Battery assignments | Scoped admin; target must be technician in battery organization |
| Global `/users` | Super Admin only |
| Audit history | `GET /organizations/{id}/audit` for authorized org admins |

Frontend behavior is not changed in Stage 1; UI guards remain UX-only until Stage 2.

## 3. Bootstrap

No automatic conversion of existing users. The only supported bootstrap is explicit CLI after CTO approval:

```bash
python -m app.bootstrap --email approved-admin@example.com
```

It requires an existing active user and the existing `PinLab Internal` organization. It only adds `pinlab_super_admin`; it does not create users or passwords.

## 4. Database changes

New migration: `c9d8e7f6a5b4_security_audit.py`.

Adds append-only `security_audit_events` for:

- `organization.create`
- `membership.create` / `membership.update`
- `battery.assignment.create` / `battery.assignment.end`
- `battery.create` / `battery.update` / `battery.delete`
- `battery.organization.reassign`

No production migration was executed.

## 5. Tests executed

| Test | Result |
|---|---|
| Full backend suite, HTTPS TestClient + `COOKIE_SECURE=true` | **39/39 PASS** |
| Existing backend regression | **37/37 PASS** (included above) |
| Tenant/role/attachment/assignment negative tests | **PASS** |
| Bootstrap idempotency | **PASS** |
| SQLite migration forward/downgrade/recovery | **PASS** |
| PostgreSQL 17 isolated migration/downgrade/recovery | **PASS** |
| Frontend regression | **6/6 PASS** |
| Production/QA application DB migration | **Not executed** |

Tenant test covers:

- Agency A cannot list/read B batteries or dashboard data.
- Agency A cannot create/read B inspection.
- Agency A cannot download B attachment.
- Agency Admin cannot grant PinLab role; can grant agency technician in own org.
- Agency Admin can create a user only in its own organization.
- Agency Admin cannot create a battery in another agency.
- Agency Technician cannot see unassigned assets; assignment grants access.
- Viewer cannot create/update/delete.
- Disabled account loses access.
- No-membership account is denied.
- Manager sees multiple agencies.
- Assignment and organization reassignment create audit events.

## 6. Known gaps / risks

1. Web administration UI for organizations, memberships and assignments is not implemented; Stage 2.
2. Agency-scoped user creation exists in the backend but is not exposed in the Web UI yet.
3. No reports/exports endpoints exist; when added they must reuse `AccessContext`.
4. Warranty/customer/installation APIs remain preview-only; future endpoints need the same parent ACL.
5. `PinLab Manager` cross-agency access is broad by CTO decision; audit coverage exists for writes, but read auditing is not implemented.
6. Logout still only clears the cookie; password/reset increments `token_version`; per-session revocation is unresolved.
7. Existing production users have no membership; after future deployment they will be denied until an approved bootstrap/mapping is executed.
8. Physical Android/device validation is outside this stage.
9. No production deployment, migration or secret/signing work was performed.

## 7. Rollback

- Backend code rollback: restore previous backend image/commit; new tables are additive and unused by old code.
- Migration rollback: downgrade `c9d8e7f6a5b4` then `b7f3a1c9d2e4` only with a backup and CTO approval.
- Do not downgrade after production data has been written to new tenancy/audit tables without a recovery plan.
- No production rollback was exercised because nothing was deployed.

## 8. Recommended Stage 2

Implement only the minimal Web administration surface:

- organization list/create;
- memberships and allowed role assignment;
- battery ownership and technician assignment;
- user activation/deactivation and existing password reset flow;
- audit history;
- hide admin controls for unauthorized roles;
- synthetic Agency A/B UI tests.

Stop for CTO approval before Android packaging/offline work.
