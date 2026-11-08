#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="/home/picopiece/PinLab/Projects/BatteryLifecycleApp"
set -a
. "$APP_ROOT/.env"
set +a
DB_URL="postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}"
docker run --rm --network pinlab-app-network \
  -e DATABASE_URL="$DB_URL" \
  -e SECRET_KEY="$APP_SECRET_KEY" \
  -e ENVIRONMENT=production \
  -e COOKIE_SECURE=true \
  -e ENABLE_DOCS=false \
  -e CORS_ORIGINS="https://pinlab-app.picopiece.com" \
  pinlab-app-mqtt-consumer:rc-mqtt-2f068da \
  python -m app.retention --days 7 --apply
