"""P0-A migration rehearsal tests.

These tests run against a throwaway SQLite database. They do not touch the
application test DB, QA DB or production.
"""
import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.config import settings


BACKEND = Path(__file__).resolve().parents[1]
PRE_ORG_REVISION = "a1b2c3d4e5f6"


def _alembic_config(db_path: Path) -> Config:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    return config


def _seed_pre_org_data(db_path: Path) -> None:
    con = sqlite3.connect(db_path)
    try:
        con.execute(
            "INSERT INTO users "
            "(email, full_name, hashed_password, role, is_active, created_at, "
            "must_change_password, token_version) "
            "VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, 0, 0)",
            ("migration-admin@example.test", "Migration Admin", "hash", "admin"),
        )
        user_id = con.execute("SELECT id FROM users").fetchone()[0]
        for asset_id, status in (("DEMO-MIG-001", "received"), ("REAL-MIG-002", "available")):
            con.execute(
                "INSERT INTO batteries "
                "(asset_id, status, specification_status, is_deleted, created_at, updated_at, "
                "created_by_id, updated_by_id) "
                "VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)",
                (asset_id, status, "unknown", user_id, user_id),
            )
        con.commit()
    finally:
        con.close()


def test_p0a_forward_mapping_and_downgrade_recovery(tmp_path):
    db_path = tmp_path / "p0a-migration.db"
    original_url = settings.database_url
    settings.database_url = f"sqlite:///{db_path}"
    try:
        cfg = _alembic_config(db_path)
        command.upgrade(cfg, PRE_ORG_REVISION)
        _seed_pre_org_data(db_path)
        command.upgrade(cfg, "head")

        con = sqlite3.connect(db_path)
        try:
            org = con.execute(
                "SELECT id, slug, name, kind FROM organizations WHERE slug = 'pinlab-internal'"
            ).fetchone()
            assert org is not None
            assert org[1:] == ("pinlab-internal", "PinLab Internal", "pinlab")

            demo_org = con.execute(
                "SELECT organization_id FROM batteries WHERE asset_id = 'DEMO-MIG-001'"
            ).fetchone()[0]
            real_org = con.execute(
                "SELECT organization_id FROM batteries WHERE asset_id = 'REAL-MIG-002'"
            ).fetchone()[0]
            assert demo_org == org[0]
            assert real_org is None

            tables = {
                row[0]
                for row in con.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
            assert {"organizations", "organization_memberships", "battery_assignments"} <= tables

            # Asset IDs must remain stable through the schema migration.
            assert con.execute(
                "SELECT asset_id FROM batteries ORDER BY asset_id"
            ).fetchall() == [("DEMO-MIG-001",), ("REAL-MIG-002",)]
        finally:
            con.close()

        # Rollback rehearsal: new schema disappears; old asset rows remain.
        command.downgrade(cfg, PRE_ORG_REVISION)
        con = sqlite3.connect(db_path)
        try:
            tables = {
                row[0]
                for row in con.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
            assert "organizations" not in tables
            assert "organization_memberships" not in tables
            assert "battery_assignments" not in tables
            assert con.execute(
                "SELECT asset_id FROM batteries ORDER BY asset_id"
            ).fetchall() == [("DEMO-MIG-001",), ("REAL-MIG-002",)]
            columns = {row[1] for row in con.execute("PRAGMA table_info(batteries)")}
            assert "organization_id" not in columns
        finally:
            con.close()

        # Recovery rehearsal: re-upgrade must recreate the mapping deterministically.
        command.upgrade(cfg, "head")
        con = sqlite3.connect(db_path)
        try:
            assert con.execute(
                "SELECT organization_id IS NOT NULL FROM batteries WHERE asset_id = 'DEMO-MIG-001'"
            ).fetchone()[0] == 1
            assert con.execute(
                "SELECT organization_id IS NULL FROM batteries WHERE asset_id = 'REAL-MIG-002'"
            ).fetchone()[0] == 1
        finally:
            con.close()
    finally:
        settings.database_url = original_url
