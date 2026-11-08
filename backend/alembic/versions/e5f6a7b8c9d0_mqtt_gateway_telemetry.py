"""MQTT gateway registration and raw telemetry

Revision ID: e5f6a7b8c9d0
Revises: c9d8e7f6a5b4
Create Date: 2026-11-08

Adds gateway identity, gateway-to-battery slot assignment history, and the
raw telemetry dataset used by the MQTT ingestion service. Battery Passport,
inspection, warranty, ownership and existing measurement records are untouched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "c9d8e7f6a5b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gateways",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("gateway_id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_gateways_gateway_id", "gateways", ["gateway_id"], unique=True)
    op.create_index("ix_gateways_organization_id", "gateways", ["organization_id"], unique=False)

    op.create_table(
        "gateway_battery_assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("gateway_id", sa.Integer(), nullable=False),
        sa.Column("battery_slot", sa.Integer(), nullable=False),
        sa.Column("battery_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("unassigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["gateway_id"], ["gateways.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["battery_id"], ["batteries.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("gateway_id", "battery_slot", "assigned_at", name="uq_gateway_slot_assigned_at"),
    )
    op.create_index("ix_gateway_battery_assignments_gateway_id", "gateway_battery_assignments", ["gateway_id"], unique=False)
    op.create_index("ix_gateway_battery_assignments_battery_id", "gateway_battery_assignments", ["battery_id"], unique=False)
    op.create_index("ix_gateway_battery_assignment_lookup", "gateway_battery_assignments", ["gateway_id", "battery_slot", "assigned_at", "unassigned_at"], unique=False)

    op.create_table(
        "telemetry_samples",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("gateway_id", sa.Integer(), nullable=False),
        sa.Column("battery_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.String(length=128), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("battery_slot", sa.Integer(), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("time_quality", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("protocol", sa.String(length=32), nullable=False),
        sa.Column("pack_voltage_v", sa.Numeric(10, 3), nullable=False),
        sa.Column("pack_current_a", sa.Numeric(10, 3), nullable=False),
        sa.Column("soc_pct", sa.Numeric(6, 2), nullable=False),
        sa.Column("soh_pct", sa.Numeric(6, 2), nullable=True),
        sa.Column("capacity_remaining_ah", sa.Numeric(10, 3), nullable=False),
        sa.Column("capacity_full_ah", sa.Numeric(10, 3), nullable=False),
        sa.Column("cell_voltages_mv", sa.JSON(), nullable=False),
        sa.Column("temperatures_c", sa.JSON(), nullable=False),
        sa.Column("raw_payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["gateway_id"], ["gateways.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["battery_id"], ["batteries.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("gateway_id", "message_id", name="uq_telemetry_gateway_message"),
    )
    op.create_index("ix_telemetry_samples_gateway_id", "telemetry_samples", ["gateway_id"], unique=False)
    op.create_index("ix_telemetry_samples_battery_id", "telemetry_samples", ["battery_id"], unique=False)
    op.create_index("ix_telemetry_samples_organization_id", "telemetry_samples", ["organization_id"], unique=False)
    op.create_index("ix_telemetry_battery_measured_at", "telemetry_samples", ["battery_id", "measured_at"], unique=False)
    op.create_index("ix_telemetry_org_measured_at", "telemetry_samples", ["organization_id", "measured_at"], unique=False)
    op.create_index("ix_telemetry_measured_at", "telemetry_samples", ["measured_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_telemetry_measured_at", table_name="telemetry_samples")
    op.drop_index("ix_telemetry_org_measured_at", table_name="telemetry_samples")
    op.drop_index("ix_telemetry_battery_measured_at", table_name="telemetry_samples")
    op.drop_index("ix_telemetry_samples_organization_id", table_name="telemetry_samples")
    op.drop_index("ix_telemetry_samples_battery_id", table_name="telemetry_samples")
    op.drop_index("ix_telemetry_samples_gateway_id", table_name="telemetry_samples")
    op.drop_table("telemetry_samples")

    op.drop_index("ix_gateway_battery_assignment_lookup", table_name="gateway_battery_assignments")
    op.drop_index("ix_gateway_battery_assignments_battery_id", table_name="gateway_battery_assignments")
    op.drop_index("ix_gateway_battery_assignments_gateway_id", table_name="gateway_battery_assignments")
    op.drop_table("gateway_battery_assignments")

    op.drop_index("ix_gateways_organization_id", table_name="gateways")
    op.drop_index("ix_gateways_gateway_id", table_name="gateways")
    op.drop_table("gateways")
