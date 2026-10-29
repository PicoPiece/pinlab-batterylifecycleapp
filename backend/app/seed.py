from datetime import date, datetime, timedelta, timezone

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


def measurement(metric: str, value: float, unit: str, age_minutes: int = 10) -> dict:
    return {"metric": metric, "value": value, "unit": unit, "age_minutes": age_minutes}


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
        "received_at": date(2025, 3, 12),
        "notes": "DEMO/SIMULATED — dữ liệu mẫu, không phải thông số đo thực tế.",
        "measurements": [
            measurement("soc", 72, "%", 9),
            measurement("soh", 94, "%", 9),
            measurement("voltage", 398.6, "V", 9),
            measurement("current", -18.4, "A", 9),
            measurement("temperature", 29.1, "°C", 9),
        ],
        "inspection": {
            "test_type": "Visual + insulation check (DEMO)",
            "result": InspectionResult.passed,
            "days_ago": 1,
            "measured_parameters": {"visual": "ok", "insulation": "pass"},
            "notes": "DEMO/SIMULATED — không phải kết quả kiểm định thực tế.",
        },
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
        "received_at": date(2024, 6, 18),
        "notes": "DEMO/SIMULATED — cấu hình minh họa, chưa nghiệm thu.",
        "measurements": [
            measurement("soc", 46, "%", 6),
            measurement("soh", 81, "%", 6),
            measurement("voltage", 792.4, "V", 6),
            measurement("current", -42.1, "A", 6),
            measurement("temperature", 41.8, "°C", 6),
        ],
        "inspection": {
            "test_type": "Thermal imaging follow-up",
            "result": InspectionResult.conditional,
            "days_ago": 3,
            "measured_parameters": {"max_cell_temperature": "41.8 °C", "visual": "attention"},
            "notes": "DEMO/SIMULATED — cần kiểm tra nhiệt độ, chưa có kết luận.",
        },
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
        "received_at": date(2023, 2, 4),
        "notes": "DEMO/SIMULATED — dữ liệu mẫu cho second-life.",
        "measurements": [
            measurement("soc", 64, "%", 31),
            measurement("soh", 78, "%", 31),
            measurement("voltage", 47.8, "V", 31),
            measurement("current", -8.2, "A", 31),
            measurement("temperature", 27.4, "°C", 31),
        ],
        "inspection": {
            "test_type": "Second-life evaluation",
            "result": InspectionResult.inconclusive,
            "days_ago": 2,
            "measured_parameters": {"soh_note": "manual review required"},
            "notes": "DEMO/SIMULATED — warranty preview only, không có quyết định.",
        },
    },
    {
        "asset_id": "DEMO-LFP-002",
        "serial_number": "SIM-LFP-0002",
        "manufacturer": "DEMO Manufacturer",
        "model": "Rack module",
        "chemistry": "LFP",
        "nominal_voltage_v": 48,
        "nominal_capacity_ah": 200,
        "initial_energy_kwh": 9.6,
        "status": BatteryStatus.in_service,
        "specification_status": SpecificationStatus.confirmed,
        "source": "DEMO/SIMULATED",
        "received_at": date(2025, 1, 20),
        "notes": "DEMO/SIMULATED — dữ liệu rack mẫu.",
        "measurements": [
            measurement("soc", 81, "%", 11),
            measurement("soh", 96, "%", 11),
            measurement("voltage", 52.1, "V", 11),
            measurement("current", 12.3, "A", 11),
            measurement("temperature", 26.8, "°C", 11),
        ],
        "inspection": {
            "test_type": "Annual capacity test (DEMO)",
            "result": InspectionResult.passed,
            "days_ago": 21,
            "measured_parameters": {"capacity_ah": "196"},
            "notes": "DEMO/SIMULATED — annual test sample.",
        },
    },
    {
        "asset_id": "DEMO-NMC-004",
        "serial_number": "SIM-NMC-0004",
        "manufacturer": "DEMO Manufacturer",
        "model": "Spare pack",
        "chemistry": "NMC",
        "nominal_voltage_v": 72,
        "nominal_capacity_ah": 120,
        "initial_energy_kwh": 8.6,
        "status": BatteryStatus.available,
        "specification_status": SpecificationStatus.partial,
        "source": "DEMO/SIMULATED",
        "received_at": date(2024, 11, 2),
        "notes": "DEMO/SIMULATED — spare pack sample.",
        "measurements": [
            measurement("soc", 48, "%", 510),
            measurement("soh", 89, "%", 510),
            measurement("voltage", 71.2, "V", 510),
            measurement("current", 0, "A", 510),
            measurement("temperature", 24.5, "°C", 510),
        ],
        "inspection": {
            "test_type": "Storage check (DEMO)",
            "result": InspectionResult.passed,
            "days_ago": 40,
            "measured_parameters": {"visual": "ok"},
            "notes": "DEMO/SIMULATED — storage sample.",
        },
    },
    {
        "asset_id": "DEMO-LFP-005",
        "serial_number": "SIM-LFP-0005",
        "manufacturer": "DEMO Manufacturer",
        "model": "Rack module",
        "chemistry": "LFP",
        "nominal_voltage_v": 48,
        "nominal_capacity_ah": 200,
        "initial_energy_kwh": 9.6,
        "status": BatteryStatus.in_service,
        "specification_status": SpecificationStatus.confirmed,
        "source": "DEMO/SIMULATED",
        "received_at": date(2025, 2, 15),
        "notes": "DEMO/SIMULATED — dữ liệu rack mẫu.",
        "measurements": [
            measurement("soc", 67, "%", 19),
            measurement("soh", 93, "%", 19),
            measurement("voltage", 51.8, "V", 19),
            measurement("current", -14.6, "A", 19),
            measurement("temperature", 28.2, "°C", 19),
        ],
        "inspection": {
            "test_type": "Visual inspection (DEMO)",
            "result": InspectionResult.passed,
            "days_ago": 35,
            "measured_parameters": {"visual": "ok"},
            "notes": "DEMO/SIMULATED — visual sample.",
        },
    },
    {
        "asset_id": "DEMO-BESS-006",
        "serial_number": "SIM-BESS-0006",
        "manufacturer": "DEMO Manufacturer",
        "model": "BESS module",
        "chemistry": "LFP",
        "nominal_voltage_v": 800,
        "nominal_capacity_ah": 280,
        "initial_energy_kwh": 220,
        "status": BatteryStatus.in_service,
        "specification_status": SpecificationStatus.confirmed,
        "source": "DEMO/SIMULATED",
        "received_at": date(2024, 8, 5),
        "notes": "DEMO/SIMULATED — BESS sample.",
        "measurements": [
            measurement("soc", 76, "%", 14),
            measurement("soh", 91, "%", 14),
            measurement("voltage", 798.1, "V", 14),
            measurement("current", -21.0, "A", 14),
            measurement("temperature", 31.2, "°C", 14),
        ],
        "inspection": {
            "test_type": "Thermal imaging (DEMO)",
            "result": InspectionResult.passed,
            "days_ago": 14,
            "measured_parameters": {"max_cell_temperature": "31.2 °C"},
            "notes": "DEMO/SIMULATED — thermal sample.",
        },
    },
    {
        "asset_id": "DEMO-LFP-007",
        "serial_number": "SIM-LFP-0007",
        "manufacturer": "DEMO Manufacturer",
        "model": "Rack module",
        "chemistry": "LFP",
        "nominal_voltage_v": 48,
        "nominal_capacity_ah": 200,
        "initial_energy_kwh": 9.6,
        "status": BatteryStatus.available,
        "specification_status": SpecificationStatus.confirmed,
        "source": "DEMO/SIMULATED",
        "received_at": date(2025, 4, 2),
        "notes": "DEMO/SIMULATED — partial telemetry sample.",
        "measurements": [
            measurement("soh", 90, "%", 60),
            measurement("voltage", 52.0, "V", 60),
        ],
        "inspection": {
            "test_type": "Visual inspection (DEMO)",
            "result": InspectionResult.passed,
            "days_ago": 9,
            "measured_parameters": {"visual": "ok"},
            "notes": "DEMO/SIMULATED — visual sample.",
        },
    },
    {
        "asset_id": "DEMO-NMC-008",
        "serial_number": "SIM-NMC-0008",
        "manufacturer": "DEMO Manufacturer",
        "model": "Second-life module",
        "chemistry": "NMC",
        "nominal_voltage_v": 48,
        "nominal_capacity_ah": 100,
        "initial_energy_kwh": 4.8,
        "status": BatteryStatus.received,
        "specification_status": SpecificationStatus.unknown,
        "source": "DEMO/SIMULATED",
        "received_at": date(2026, 9, 20),
        "notes": "DEMO/SIMULATED — chưa có measurement.",
        "measurements": [],
        "inspection": None,
    },
    {
        "asset_id": "DEMO-BESS-009",
        "serial_number": "SIM-BESS-0009",
        "manufacturer": "DEMO Manufacturer",
        "model": "BESS module",
        "chemistry": "LFP",
        "nominal_voltage_v": 800,
        "nominal_capacity_ah": 280,
        "initial_energy_kwh": 220,
        "status": BatteryStatus.quarantined,
        "specification_status": SpecificationStatus.partial,
        "source": "DEMO/SIMULATED",
        "received_at": date(2024, 4, 10),
        "notes": "DEMO/SIMULATED — pack đang cách ly.",
        "measurements": [
            measurement("soc", 33, "%", 4),
            measurement("soh", 72, "%", 4),
            measurement("voltage", 780.4, "V", 4),
            measurement("current", -50.0, "A", 4),
            measurement("temperature", 38.5, "°C", 4),
        ],
        "inspection": {
            "test_type": "Quarantine inspection (DEMO)",
            "result": InspectionResult.failed,
            "days_ago": 1,
            "measured_parameters": {"visual": "swelling suspected"},
            "notes": "DEMO/SIMULATED — quarantine sample, no production decision.",
        },
    },
    {
        "asset_id": "DEMO-LFP-010",
        "serial_number": "SIM-LFP-0010",
        "manufacturer": "DEMO Manufacturer",
        "model": "Rack module",
        "chemistry": "LFP",
        "nominal_voltage_v": 48,
        "nominal_capacity_ah": 200,
        "initial_energy_kwh": 9.6,
        "status": BatteryStatus.in_service,
        "specification_status": SpecificationStatus.confirmed,
        "source": "DEMO/SIMULATED",
        "received_at": date(2025, 5, 6),
        "notes": "DEMO/SIMULATED — healthy sample.",
        "measurements": [
            measurement("soc", 88, "%", 7),
            measurement("soh", 97, "%", 7),
            measurement("voltage", 52.4, "V", 7),
            measurement("current", 3.2, "A", 7),
            measurement("temperature", 25.9, "°C", 7),
        ],
        "inspection": {
            "test_type": "Visual inspection (DEMO)",
            "result": InspectionResult.passed,
            "days_ago": 7,
            "measured_parameters": {"visual": "ok"},
            "notes": "DEMO/SIMULATED — visual sample.",
        },
    },
    {
        "asset_id": "DEMO-SECOND-011",
        "serial_number": "SIM-SECOND-0011",
        "manufacturer": "DEMO Manufacturer",
        "model": "Second-life module",
        "chemistry": "NMC",
        "nominal_voltage_v": 48,
        "nominal_capacity_ah": 100,
        "initial_energy_kwh": 4.8,
        "status": BatteryStatus.second_life,
        "specification_status": SpecificationStatus.confirmed,
        "source": "DEMO/SIMULATED",
        "received_at": date(2023, 7, 11),
        "notes": "DEMO/SIMULATED — second-life sample.",
        "measurements": [
            measurement("soc", 55, "%", 22),
            measurement("soh", 76, "%", 22),
            measurement("voltage", 47.2, "V", 22),
            measurement("current", -5.5, "A", 22),
            measurement("temperature", 30.1, "°C", 22),
        ],
        "inspection": {
            "test_type": "Second-life evaluation (DEMO)",
            "result": InspectionResult.conditional,
            "days_ago": 5,
            "measured_parameters": {"soh_note": "review required"},
            "notes": "DEMO/SIMULATED — second-life sample.",
        },
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
    now = datetime.now(timezone.utc)
    for item in DEMO_BATTERIES:
        existing = db.scalar(select(Battery).where(Battery.asset_id == item["asset_id"]))
        if existing:
            continue
        measurements = item.get("measurements", [])
        inspection_data = item.get("inspection")
        battery_data = {key: value for key, value in item.items() if key not in ("measurements", "inspection")}
        battery = Battery(**battery_data, created_by_id=admin.id, updated_by_id=admin.id)
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
        if inspection_data:
            inspected_at = now - timedelta(days=inspection_data["days_ago"])
            inspection = Inspection(
                battery_id=battery.id,
                test_type=inspection_data["test_type"],
                inspected_at=inspected_at,
                technician_id=admin.id,
                measured_parameters=inspection_data["measured_parameters"],
                result=inspection_data["result"],
                notes=inspection_data["notes"],
                created_by_id=admin.id,
            )
            db.add(inspection)
            record_event(
                db,
                battery_id=battery.id,
                event_type=LifecycleEventType.inspected,
                actor_id=admin.id,
                notes="DEMO/SIMULATED — inspection mẫu",
                metadata={"demo": True},
                event_at=inspected_at,
            )
        for measurement_data in measurements:
            db.add(
                Measurement(
                    battery_id=battery.id,
                    metric=MeasurementMetric(measurement_data["metric"]),
                    value=measurement_data["value"],
                    unit=measurement_data["unit"],
                    source=MeasurementSource.mock,
                    quality=MeasurementQuality.estimated,
                    measured_at=now - timedelta(minutes=measurement_data["age_minutes"]),
                    notes="SIMULATED — dữ liệu mẫu, không phải đo thực tế.",
                    created_by_id=admin.id,
                )
            )
    db.commit()
    print(f"Demo data seeded: {len(DEMO_BATTERIES)} assets (SIMULATED).")


def main() -> None:
    with SessionLocal() as db:
        admin = ensure_admin(db)
        seed_demo(db, admin)


if __name__ == "__main__":
    main()
