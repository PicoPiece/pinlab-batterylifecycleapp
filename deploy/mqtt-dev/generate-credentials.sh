#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  echo "Create deploy/mqtt-dev/.env from .env.example first." >&2
  exit 2
fi
set -a; . ./.env; set +a
mkdir -p secrets
rm -f secrets/passwd
docker run --rm -v "$PWD/secrets:/secrets" eclipse-mosquitto:2 \
  sh -c "mosquitto_passwd -c -b /secrets/passwd '$MQTT_INGEST_USER' '$MQTT_INGEST_PASSWORD' && mosquitto_passwd -b /secrets/passwd '$MQTT_DEVICE_USER' '$MQTT_DEVICE_PASSWORD'"
chmod 600 secrets/passwd
echo "Generated dev-only Mosquitto credentials."
