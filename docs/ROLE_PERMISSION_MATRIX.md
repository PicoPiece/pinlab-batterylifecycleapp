# ROLE & PERMISSION MATRIX — Proposed Minimal Model

**Status:** Design only; not implemented.  
**Audit date:** 2026-10-31  
**Related audit:** `docs/AGENCY_ACCESS_AUDIT.md`

## 1. Current roles

| Current role | Current implementation | Effective scope |
|---|---|---|
| `admin` | `require_admin` / `require_writer` | Global user administration and all data writes |
| `technician` | `require_writer` | Global write to batteries, inspections, measurements and attachments |
| `viewer` | Authenticated read | Global read of all records |

There is no `organization_id`, agency role, membership table or asset assignment in the current model (`backend/app/models.py:88-245`; `backend/app/deps.py:46-58`).

## 2. Proposed role model

Roles describe **what actions** a user may perform. Tenant membership and asset assignment describe **which organization and battery data** they may touch.

| Proposed role | Purpose | Tenant scope |
|---|---|---|
| **PinLab Super Admin** | Platform owner/operations | All organizations |
| **PinLab Manager** | PinLab service/account manager | All agencies for read; assigned agencies for administration |
| **PinLab Technician** | PinLab field/support engineer | Assigned agencies and assigned assets |
| **Agency Admin** | External agency administrator | Own agency only |
| **Agency Technician** | External field technician | Own agency, assigned assets only |
| **Viewer** | Read-only external or internal viewer | Own agency only |

## 3. Tenant and assignment rules

1. Every user belongs to one organization; a user may have multiple memberships only if explicitly approved.
2. Every battery belongs to exactly one organization.
3. A battery assignment links an organization and optionally a technician; assignment is separate from `created_by`.
4. A user can access an asset only when:
   - the user is Super Admin; or
   - the user is PinLab Manager and the agency is in their managed-agency scope; or
   - the user belongs to the asset’s organization and the asset is assigned to them, for technician roles; or
   - the user belongs to the asset’s organization and has org-wide read permission (Agency Admin/Viewer).
5. Unassigned assets are invisible to Agency Technicians unless an explicit org-wide permission is granted.
6. List, detail, nested resources, exports and attachment downloads must apply the same scope. Cross-tenant object IDs should return **404**, not 403, to avoid object enumeration.
7. Attachments inherit the ACL of their battery/inspection; no separate public URL bypass.
8. Frontend hiding is never treated as authorization.

## 4. Role-permission matrix

Legend: **A** = all organizations; **M** = managed agencies; **O** = own organization; **AS** = assigned assets in own organization; **R** = read only; **—** = denied/not applicable.

| Action | Super Admin | PinLab Manager | PinLab Technician | Agency Admin | Agency Technician | Viewer |
|---|---|---|---|---|---|---|
| Login / change own password | A | A | A | O | O | O |
| View dashboard / fleet health | A | A | AS/O | O | AS | O (R) |
| List/read batteries | A | A | AS/O | O | AS | O (R) |
| Create battery | A | M/O | AS/O | O | — | — |
| Update battery identity/status | A | M/O | AS/O | O | — | — |
| Delete/archive battery | A | M | — | O | — | — |
| Assign/reassign battery | A | M/O | — | O | — | — |
| Read inspection list/detail | A | A | AS/O | O | AS | O (R) |
| Create inspection | A | M/O | AS/O | O | AS | — |
| Update/delete inspection | A | M/O* | AS/O* | O* | — | — |
| Read measurements/lifecycle | A | A | AS/O | O | AS | O (R) |
| Create measurement/lifecycle event | A | M/O | AS/O | O | AS | — |
| Upload attachment | A | M/O | AS/O | O | AS | — |
| Download attachment | A | A | AS/O | O | AS | O (R) |
| Delete attachment | A | M/O | AS/O | O | — | — |
| Read warranty preview | A | A | AS/O | O | AS | O (R) |
| Read telemetry (future) | A | M/O | AS/O | O | AS | O (R) |
| List users | A | M | — | O | — | — |
| Create/reset/deactivate users | A | M (agency users) | — | O (Agency Technician/Viewer only) | — | — |
| Assign roles | A | M (non-PinLab roles) | — | O (Agency Technician/Viewer) | — | — |
| Manage organization settings | A | M | — | O | — | — |
| Reports/exports | A | A | AS/O | O | AS | O (R) |
| Audit log | A | M/O | — | O | — | — |

\* There are no inspection update/delete endpoints today (`backend/app/routers/inspections.py` only exposes list/create/get). These cells describe the policy to apply if such endpoints are added later; do not invent them now.

## 5. Required backend enforcement points

| Surface | Required filter |
|---|---|
| `GET /batteries` | organization membership + assignment |
| `GET /batteries/portfolio` | same as registry |
| `GET/PATCH/DELETE /batteries/{id}` | object ACL before query result is returned |
| `GET /dashboard` | all aggregate queries scoped to accessible assets |
| `GET /inspections` | join battery scope |
| `GET /batteries/{id}/inspections` | battery ACL |
| `POST /batteries/{id}/inspections` | battery ACL + writer role |
| `GET /inspections/{id}` | inspection→battery ACL |
| `/measurements`, `/lifecycle-events` | parent battery ACL |
| `GET/POST/DELETE attachments` | parent battery/inspection ACL |
| `GET /attachments/{id}/download` | parent battery/inspection ACL |
| `/users` and role changes | org-scoped administration; only permitted role transitions |
| Reports/exports | same scope as source query, never a separate unfiltered query |

## 6. Current-to-proposed role migration

| Existing | Proposed mapping |
|---|---|
| `admin` | PinLab Super Admin or PinLab Manager, explicit decision per account |
| `technician` | PinLab Technician or Agency Technician, explicit organization assignment |
| `viewer` | Viewer inside an explicit organization |

Migration must be explicit and reversible. A global admin should not be silently converted into an agency admin. Existing records need a backfill organization (likely PinLab) and an explicit decision about cross-agency visibility.

## 7. Mandatory negative-test cases

- Agency A requesting Agency B battery ID → 404.
- Agency A requesting Agency B inspection ID → 404.
- Agency A downloading Agency B attachment ID → 404.
- Agency Technician attempting to change their role or create an admin → 403.
- Viewer attempting create/update/delete → 403.
- Unassigned battery requested by Agency Technician → 404.
- Disabled account with a valid old cookie → 401.
- List, detail, export and download return the same object set for the same role.
- Login failure response does not disclose account existence.

**No matrix cell is considered implemented until a backend test proves it.**

## 8. P0-B implementation status (2026-10-31)

Implemented and tested in the backend:

- Organization roles: `pinlab_super_admin`, `pinlab_manager`, `pinlab_technician`, `agency_admin`, `agency_technician`, `viewer`.
- `AccessContext` scope dependency; no membership returns 403.
- Battery list, portfolio, detail, update and delete are scoped.
- Inspection list/detail/create, measurements, lifecycle, dashboard and attachments inherit battery scope; cross-tenant IDs return 404.
- Attachment list/upload/download/delete require parent battery authorization.
- Agency Admin can manage only its organization; Agency Technician needs an assignment; Viewer is read-only.
- PinLab Manager has cross-agency operational visibility; battery organization changes and administrative membership/assignment changes write `security_audit_events`.
- Global user administration is now Super Admin-only. Agency Admins can create/assign users only inside their own organization through the scoped backend API; the Web UI is Stage 2.

Not implemented in this stage:

- Web organization/membership/assignment screens (Stage 2).
- Reports/exports endpoints.
- Warranty/customer/installation API beyond current preview.
- Real per-session revocation beyond token-version behavior.
- Android packaging/offline work (Stage 3).
- Production migration or deployment.

The existing `ROLE_PERMISSION_MATRIX.md` table remains the target matrix; the rows above identify what is currently enforced by backend tests.
