# Mission 017-PROD — Production MQTT Pilot Deployment

- **Date:** 2026-11-08
- **Scope:** One APESS battery Passport, one ESP32-S3 Gateway, existing Mosquitto broker and existing PinLab Production PostgreSQL.
- **Result:** **PASS** — real APESS `REAL_BMS` telemetry is persisted against `PL-APESS-0001` in production.
- **Authorization:** CTO final deployment authorization for the bounded Mission 017-PROD checklist.

## 1. Pre-deployment baseline

Production was verified before any change:

| Item | Baseline |
|---|---|
| API/frontend image | `rc-ac3e599` |
| Alembic revision | `c9d8e7f6a5b4` |
| Users / organizations | 10 / 3 |
| Batteries / inspections | 16 / 14 |
| Measurements / attachments | 45 / 2 |
| Production APESS Passport | none |
| `telemetry_samples` table | absent |

No material difference from the reviewed baseline was found.

## 2. Backup and integrity verification

- **Backup directory:** `/home/picopiece/backups/pinlab-app/mission017-prod-final-20261108T154552Z/`
- **Dump:** `db.dump`, mode `600`
- **SHA256:** `4a7ba507ede196138dc7513caf33b58e44264abadc50ea4f0a27f2aae1454f46`
- `SHA256SUMS` verification: **PASS**.
- **Restore rehearsal:** restored the final dump into an isolated PostgreSQL 17 container. Restore and schema/data checks passed at the reviewed baseline: `c9d8e7f6a5b4`; 10 users, 3 organizations, 16 batteries, 14 inspections, 45 measurements, 2 attachments.
- The private `app.env` and dump were stored outside Git with mode `600`.

## 3. Consumer image

- **Image tag:** `pinlab-app-mqtt-consumer:rc-mqtt-2f068da`
- **Image digest:** `sha256:fb2696ec725f658ede6ce5be140a2a1e630c257846342006478101d71b7603cf`
- **Source:** reviewed `mission-017-server-mqtt` tree at commit `2f068da`; no application API/frontend source was deployed.
- Existing production API/frontend images remained `rc-ac3e599`.

## 4. Broker cutover

- QA consumer `pinlab-mqtt-dev-ingest-1` stopped.
- Production consumer identity `pinlab-prod-ingest` added to the existing Mosquitto password file.
- Scoped ACL added: `topic read pinlab/v1/gateways/+/telemetry`.
- Existing `gw-000001` and `pinlab-ingest` password hashes were preserved.
- Mosquitto restarted successfully and reported `healthy`.
- Gateway ID, Gateway credentials, topic, QoS 1, Cloudflare hostname and ESP32 firmware were unchanged.
- Only one production consumer was started: `pinlab-prod-mqtt-ingest`.

## 5. Production migration

Applied the additive migration only:

```text
c9d8e7f6a5b4 -> e5f6a7b8c9d0
```

New tables: `gateways`, `gateway_battery_assignments`, `telemetry_samples`.

Post-migration business counts remained unchanged. `telemetry_samples` started at 0.

## 6. Battery Passport

Created through the production API using the authorized CTO admin identity.

| Field | Value |
|---|---|
| Asset ID | `PL-APESS-0001` |
| Database ID | `17` |
| Organization | PinLab Internal, ID `1` |
| Manufacturer | APESS |
| Model | ES-LV-5 |
| Chemistry | LiFePO4 |
| Nominal voltage | 51.2 V |
| Nominal capacity | 100 Ah |
| Nominal energy | 5.12 kWh |
| Cell configuration / BMS | 16S / PACE P16S100A, recorded in source/notes |
| Serial number | `NULL` |
| Received date | `NULL` |
| Status | `in_service` |
| Specification status | `confirmed` |

No manufacturer, serial or ownership information was invented.

## 7. Gateway assignment

- Gateway: `GW-000001` (database ID `1`)
- Organization: `1`
- Battery slot: `0`
- Battery database ID: `17` / `PL-APESS-0001`
- `assigned_at`: `2026-11-08T15:47:23Z`
- Production ingestion started after the assignment timestamp.
- No QA telemetry was retroactively mapped to the production Passport.

## 8. First new production telemetry

The first production row after cutover:

| Field | Evidence |
|---|---|
| Row ID | `1` |
| Message ID | `GW-000001:boot24:227` |
| Source | `REAL_BMS` |
| Gateway | `GW-000001` |
| Battery slot / ID | `0` / `17` |
| Asset | `PL-APESS-0001` |
| Organization | `1` |
| Measured at | `2026-11-08 15:47:33+00` |
| Received at | `2026-11-08 15:47:38.801104+00` |
| Time quality / protocol | `gateway_ntp` / `PYLON_485` |
| Pack voltage | `52.534 V` |
| Current | `0.000 A` |
| SOC | `35.45%` |
| Capacity remaining / full | `35.450 / 100.000 Ah` |
| Cell voltages | 16 values |
| Temperatures | 5 values |

A second consecutive message, `GW-000001:boot24:228`, was also persisted. At the
time of verification there were 15 production telemetry rows from
`2026-11-08 15:47:38Z` onward, with no duplicate `message_id` rows.

## 9. Production health and record integrity

| Check | Result |
|---|---|
| `pinlab-prod-mqtt-ingest` | healthy; 0 restarts |
| Consumer image | `pinlab-app-mqtt-consumer:rc-mqtt-2f068da` |
| Production API health | HTTP 200 |
| OpenProject login | HTTP 200 |
| API/frontend images | unchanged `rc-ac3e599` |
| Users / organizations | 10 / 3 |
| Batteries | 17 (16 existing + `PL-APESS-0001`) |
| Inspections / measurements | 14 / 45 |
| Attachments | 2 |
| Unexpected business-record changes | none observed |

## 10. Retention

- Scope verified: the retention implementation targets only
  `telemetry_samples`; it does not delete Passport, inspection, warranty,
  ownership or Gateway assignment records.
- Initial dry-run: `expired_samples=0`.
- Production source for the schedule: `deploy/mqtt-prod/retention.sh`.
- Active schedule: daily at `03:45` via the `picopiece` user crontab.
- The script applies the 7-day cutoff only to raw telemetry.
- No expired telemetry was deleted during deployment.

## 11. OpenProject

Production deployment evidence was added as a comment to OpenProject work
package `#56` (activity `230`).

## 12. Rollback position

- Consumer failures can be handled by stopping `pinlab-prod-mqtt-ingest` without
  restoring the production database.
- The additive migration was not automatically downgraded.
- No production data was deleted or restored.
- A full production database restore would require separate CTO approval.

## 13. Final status

Mission 017-PROD is **PASS**: real APESS telemetry is persisted in production
against Battery Passport `PL-APESS-0001` through the approved Gateway mapping.
