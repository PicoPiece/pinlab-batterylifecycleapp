# Mission 018.1 — Battery Classification Inventory & Trust Boundary

Status: **reviewed development inventory; not applied to production**.

Production snapshot used for review: `2026-11-08`, Battery table with 17 rows.
No production data was changed by this mission.

## 1. Authoritative classification model

`batteries.classification` is an explicit, nullable classification:

- `real` — approved real-world Battery Passport.
- `demo` — approved demonstration/sample Battery Passport.
- `NULL` — unclassified; not silently treated as either.

The classification is independent from `telemetry_samples.source`:

- A real Passport may receive `SIMULATED` telemetry during testing.
- A demo Passport may receive `REAL_BMS` telemetry and must be flagged for
  classification review rather than auto-promoted.
- No code infers classification from an asset ID prefix, Gateway name,
  telemetry existence or a global demo banner.
- Telemetry never changes classification automatically.

## 2. Initial inventory

| DB ID | Asset ID | Source / origin evidence | Classification |
|---:|---|---|---|
| 1 | DEMO-VF5-001 | source `DEMO/SIMULATED`; notes explicitly sample | demo |
| 2 | DEMO-BESS-001 | source `DEMO/SIMULATED`; notes explicitly sample | demo |
| 3 | DEMO-SECOND-001 | source `DEMO/SIMULATED`; notes explicitly sample | demo |
| 4 | E2E-CHECK-001 | source `DEMO/SIMULATED`; E2E verification only; deleted test asset | demo |
| 5 | DEMO-LFP-002 | source `DEMO/SIMULATED`; rack sample | demo |
| 6 | DEMO-NMC-004 | source `DEMO/SIMULATED`; spare pack sample | demo |
| 7 | DEMO-LFP-005 | source `DEMO/SIMULATED`; rack sample | demo |
| 8 | DEMO-BESS-006 | source `DEMO/SIMULATED`; BESS sample | demo |
| 9 | DEMO-LFP-007 | source `DEMO/SIMULATED`; partial telemetry sample | demo |
| 10 | DEMO-NMC-008 | source `DEMO/SIMULATED`; sample without measurement | demo |
| 11 | DEMO-BESS-009 | source `DEMO/SIMULATED`; quarantined pack sample | demo |
| 12 | DEMO-LFP-010 | source `DEMO/SIMULATED`; healthy sample | demo |
| 13 | DEMO-SECOND-011 | source `DEMO/SIMULATED`; second-life sample | demo |
| 14 | DEMO-AGENCY-A-001 | source `DEMO/SIMULATED`; DEMO/TEST-only agency sample | demo |
| 15 | DEMO-AGENCY-A-002 | source `DEMO/SIMULATED`; DEMO/TEST-only agency sample | demo |
| 16 | DEMO-AGENCY-B-001 | source `DEMO/SIMULATED`; DEMO/TEST-only agency sample | demo |
| 17 | PL-APESS-0001 | CTO-approved APESS ES-LV-5 production pilot; org 1; assigned GW-000001 slot 0 | real |

The initial inventory intentionally uses exact asset IDs. Unknown assets stay
unclassified and require an authorized administrator decision.

## 3. Schema migration

File:

`backend/alembic/versions/f6a7b8c9d0e1_battery_classification.py`

- Revision: `e5f6a7b8c9d0` → `f6a7b8c9d0e1`
- Adds nullable `batteries.classification` plus index.
- Applies only the explicit asset-ID inventory above.
- No default value, no prefix matching, no mass assignment.
- Production migration/backfill is **not approved or applied** by Mission 018.1.

Local isolated-copy migration result: 16 demo, 1 real, 0 unclassified.
Production remains at `e5f6a7b8c9d0` with no classification column.

## 4. Authorized administration

`PATCH /api/v1/batteries/{battery_id}/classification`

- Requires an authenticated PinLab manager or super-admin membership.
- Payload: `{ "classification": "real" | "demo" }`.
- Cross-organization requests return `404`.
- Changes are recorded as `battery.classification.update` in the existing
  security audit event table.
- The Battery Detail page exposes the control only to authorized managers.
- Receiving telemetry never invokes this endpoint.

## 5. Telemetry trust boundary

The existing Mission 017 ingestion chain validates:

1. authenticated MQTT Gateway identity;
2. allowed Gateway topic;
3. telemetry schema;
4. active Gateway-to-Battery slot assignment;
5. server-side ingestion policy.

`source=REAL_BMS` is therefore a device-origin label from an authenticated
Gateway, not cryptographic proof that a physical BMS produced the bytes. A
compromised authenticated Gateway could claim it. No auto-Passport creation or
auto-promotion is performed.

Minimal future improvement (not implemented in this mission): Gateway-signed
payloads or a server-side, per-Gateway provenance policy. Any change must not
disrupt the production Mission 017 consumer.

Production currently has only `source=REAL_BMS` samples (236 at inventory
review). SIMULATED records remain development/test data and are excluded from
verified analytics queries.

## 6. UI presentation rules

- Backend `battery.classification` controls **Real / Demo / Unclassified**.
- `latest.sample` is the latest verified REAL_BMS sample.
- `latest.telemetry_source` labels the verified sample source.
- `latest.latest_any_source` exposes whether a newer SIMULATED sample exists.
- `latest.latest_any_at` exposes the corresponding timestamp.
- REAL + SIMULATED shows an explicit simulated warning, never a fake health
  sample.
- DEMO + REAL_BMS shows real device values but retains a review warning.
- Manual measurements remain in `measurements`; they are not copied into
  telemetry or used to fabricate a manual history.
- Global sidebar/dashboard labels use backend classification counts, not a
  hardcoded demo mode.
