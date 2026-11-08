"""Battery Passport classification

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-11-08

Adds the authoritative Battery Passport classification introduced by Mission
018.1. The column is nullable so unknown historical records remain explicitly
unclassified instead of being silently treated as demo or real.

The explicit inventory below is the reviewed production inventory documented in
``docs/MISSION018_1_CLASSIFICATION_INVENTORY.md``. It contains exact asset IDs,
not prefix matching. Any future asset must be classified through the authorized
admin API or a separately reviewed inventory.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INITIAL_REAL_ASSETS = ("PL-APESS-0001",)

INITIAL_DEMO_ASSETS = (
    "DEMO-VF5-001",
    "DEMO-BESS-001",
    "DEMO-SECOND-001",
    "E2E-CHECK-001",
    "DEMO-LFP-002",
    "DEMO-NMC-004",
    "DEMO-LFP-005",
    "DEMO-BESS-006",
    "DEMO-LFP-007",
    "DEMO-NMC-008",
    "DEMO-BESS-009",
    "DEMO-LFP-010",
    "DEMO-SECOND-011",
    "DEMO-AGENCY-A-001",
    "DEMO-AGENCY-A-002",
    "DEMO-AGENCY-B-001",
)


def upgrade() -> None:
    op.add_column(
        "batteries",
        sa.Column("classification", sa.String(length=16), nullable=True),
    )
    op.create_index(
        "ix_batteries_classification",
        "batteries",
        ["classification"],
        unique=False,
    )
    # Reviewed initial inventory. Unknown records remain NULL/unclassified.
    op.execute(
        sa.text(
            "UPDATE batteries SET classification = 'real' "
            "WHERE asset_id IN :assets"
        ).bindparams(sa.bindparam("assets", expanding=True, value=INITIAL_REAL_ASSETS))
    )
    op.execute(
        sa.text(
            "UPDATE batteries SET classification = 'demo' "
            "WHERE asset_id IN :assets"
        ).bindparams(sa.bindparam("assets", expanding=True, value=INITIAL_DEMO_ASSETS))
    )


def downgrade() -> None:
    op.drop_index("ix_batteries_classification", table_name="batteries")
    op.drop_column("batteries", "classification")
