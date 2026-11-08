"""Manual gateway/battery registration CLI for the MQTT pilot."""
import argparse
from datetime import datetime

from app.database import SessionLocal
from app.mqtt.registry import RegistryError, assign_battery, register_gateway


def main() -> None:
    parser = argparse.ArgumentParser(description="Register a PinLab MQTT gateway and slot mapping")
    parser.add_argument("--gateway-id", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--organization-id", required=True, type=int)
    parser.add_argument("--battery-slot", type=int, default=0)
    parser.add_argument("--battery-id", required=True, type=int)
    parser.add_argument("--assigned-at", help="ISO-8601 timestamp; defaults to now UTC")
    args = parser.parse_args()
    assigned_at = None
    if args.assigned_at:
        assigned_at = datetime.fromisoformat(args.assigned_at.replace("Z", "+00:00"))
    with SessionLocal() as db:
        try:
            gateway = register_gateway(
                db,
                gateway_id=args.gateway_id,
                name=args.name,
                organization_id=args.organization_id,
            )
            assignment = assign_battery(
                db,
                gateway_id=args.gateway_id,
                battery_slot=args.battery_slot,
                battery_id=args.battery_id,
                assigned_at=assigned_at,
            )
        except RegistryError as exc:
            raise SystemExit(f"Registration rejected: {exc}") from exc
    print(
        f"gateway={gateway.gateway_id} id={gateway.id} org={gateway.organization_id} "
        f"slot={assignment.battery_slot} battery={assignment.battery_id}"
    )


if __name__ == "__main__":
    main()
