# Access Administration — 2026-11-09

- **Status:** Applied in production.
- **Scope:** Add one PinLab account; grant full platform administration to two
  accounts; correct the new account email.
- **Application code:** Unchanged.
- **Secrets:** No password, password hash or API token is included here.

## 1. Changes applied

| Account | Change | Global role | Organization / Role |
|---|---|---|---|
| `haidang@pinlab.com` | New account, ID `11`; initial email was `hdang@pinlab.com`, then corrected | `admin` | PinLab Internal / `pinlab_super_admin` |
| `chuongvo@pinlab.com` | Granted full platform administration | `admin` | PinLab Internal / `pinlab_super_admin` |

- `haidang@pinlab.com` is active and `must_change_password=true`.
- Its temporary password is delivered only to the CTO and is not stored in Git
  or this report.
- `chuongvo@pinlab.com` retains the existing password; only role/membership was
  changed.
- Effective access is controlled by the organization membership, not by the
  legacy global role alone.

## 2. Verification

- Login with the new email `haidang@pinlab.com` and temporary password:
  HTTP `200`.
- Login with the old email `hdang@pinlab.com`: HTTP `401`.
- `/auth/me` for the new account returns the corrected email and
  `must_change_password=true`.
- `/auth/access` is intentionally blocked until the forced password change is
  completed.
- Database read-back confirms both accounts have:
  - global role `admin`
  - active `pinlab_super_admin` membership in PinLab Internal
- Production account totals after the change:
  - 11 users total
  - 10 active
  - 1 disabled
  - 8 active organization memberships
  - 6 users requiring password change

## 3. Audit trail

Recorded in `security_audit_events`:

| ID | Action | Target |
|---:|---|---|
| 14 | `membership.create` | user 11 / `pinlab_super_admin` |
| 15 | `membership.create` | user 2 / `pinlab_super_admin` |
| 16 | `user.email.update` | user 11 / old and new email |

Security gap: the existing `POST /users` and `PATCH /users/{id}` endpoints do
not emit a separate audit event for user creation or global-role changes. The
membership and email changes are audited. This should be addressed in a
separate reviewed code change rather than by adding undocumented events during
this operation.

## 4. Safety

- No application deployment, restart or migration was required.
- No battery, telemetry, Gateway, MQTT, retention or classification data was
  changed.
- The temporary password is not recoverable from this repository or report.
