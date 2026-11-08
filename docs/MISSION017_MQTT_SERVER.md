# Mission 017-SERVER — MQTT Broker, Ingestion & PostgreSQL

**Date:** 2026-11-08
**Branch:** `mission-017-server-mqtt`
**Scope:** isolated development MQTT pipeline; no production changes.
**Production:** unchanged. No production migration, deployment, Cloudflare/DNS change or public MQTT exposure.

## 1. Read-only infrastructure audit

| Check | Finding |
|---|---|
| Existing MQTT containers/images | None |
| Mosquitto / IoTStack broker | None |
| Ports 1883 / 8883 / 9001 / 8083 / 8084 | Not listening |
| MQTT systemd service | None |
| `mqtt.pinlab.picopiece.com` DNS | No record |
| Existing Cloudflare tunnels | Production app/OpenProject tunnels only; no MQTT route |
| App production stack | `pinlab-app` on PostgreSQL 17, app DB `pinlab` |
| QA stack | separate `pinlab-app-qa` DB/network |
| Existing Gateway records | None |
| Existing raw telemetry table | None |
| Existing backup procedure | App PostgreSQL custom dump + uploads/config backup under `/home/picopiece/backups/pinlab-app/` |

Conclusion: no reusable MQTT broker existed. A dedicated development Mosquitto stack was created, isolated from production.

## 2. Development broker

Location: `deploy/mqtt-dev/`

- Mosquitto 2 (`eclipse-mosquitto:2`) with:
  - internal plaintext listener `1883` for the consumer only;
  - WebSocket listener `9001`, loopback-only;
  - authentication required;
  - anonymous access disabled;
  - per-device credential `gw-000001`;
  - consumer credential `pinlab-ingest`;
  - topic ACLs;
  - persistence, restart policy, bounded logs.
- Host exposure: `127.0.0.1:1883` and `127.0.0.1:9001` only.
- WebSocket path tested: `/mqtt`.
- QoS 1 publish/subscribe verified.
- No public plaintext MQTT port is exposed.
- No Cloudflare/DNS route was created.

### Proposed public endpoint — NOT CONFIGURED

`wss://mqtt.pinlab.picopiece.com/mqtt`

Current status: **blocked/not confirmed** because:
- DNS record does not exist;
- no Cloudflare tunnel ingress route exists;
- adding a public route requires CTO approval.

Future route would need:
1. Cloudflare tunnel ingress `mqtt.pinlab.picopiece.com` → `http://127.0.0.1:9001`.
2. Proxied DNS CNAME to the approved tunnel UUID.
3. TLS verification with the Cloudflare-issued certificate; never disable certificate/hostname verification on ESP32.
4. Cloudflare Access or an approved device-auth/access policy.
5. Do not expose port 1883 publicly.

## 3. Shared MQTT contract v1

Schema:
- `backend/app/mqtt/schema/telemetry-v1.schema.json`
- Simulated sample: `backend/app/mqtt/schema/telemetry-v1.simulated.json`

Topic:

```text
pinlab/v1/gateways/{gateway_id}/telemetry
```

QoS: `1`

Required payload fields:

- `schema_version = 1`
- `gateway_id`
- `battery_slot = 0`
- `message_id`
- `measured_at` (ISO-8601 with timezone)
- `time_quality` (`device_utc`, `gateway_ntp`, `gateway_uptime`, `unknown`)
- `source` (`REAL_BMS` for real data, `SIMULATED` for tests)
- `protocol = PYLON_485`
- `pack_voltage_v`
- `pack_current_a`
- `soc_pct`
- `soh_pct` (nullable)
- `capacity_remaining_ah`
- `capacity_full_ah`
- `cell_voltages_mv` (exactly 16 cells)
- `temperatures_c`

Schema enforces units/range/array size and rejects unknown fields. The consumer rejects `SIMULATED` unless `MQTT_ALLOW_SIMULATED=true` in the development environment.

## 4. Gateway registration and mapping

Manual registration only:

```bash
python -m app.gateway_register \
  --gateway-id GW-000001 \
  --name "DEV Gateway" \
  --organization-id 1 \
  --battery-slot 0 \
  --battery-id 1
```

- Gateway and battery must belong to the same organization.
- Gateway ID, Battery ID, slot and Organization are separate identities.
- Mapping history uses `assigned_at`/`unassigned_at`.
- Ingestion resolves the mapping by `measured_at`, not only current mapping.
- No MQTT client-selected battery IDs.
- Unknown/disabled gateways and unmapped slots are rejected.
- MQTT clients cannot publish for arbitrary gateway IDs because ACLs restrict each device user to its own topic.

Development registration:
`GW-000001` slot 0 → battery ID 1 (`DEMO-MQTT-001`, DEMO/SIMULATED).

## 5. Ingestion service

`backend/app/mqtt_consumer.py`:

- Subscribes `pinlab/v1/gateways/+/telemetry` at QoS 1.
- Verifies topic/payload gateway identity.
- Validates JSON Schema and units.
- Resolves gateway slot using measurement-time mapping history.
- Enforces gateway/battery organization match.
- Deduplicates `(gateway_id, message_id)` via DB unique constraint.
- Stores `measured_at` and `received_at` separately.
- Stores raw telemetry, including 16 cell voltages, temperatures and nullable SOH.
- Reconnects after broker restart.
- Logs rejected/failed persistence; it does not claim DB success from MQTT PUBACK.
- MQTT QoS 1 is not application-level durable ACK; durable flash-queue ACK remains backlog.

## 6. PostgreSQL migration

Migration:

`backend/alembic/versions/e5f6a7b8c9d0_mqtt_gateway_telemetry.py`

New tables:

- `gateways`
- `gateway_battery_assignments`
- `telemetry_samples`

Existing tables are not modified. No production migration applied.

Development PostgreSQL was migrated from empty through:

`5e56d69bbfb0 → a1b2c3d4e5f6 → b7f3a1c9d2e4 → c9d8e7f6a5b4 → e5f6a7b8c9d0`

### Retention

`backend/app/retention.py` implements dry-run by default; `--apply` deletes only `telemetry_samples` with `measured_at < now - 7 days`.

Tested on isolated dev data:

- 5 samples before retention; 1 older than 7 days.
- Dry run: `expired_samples=1 apply=False`.
- Apply: `deleted=1`.
- 4 recent samples retained.
- `DEMO-MQTT-001` battery and gateway assignment retained.
- No Passport/inspection/warranty/ownership history is targeted by retention.

## 7. Development tests

### Unit/regression

- Backend pytest with MQTT tests: **44/44 PASS**.
- New tests cover:
  - schema validation;
  - valid persistence;
  - duplicate handling;
  - unknown gateway/topic mismatch;
  - invalid payload;
  - historical assignment lookup;
  - 7-day retention and battery preservation.

### Broker integration

- Broker authentication: correct credentials accepted; wrong password and anonymous rejected (`Connection Refused: not authorised`).
- WebSocket transport: PASS (`ws://127.0.0.1:9001/mqtt`, paho).
- QoS 1 publish: PASS.
- Valid telemetry persisted: PASS.
- Duplicate message: same row, no second row.
- Invalid 15-cell payload: rejected.
- Unknown/non-authorized topic: ACL prevents non-device publishing.
- Broker restart: consumer reconnected; next message persisted.
- Consumer restart: reconnected; next message persisted.
- No credentials appeared in service logs.
- No real hardware claim: all integration messages used `source=SIMULATED`.

## 8. ESP32 handoff

- **Broker URI:** `wss://mqtt.pinlab.picopiece.com/mqtt` — **proposed, blocked pending CTO Cloudflare/DNS approval**.
- **Actual verified dev endpoint:** WebSocket `ws://127.0.0.1:9001/mqtt`, loopback-only; not reachable by ESP32.
- **TLS:** production WSS must verify the Cloudflare/public CA and hostname; never disable certificate verification.
- **Client ID:** `gw-000001` for development.
- **Username:** `gw-000001`.
- **Topic:** `pinlab/v1/gateways/GW-000001/telemetry`.
- **QoS:** 1.
- **Credential provisioning:** generate per-device Mosquitto user/password via approved secret channel; never commit or print. Device ACL only allows write to its own topic.
- **Gateway ID:** `GW-000001` registered in dev with slot 0 → `DEMO-MQTT-001`.
- **Rates:** BMS poll 5s, publish 10s, heartbeat 60s; heartbeat/schema extension remains to be implemented/validated by ESP32 Agent.
- **Schema:** `backend/app/mqtt/schema/telemetry-v1.schema.json`; simulated sample alongside.

### Blocker for real device integration

Public WSS is not available yet. Do not point ESP32 at localhost or an unapproved route. Need CTO approval for:
- `mqtt.pinlab.picopiece.com` DNS and Cloudflare tunnel route to `127.0.0.1:9001`;
- access policy for device connections;
- certificate/credential handoff.

## 9. Rollback

- Stop only the dev stack: `docker compose -p pinlab-mqtt-dev down` (does not touch production).
- Development DB migration downgrade is possible on the isolated dev DB; no production downgrade.
- Remove dev volumes only with explicit approval; they contain synthetic test data.
- Do not run retention `--apply` against production without CTO approval and a production backup.

## 10. Verification status

- Infrastructure audit: PASS.
- Dev Mosquitto auth/ACL: PASS.
- WebSocket/QoS1: PASS.
- Schema validation: PASS.
- Postgres persistence/dedup: PASS.
- Reconnect tests: PASS.
- Retention dry-run/apply on dev: PASS.
- Real ESP32 telemetry: **not tested**.
- Public WSS endpoint: **blocked/not configured**.
