from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import (
    Battery,
    BatteryStatus,
    Inspection,
    InspectionResult,
    LifecycleEventType,
    Measurement,
    MeasurementMetric,
    MeasurementQuality,
    MeasurementSource,
    SpecificationStatus,
    User,
    UserRole,
)
from app.security import hash_password
from app.services.audit import record_event


DEMO_BATTERIES = [
    {
        "asset_id": "DEMO-VF5-001",
        "serial_number": "SIM-VF5-0001",
        "manufacturer": "DEMO Manufacturer",
        "model": "VF5 pack",
        "chemistry": "LFP",
        "nominal_voltage_v": 400,
        "nominal_capacity_ah": 150,
        "initial_energy_kwh": 60,
        "status": BatteryStatus.tested,
        "specification_status": SpecificationStatus.partial,
        "source": "DEMO/SIMULATED",
        "notes": "DEMO/SIMULATED — dữ liệu mẫu, không phải thông số đo thực tế.",
    },
    {
        "asset_id": "DEMO-BESS-001",
        "serial_number": "SIM-BESS-0001",
        "manufacturer": "DEMO Manufacturer",
        "model": "BESS module",
        "chemistry": "LFP",
        "nominal_voltage_v": 800,
        "nominal_capacity_ah": 280,
        "initial_energy_kwh": 220,
        "status": BatteryStatus.in_service,
        "specification_status": SpecificationStatus.unknown,
        "source": "DEMO/SIMULATED",
        "notes": "DEMO/SIMULATED — cấu hình minh họa, chưa nghiệm thu.",
    },
    {
        "asset_id": "DEMO-SECOND-001",
        "serial_number": "SIM-SECOND-0001",
        "manufacturer": "DEMO Manufacturer",
        "model": "Second-life module",
        "chemistry": "NMC",
        "nominal_voltage_v": 48,
        "nominal_capacity_ah": 100,
        "initial_energy_kwh": 4.8,
        "status": BatteryStatus.second_life,
        "specification_status": SpecificationStatus.confirmed,
        "source": "DEMO/SIMULATED",
        "notes": "DEMO/SIMULATED — dữ liệu mẫu cho second-life.",
    },
]


def ensure_admin(db: Session) -> User:
    existing = db.scalar(select(User).where(User.role == UserRole.admin))
    if existing:
        return existing
    if not settings.admin_email or not settings.admin_password:
        raise SystemExit("Thiếu ADMIN_EMAIL/ADMIN_PASSWORD để tạo admin đầu tiên")
    if len(settings.admin_password) < 8:
        raise SystemExit("ADMIN_PASSWORD phải có ít nhất 8 ký tự")
    admin = User(
        email=settings.admin_email.lower(),
        full_name="PinLab Administrator",
        hashed_password=hash_password(settings.admin_password),
        role=UserRole.admin,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    print(f"Created admin: {admin.email}")
    return admin


def seed_demo(db: Session, admin: User) -> None:
    for item in DEMO_BATTERIES:
        existing = db.scalar(select(Battery).where(Battery.asset_id == item["asset_id"]))
        if existing:
            continue
        battery = Battery(**item, created_by_id=admin.id, updated_by_id=admin.id)
        db.add(battery)
        db.flush()
        record_event(
            db,
            battery_id=battery.id,
            event_type=LifecycleEventType.received,
            actor_id=admin.id,
            notes="DEMO/SIMULATED — seed pin mẫu",
            metadata={"demo": True},
        )
        record_event(
            db,
            battery_id=battery.id,
            event_type=LifecycleEventType.inspected,
            actor_id=admin.id,
            notes="DEMO/SIMULATED — inspection mẫu",
            metadata={"demo": True},
        )
        db.add(
            Inspection(
                battery_id=battery.id,
                test_type="Visual + insulation check (DEMO)",
                technician_id=admin.id,
                measured_parameters={"note": "SIMULATED", "visual": "ok"},
                result=InspectionResult.passed,
                notes="DEMO/SIMULATED — không phải kết quả kiểm định thực tế.",
                created_by_id=admin.id,
            )
        )
        db.add_all(
            [
                Measurement(
                    battery_id=battery.id,
                    metric=MeasurementMetric.soc,
                    value=72,
                    unit="%",
                    source=MeasurementSource.mock,
                    quality=MeasurementQuality.estimated,
                    notes="SIMULATED — dữ liệu mẫu, không phải đo thực tế.",
                    created_by_id=admin.id,
                ),
                Measurement(
                    battery_id=battery.id,
                    metric=MeasurementMetric.soh,
                    value=88,
                    unit="%",
                    source=MeasurementSource.mock,
                    quality=MeasurementQuality.estimated,
                    notes="SIMULATED — dữ liệu mẫu, không phải đo thực tế.",
                    created_by_id=admin.id,
                ),
            ]
        )
    db.commit()
    print("Demo data seeded (SIMULATED).")


def main() -> None:
    with SessionLocal() as db:
        admin = ensure_admin(db)
        seed_demo(db, admin)


if __name__ == "__main__":
    main()
