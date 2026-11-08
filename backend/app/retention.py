"""Seven-day raw telemetry retention job.

Only the new telemetry_samples table is touched. Passport, inspection,
warranty, ownership and gateway assignment records are never deleted here.
"""
import argparse
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select

from app.config import settings
from app.database import SessionLocal
from app.models import TelemetrySample


def expire_telemetry(db, *, days: int, apply: bool = False) -> tuple[datetime, int]:
    if days < 1:
        raise ValueError("days must be >= 1")
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    count = db.scalar(
        select(func.count()).select_from(TelemetrySample).where(TelemetrySample.measured_at < cutoff)
    ) or 0
    if apply and count:
        db.execute(delete(TelemetrySample).where(TelemetrySample.measured_at < cutoff))
        db.commit()
    return cutoff, int(count)


def main() -> None:
    parser = argparse.ArgumentParser(description="PinLab raw telemetry retention")
    parser.add_argument("--days", type=int, default=settings.telemetry_retention_days)
    parser.add_argument("--apply", action="store_true", help="delete expired rows; default is dry-run")
    args = parser.parse_args()
    with SessionLocal() as db:
        try:
            cutoff, count = expire_telemetry(db, days=args.days, apply=args.apply)
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        print(f"cutoff={cutoff.isoformat()} expired_samples={count} apply={args.apply}")
        if args.apply and count:
            print(f"deleted={count}")


if __name__ == "__main__":
    main()
