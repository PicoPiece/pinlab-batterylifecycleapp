# Mission 019A — CTO RBAC & UX Decision

- **Status:** **IMPLEMENTED / TESTED IN DEVELOPMENT; NOT DEPLOYED**
- **Branch:** `mission-019a-rbac-ux`
- **Implementation commit:** `15d7eca`
- **Base:** `179a299` (`main`)
- **Scope:** Presentation-only Simple / Advanced diagnostics modes inside the
  existing Battery Passport.
- **Production:** unchanged; no deployment, migration, restart or data mutation.
- **Evidence:** `ProjectManagement/Mission019A/`, `docs/mission019a/`,
  `frontend/e2e/mission019a-simple-advanced.mjs`.

## 1. Decision implemented

The existing Organization/Battery RBAC remains the single authorization system.

- No new roles.
- No new permission tables.
- No new RBAC layer.
- No database migration.
- No backend state for the view preference.
- No write action added to diagnostics.

## 2. UX behavior

### Simple View

The Analytics tab opens in **Simple View** by default:

- mobile-first key metrics: SOC, SOH, pack voltage, current, remaining capacity
  and cell delta;
- temperature range, Gateway, source and last-received time;
- a 24-hour SOC and pack-voltage trend using the existing telemetry history API;
- a clear **Chi tiết kỹ thuật / Technical details** entry in both the view-mode
  switch and the footer call-to-action.

Simple View uses:

- `GET /batteries/{id}/telemetry/latest`
- `GET /batteries/{id}/telemetry/history?range=24h&include_cells=false`

### Advanced Diagnostics

Advanced Diagnostics preserves the existing Mission 018.2 dashboard:

- Overview, Cell Analysis and History tabs;
- all 16 cell series and the separate cell-delta chart;
- cell selection/highlighting and synchronized tooltips;
- Relative Voltage mode;
- Diagnostic Evidence API panel;
- 1h/24h/7d ranges.

No existing chart, control or evidence behavior was removed. The dashboard is
only mounted when the user selects Advanced; all its API calls remain
authorized by the backend.

### Preference

The selected mode is stored locally under:

```text
pinlab.diagnostics.mode = simple | advanced
```

A fresh browser context defaults to Simple. No preference is sent to or stored
by the backend.

## 3. Authorization behavior

- The mode switch is available to every user who can open the authorized
  Battery Passport.
- The switch does not grant access or perform a role check.
- Every Simple and Advanced API request continues to use the existing
  Battery/organization authorization dependency.
- UI visibility is presentation only; it is not treated as a security control.
- Cross-organization and battery-level checks remain unchanged.
- Inspection, warranty and organization-management workflows were not touched.

## 4. Role-mapping audit (production, read-only)

Audit performed against the existing production database; no user, membership
or permission was changed for this mission.

- 11 users total: 10 active, 1 disabled.
- 9 active organization memberships.
- 3 organizations: PinLab Internal, TEST Agency A, TEST Agency B.
- 4 explicitly assigned `pinlab_super_admin` accounts:
  `admin@pinlab.com`, `chuongvo@pinlab.com`, `phucnguyen@pinlab.com`,
  `haidang@pinlab.com`.
- No user is a member of more than one organization.
- 5 TEST Agency accounts are restricted to their own organization; all still
  require a password change.
- 1 active account (`phongnguyen@pinlab.com`) has no organization membership
  and therefore cannot access battery data despite its legacy global role.
- 1 disabled smoke-test account has no membership.
- 2 active technician assignments exist:
  `DEMO-AGENCY-A-001` → `test.agency.a.tech@example.com`
  `DEMO-AGENCY-B-001` → `test.agency.b.tech@example.com`.
- One legacy demo battery, `E2E-CHECK-001`, has no organization assignment; it
  is visible to super admins only and is not exposed to agency users.

**Unexpected exposure observed:** none beyond the explicitly granted super-admin
concentration above. The four super-admin accounts are high privilege but
intentional; two were explicitly requested by the CTO on 2026-11-09 and one was
added for `haidang@pinlab.com`. No cross-organization membership or
agency-overreach was found.

Audit caveat: the existing global-role update endpoint does not emit a dedicated
security audit event, although membership and email changes do. This is a
pre-existing backend gap and was not changed in Mission 019A.

Backend authorization regression suite: **64/64 passed**.

## 5. Verification

Frontend:

- Tests: **20/20 passed**.
- Production build: **PASS**.
- Mission 019A browser E2E: **5/5 passed**.
- Mission 018.2 regression: **5/5 passed**.
- Mission 018.1 regression: **4/4 passed**.
- Mission 018 analytics regression: **12/12 passed**.
- Console errors: **0**.
- Mobile widths: **360/390/430 px**, no horizontal overflow.
- E2E telemetry calls observed: latest, 24h history in Simple, and 1h history
  after switching to Advanced.

Backend:

- `64 passed` in the existing backend suite.
- No backend source change.

## 6. Evidence

- `ProjectManagement/Mission019A/after/simple-desktop.png`
- `ProjectManagement/Mission019A/after/advanced-desktop.png`
- `ProjectManagement/Mission019A/after/simple-mobile-360.png`
- `ProjectManagement/Mission019A/after/simple-mobile-390.png`
- `ProjectManagement/Mission019A/after/simple-mobile-430.png`
- `ProjectManagement/Mission019A/e2e-result.json`

## 7. Limitations and next gate

- Android physical-device acceptance remains pending.
- This mission does not implement BMS configuration, Gateway control,
  diagnostic actions, maintenance writes or OTA.
- Any future write action requires separately reviewed permissions and tests.
- Production deployment requires separate CTO approval.
