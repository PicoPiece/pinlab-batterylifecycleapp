"""PinLab MQTT telemetry consumer (development/pilot service).

This process subscribes to gateway telemetry and commits validated samples to
PostgreSQL. MQTT QoS 1 is transport-level delivery only; it is not a durable
application/DB acknowledgment. Failed DB writes are logged and are not reported
as stored.
"""
import json
import logging
import re
import signal
import ssl

import paho.mqtt.client as mqtt

from app.config import settings
from app.database import SessionLocal
from app.mqtt.ingest import GatewayRejected, PayloadRejected, ingest_telemetry

TOPIC_PATTERN = re.compile(r"^pinlab/v1/gateways/([^/]+)/telemetry$")
TOPIC_FILTER = "pinlab/v1/gateways/+/telemetry"
QOS = 1

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("pinlab.mqtt")


def _on_connect(client, userdata, flags, reason_code, properties):
    if reason_code != 0:
        logger.error("MQTT connection failed reason=%s", reason_code)
        return
    client.subscribe(TOPIC_FILTER, qos=QOS)
    logger.info("MQTT subscribed topic=%s qos=%s", TOPIC_FILTER, QOS)


def _on_disconnect(client, userdata, flags, reason_code, properties):
    logger.warning("MQTT disconnected reason=%s; paho will reconnect", reason_code)


def _on_message(client, userdata, message):
    match = TOPIC_PATTERN.match(message.topic)
    if not match:
        logger.warning("Ignoring unauthorized topic")
        return
    gateway_id = match.group(1)
    if len(message.payload) > settings.mqtt_max_payload_bytes:
        logger.warning("Rejected oversized payload gateway=%s bytes=%s", gateway_id, len(message.payload))
        return
    try:
        payload = json.loads(message.payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        logger.warning("Rejected non-JSON payload gateway=%s", gateway_id)
        return
    try:
        with SessionLocal() as db:
            result = ingest_telemetry(
                db,
                topic_gateway_id=gateway_id,
                payload=payload,
                allow_simulated=settings.mqtt_allow_simulated,
            )
    except (GatewayRejected, PayloadRejected) as exc:
        logger.warning("Rejected telemetry gateway=%s reason=%s", gateway_id, exc)
        return
    except Exception:
        logger.exception("Database persistence failed gateway=%s message_id=%s", gateway_id, payload.get("message_id"))
        return
    logger.info(
        "Telemetry %s gateway=%s message_id=%s sample_id=%s battery_id=%s",
        result.status,
        result.gateway_id,
        payload.get("message_id"),
        result.sample_id,
        result.battery_id,
    )


def main() -> None:
    if not settings.mqtt_username or not settings.mqtt_password:
        raise SystemExit("MQTT_USERNAME and MQTT_PASSWORD are required")
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=settings.mqtt_client_id,
        protocol=mqtt.MQTTv311,
        transport="websockets" if settings.mqtt_transport == "websockets" else "tcp",
    )
    client.username_pw_set(settings.mqtt_username, settings.mqtt_password)
    if settings.mqtt_transport == "websockets":
        client.ws_set_options(path=settings.mqtt_websocket_path)
    if settings.mqtt_tls:
        client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
    client.reconnect_delay_set(min_delay=1, max_delay=60)
    client.on_connect = _on_connect
    client.on_disconnect = _on_disconnect
    client.on_message = _on_message
    signal.signal(signal.SIGTERM, lambda *_: client.disconnect())
    logger.info("Connecting MQTT transport=%s host=%s port=%s", settings.mqtt_transport, settings.mqtt_broker_host, settings.mqtt_broker_port)
    client.connect(settings.mqtt_broker_host, settings.mqtt_broker_port, keepalive=30)
    client.loop_forever(retry_first_connection=True)


if __name__ == "__main__":
    main()
