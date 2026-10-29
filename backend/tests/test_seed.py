from sqlalchemy import func, select

from app.models import Battery
from app.seed import seed_demo


def test_seed_is_idempotent_and_preserves_existing_assets(db, admin):
    existing_rows = [
        ("DEMO-VF5-001", "PRODUCTION-KEEP-VF5"),
        ("DEMO-BESS-001", "PRODUCTION-KEEP-BESS"),
        ("DEMO-SECOND-001", "PRODUCTION-KEEP-SECOND"),
    ]
    for asset_id, notes in existing_rows:
        db.add(
            Battery(
                asset_id=asset_id,
                notes=notes,
                created_by_id=admin.id,
                updated_by_id=admin.id,
            )
        )
    db.commit()

    seed_demo(db, admin)
    count_once = db.scalar(select(func.count()).select_from(Battery))
    assert count_once == 12
    for asset_id, notes in existing_rows:
        battery = db.scalar(select(Battery).where(Battery.asset_id == asset_id))
        assert battery is not None
        assert battery.notes == notes

    seed_demo(db, admin)
    count_twice = db.scalar(select(func.count()).select_from(Battery))
    assert count_twice == count_once == 12
    for asset_id, notes in existing_rows:
        battery = db.scalar(select(Battery).where(Battery.asset_id == asset_id))
        assert battery is not None
        assert battery.notes == notes
