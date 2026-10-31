"""security audit events for scoped administrative operations

Revision ID: c9d8e7f6a5b4
Revises: b7f3a1c9d2e4
Create Date: 2026-10-31

Adds an append-only audit table for organization/membership/assignment and
cross-tenant operations. Existing endpoints are unchanged.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d8e7f6a5b4"
down_revision: Union[str, None] = "b7f3a1c9d2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "security_audit_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("target_type", sa.String(length=40), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("event_metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_security_audit_events_actor_id", "security_audit_events", ["actor_id"], unique=False)
    op.create_index(
        "ix_security_audit_events_organization_id",
        "security_audit_events",
        ["organization_id"],
        unique=False,
    )
    op.create_index("ix_security_audit_events_action", "security_audit_events", ["action"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_security_audit_events_action", table_name="security_audit_events")
    op.drop_index("ix_security_audit_events_organization_id", table_name="security_audit_events")
    op.drop_index("ix_security_audit_events_actor_id", table_name="security_audit_events")
    op.drop_table("security_audit_events")
