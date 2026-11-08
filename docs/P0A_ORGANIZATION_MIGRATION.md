# P0-A — ORGANIZATION TENANCY SCHEMA & MIGRATION REHEARSAL

**Status:** Implemented on feature branch; not deployed.  
**Date:** 2026-10-31  
**Base commit:** `198f2ea`  
**Scope:** schema + migration rehearsal + test configuration only.  
**Not included:** endpoint authorization, organization APIs, agency account provisioning, P0-B.

## 1. Schema added

```text
organizations (1) ─────< organization_memberships >───── (1) users
       │
       └──────< batteries (organization_id nullable)
                       │
                       └──────< battery_assignments >──── (1) users
```

| Table / column | Purpose |
|---|---|
| `organizations` | Tenant identity: unique `slug`, `name`, `kind=pinlab|agency`, `is_active`. |
| `organization_memberships` | User membership and organization-scoped role; unique `(user_id, organization_id)`. |
| `organizations.role` values | `pinlab_manager`, `pinlab_technician`, `agency_admin`, `agency_technician`, `viewer`. |
| `batteries.organization_id` | Nullable FK to `organizations`; backward-compatible because existing rows may be unmapped. |
| `battery_assignments` | Explicit battery → technician assignment; `assigned_by_id`, active/ended timestamps; unique `(battery_id, user_id)`. |

The existing global `users.role` enum is intentionally unchanged. Global `admin` remains the PinLab Super Admin representation until P0-B authorization work. No endpoint reads the new fields in P0-A.

## 2. Migration

- Alembic revision: `b7f3a1c9d2e4_organization_tenancy`.
- Parent: `a1b2c3d4e5f6`.
- Creates organizations, memberships, nullable battery ownership and battery assignments.
- Inserts one organization: `slug=pinlab-internal`, `name=PinLab Internal`, `kind=pinlab`.
- Maps only batteries whose `asset_id` starts with `DEMO-` to that organization.
- Does **not** create user memberships.
- Does **not** assign technicians.
- Leaves non-`DEMO-`/unknown battery ownership `NULL` for manual review.
- Preserves all asset IDs and the existing global unique `asset_id` constraint.

## 3. Deterministic mapping

| Source | Rule | Result |
|---|---|---|
| Battery `DEMO-*` | Starts with `DEMO-` | Map to `pinlab-internal` |
| Battery non-`DEMO-*` | Unknown/real customer | Leave `organization_id = NULL`; manual review |
| Existing users | Do not infer agency from role/name/email | No memberships created automatically |
| Existing assignments | None currently | `battery_assignments` starts empty |
| Existing inspections/measurements/attachments | Inherit battery through parent relationship | No new tenant column; P0-B must enforce via parent |
| Existing `asset_id` | Never change | Verified stable in migration tests |

### Mapping audit snapshot (QA only, read-only)

- QA database observed: 4 users, 12 batteries, all 12 asset IDs `DEMO-*`, 0 non-demo batteries.
- Production was **not queried or changed** during P0-A.
- Before applying this migration to production, run the same inventory on the approved production backup and review:
  - non-DEMO batteries;
  - users whose agency membership is not obvious;
  - batteries created by multiple users or by an inactive user;
  - records with real customer/installation notes;
  - any assets whose ownership cannot be proven.

Ambiguous/real records must remain `NULL` and be assigned only after a CTO-approved mapping decision.

## 4. Data ownership metadata reviewed

- `batteries.created_by_id` / `updated_by_id` are creator/updater metadata, not ownership.
- `inspections.technician_id` and `created_by_id` are author metadata, not current access rights.
- `attachments.uploaded_by_id` is upload metadata, not ownership.
- Therefore the migration maps demo batteries by deterministic asset prefix, not by creator identity.

## 5. Verified tests

### Automated migration test

`backend/tests/test_org_migration.py` uses a disposable SQLite database and verifies:

- forward migration from `a1b2c3d4e5f6` to head;
- `PinLab Internal` creation;
- only `DEMO-*` mapped;
- non-demo row remains `NULL`;
- asset IDs unchanged;
- downgrade removes new tables/column;
- re-upgrade restores the deterministic mapping.

**Result: PASS.**

### PostgreSQL isolated rehearsal

A disposable PostgreSQL 17 container was used; no production/QA application DB was changed.

- Forward migration: PASS
- Demo mapped / non-demo unmapped: PASS
- Downgrade removes new schema and `organization_id`: PASS
- Re-upgrade recovery: PASS
- Asset IDs stable: PASS

### Existing regression

- Backend: **37/37 PASS** with HTTPS TestClient and `COOKIE_SECURE=true`. This includes 36 existing tests + the migration test.
- Frontend: **6/6 PASS** (no frontend changes in P0-A).
- Test config now uses `base_url=https://testserver` and `COOKIE_SECURE=true`, so Secure-cookie behavior is exercised without weakening production policy.
- No production/QA application data was migrated.

## 6. Production migration risk

| Risk | Mitigation / status |
|---|---|
| Existing rows have no organization | `organization_id` nullable; demo-only deterministic mapping; non-demo remain NULL. |
| Real customer data accidentally mapped | Mapping limited to `DEMO-*`; all other rows require manual review. |
| Asset IDs change or collide | No asset ID update; global unique constraint preserved. |
| User membership inferred incorrectly | No automatic memberships; explicit mapping in P0-B. |
| App behavior changes | New fields are nullable and unused by endpoints; existing tests pass. |
| Downgrade loses new ownership data | Downgrade is intentionally destructive for new schema/mapping; take backup and obtain approval before any production rollback. |
| Lock/large table rewrite | Batch alter on batteries; validate on a production-like snapshot before execution. |
| Permissions remain global | P0-A does not fix endpoint authorization; P0-B must do it. |

**Do not run the migration in production until the production inventory and manual mapping review are complete and CTO approves.**

## 7. Recommended P0-B scope

1. Backend scope dependency from user → organizations/assignments.
2. Apply scope to batteries, portfolio, dashboard, inspections, measurements, lifecycle and attachments.
3. Agency-scoped user provisioning and role transition rules.
4. Attachment list/download/delete parent ACL.
5. Cross-tenant 404 and regression tests for all nine required security cases.
6. Audit events for role/membership/assignment/attachment changes.
7. Only after those pass: agency pilot release gate.

No implementation of P0-B is included in this branch.
