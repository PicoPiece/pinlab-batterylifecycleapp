# MQTT Development Stack (Mission 017)

This stack is isolated from the production PinLab app. It uses its own
PostgreSQL volume/database and its own Mosquitto broker. It does not modify
Cloudflare, production DNS, production containers or production PostgreSQL.

## Start

1. Copy `.env.example` to `.env` and set local-only development secrets.
2. Run `./generate-credentials.sh`.
3. Run `docker compose up -d --build db broker`.
4. Run migrations with the dev backend image.
5. Register a gateway and start `ingest`.

Plain MQTT `1883` and WebSocket `9001` are bound to **127.0.0.1 only**. No
public endpoint exists yet. The proposed `wss://mqtt.pinlab.picopiece.com/mqtt`
requires a CTO-approved Cloudflare tunnel/route and DNS change; it is not
configured by this mission.

## Gateway registration

Use `python -m app.gateway_register` inside the backend image with explicit
organization and battery IDs. Registration is manual; there is no automatic
provisioning or QR pairing.

## Retention

`docker compose --profile tools run --rm retention` performs a dry-run by
default. Deletion requires `--apply` and explicit CTO approval. Only
`telemetry_samples` expires; Passport and business records are not touched.
