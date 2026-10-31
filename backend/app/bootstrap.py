"""Explicit P0-B bootstrap command.

This is intentionally not run automatically at startup. The CTO must approve an
existing account email and run this command once after the P0-B migration.

Example (after CTO approval, never with a password on the command line):

    python -m app.bootstrap --email approved-admin@example.com

The command only adds the `pinlab_super_admin` membership to PinLab Internal.
It never creates a user, never changes a password and never infers ownership.
"""
import argparse
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Organization, OrganizationMembership, OrganizationRole, User


def bootstrap_super_admin(db: Session, email: str) -> OrganizationMembership:
    organization = db.scalar(select(Organization).where(Organization.slug == "pinlab-internal"))
    if not organization:
        raise RuntimeError("PinLab Internal organization does not exist; run P0-A migration first")
    user = db.scalar(select(User).where(User.email == email.lower()))
    if not user or not user.is_active:
        raise RuntimeError("Bootstrap user does not exist or is inactive; create the user through the approved admin process")
    existing = db.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.user_id == user.id,
            OrganizationMembership.organization_id == organization.id,
        )
    )
    if existing:
        if existing.role != OrganizationRole.pinlab_super_admin:
            raise RuntimeError("Existing membership is not pinlab_super_admin; explicit manual review required")
        return existing
    membership = OrganizationMembership(
        user_id=user.id,
        organization_id=organization.id,
        role=OrganizationRole.pinlab_super_admin,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def main(argv: Iterable[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Explicit P0-B super-admin bootstrap")
    parser.add_argument("--email", required=True, help="existing, CTO-approved PinLab user email")
    args = parser.parse_args(argv)
    with SessionLocal() as db:
        membership = bootstrap_super_admin(db, args.email)
    print(f"Bootstrap membership ready: id={membership.id} organization_id={membership.organization_id}")


if __name__ == "__main__":
    main()
