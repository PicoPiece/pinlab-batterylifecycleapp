"""organization tenancy schema and demo ownership mapping

Revision ID: b7f3a1c9d2e4
Revises: a1b2c3d4e5f6
Create Date: 2026-10-31

P0-A only: schema and deterministic demo-asset mapping. Endpoint authorization
is intentionally not changed in this migration.

Mapping rule:
- Create one `PinLab Internal` organization.
- Map only batteries whose asset_id starts with `DEMO-` to that organization.
- Leave all other batteries NULL for manual ownership review.
- Do not auto-create user memberships or assignments.

Downgrade removes the new schema and the newly-added ownership mapping. Take a
backup before any future production downgrade.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7f3a1c9d2e4"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("pinlab", "agency", name="organizationkind", native_enum=False, length=16),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)

    op.create_table(
        "organization_memberships",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "pinlab_manager",
                "pinlab_technician",
                "agency_admin",
                "agency_technician",
                "viewer",
                name="organizationrole",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "organization_id", name="uq_organization_memberships_user_org"),
    )
    op.create_index("ix_organization_memberships_user_id", "organization_memberships", ["user_id"], unique=False)
    op.create_index(
        "ix_organization_memberships_organization_id",
        "organization_memberships",
        ["organization_id"],
        unique=False,
    )

    with op.batch_alter_table("batteries") as batch_op:
        batch_op.add_column(sa.Column("organization_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_batteries_organization_id",
            "organizations",
            ["organization_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch_op.create_index("ix_batteries_organization_id", ["organization_id"], unique=False)

    op.create_table(
        "battery_assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("battery_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("assigned_by_id", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["battery_id"], ["batteries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("battery_id", "user_id", name="uq_battery_assignments_battery_user"),
    )
    op.create_index("ix_battery_assignments_battery_id", "battery_assignments", ["battery_id"], unique=False)
    op.create_index("ix_battery_assignments_user_id", "battery_assignments", ["user_id"], unique=False)

    # Deterministic demo mapping only. Never infer ownership for non-DEMO rows.
    op.execute(
        sa.text(
            "INSERT INTO organizations (slug, name, kind, is_active, created_at, updated_at) "
            "SELECT 'pinlab-internal', 'PinLab Internal', 'pinlab', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP "
            "WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'pinlab-internal')"
        )
    )
    op.execute(
        sa.text(
            "UPDATE batteries "
            "SET organization_id = (SELECT id FROM organizations WHERE slug = 'pinlab-internal') "
            "WHERE organization_id IS NULL AND asset_id LIKE 'DEMO-%'"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_battery_assignments_user_id", table_name="battery_assignments")
    op.drop_index("ix_battery_assignments_battery_id", table_name="battery_assignments")
    op.drop_table("battery_assignments")

    with op.batch_alter_table("batteries") as batch_op:
        batch_op.drop_index("ix_batteries_organization_id")
        batch_op.drop_constraint("fk_batteries_organization_id", type_="foreignkey")
        batch_op.drop_column("organization_id")

    op.drop_index("ix_organization_memberships_organization_id", table_name="organization_memberships")
    op.drop_index("ix_organization_memberships_user_id", table_name="organization_memberships")
    op.drop_table("organization_memberships")
    op.drop_index("ix_organizations_slug", table_name="organizations")
    op.drop_table("organizations")
