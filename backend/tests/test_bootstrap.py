from app.bootstrap import bootstrap_super_admin
from app.models import OrganizationMembership, OrganizationRole, UserRole
from .conftest import create_user


def test_bootstrap_is_explicit_and_idempotent(db, pinlab_org):
    user = create_user(db, "bootstrap-admin@example.com", UserRole.admin)
    membership = bootstrap_super_admin(db, user.email)
    assert membership.role == OrganizationRole.pinlab_super_admin
    assert membership.organization_id == pinlab_org.id
    again = bootstrap_super_admin(db, user.email)
    assert again.id == membership.id
    assert db.query(OrganizationMembership).count() == 1
