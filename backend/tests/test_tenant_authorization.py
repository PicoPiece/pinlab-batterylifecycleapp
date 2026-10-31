from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models import (
    Organization,
    OrganizationRole,
    SecurityAuditEvent,
    UserRole,
)
from .conftest import TEST_BASE_URL, create_user, login


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def api_client(email: str) -> TestClient:
    client = TestClient(app, base_url=TEST_BASE_URL)
    login(client, email)
    return client


def test_tenant_isolation_roles_assignments_and_audit(admin_client, db, pinlab_org):
    agency_a = Organization(slug="agency-a", name="Agency A", kind="agency")
    agency_b = Organization(slug="agency-b", name="Agency B", kind="agency")
    db.add_all([agency_a, agency_b])
    db.commit()
    db.refresh(agency_a)
    db.refresh(agency_b)

    a_admin = create_user(db, "a-admin@example.com", UserRole.viewer, organization=agency_a, organization_role=OrganizationRole.agency_admin)
    a_tech = create_user(db, "a-tech@example.com", UserRole.viewer, organization=agency_a, organization_role=OrganizationRole.agency_technician)
    a_viewer = create_user(db, "a-viewer@example.com", UserRole.viewer, organization=agency_a, organization_role=OrganizationRole.viewer)
    b_admin = create_user(db, "b-admin@example.com", UserRole.viewer, organization=agency_b, organization_role=OrganizationRole.agency_admin)
    no_membership = create_user(db, "no-membership@example.com", UserRole.viewer)

    a_battery = admin_client.post(
        "/api/v1/batteries",
        json={"asset_id": "AGENCY-A-001", "organization_id": agency_a.id},
    ).json()
    b_battery = admin_client.post(
        "/api/v1/batteries",
        json={"asset_id": "AGENCY-B-001", "organization_id": agency_b.id},
    ).json()
    b_inspection = admin_client.post(
        f"/api/v1/batteries/{b_battery['id']}/inspections",
        json={"test_type": "Agency B inspection", "result": "passed"},
    ).json()
    a_attachment = admin_client.post(
        f"/api/v1/batteries/{a_battery['id']}/attachments",
        files={"file": ("a-evidence.png", PNG, "image/png")},
    ).json()

    a_client = api_client(a_admin.email)
    b_client = api_client(b_admin.email)
    tech_client = api_client(a_tech.email)
    viewer_client = api_client(a_viewer.email)
    no_membership_client = api_client(no_membership.email)
    try:
        # 1. Agency A cannot read/list B batteries; dashboard/count is scoped.
        listing = a_client.get("/api/v1/batteries")
        assert listing.status_code == 200
        assert [item["asset_id"] for item in listing.json()["items"]] == ["AGENCY-A-001"]
        assert a_client.get(f"/api/v1/batteries/{b_battery['id']}").status_code == 404
        assert a_client.get("/api/v1/dashboard").json()["total_batteries"] == 1

        # 2. Agency A cannot create nested inspection on B; cannot read B inspection.
        assert a_client.post(
            f"/api/v1/batteries/{b_battery['id']}/inspections",
            json={"test_type": "cross tenant", "result": "passed"},
        ).status_code == 404
        assert a_client.get(f"/api/v1/inspections/{b_inspection['id']}").status_code == 404

        # 3. Attachment is readable in A and not in B.
        assert a_client.get(f"/api/v1/attachments/{a_attachment['id']}/download").status_code == 200
        assert b_client.get(f"/api/v1/attachments/{a_attachment['id']}/download").status_code == 404
        assert b_client.get(f"/api/v1/batteries/{a_battery['id']}/attachments").status_code == 404

        # 4. Agency Admin cannot grant a PinLab role.
        target = admin_client.post(
            "/api/v1/users",
            json={"email": "grant-target@example.com", "full_name": "Grant Target", "role": "viewer", "password": "TempPassword123!"},
        ).json()
        escalation = a_client.post(
            f"/api/v1/organizations/{agency_a.id}/memberships",
            json={"user_id": target["id"], "role": "pinlab_manager"},
        )
        assert escalation.status_code == 403
        allowed_membership = a_client.post(
            f"/api/v1/organizations/{agency_a.id}/memberships",
            json={"user_id": target["id"], "role": "agency_technician"},
        )
        assert allowed_membership.status_code == 201
        created_agency_user = a_client.post(
            f"/api/v1/organizations/{agency_a.id}/users",
            json={
                "email": "agency-a-new@example.com",
                "full_name": "Agency A New",
                "password": "TempPassword123!",
                "role": "agency_technician",
            },
        )
        assert created_agency_user.status_code == 201
        assert created_agency_user.json()["email"] == "agency-a-new@example.com"
        assert a_client.post(
            f"/api/v1/organizations/{agency_b.id}/users",
            json={
                "email": "agency-a-cross@example.com",
                "full_name": "Agency A Cross",
                "password": "TempPassword123!",
                "role": "viewer",
            },
        ).status_code == 404

        # Agency Admin can create only in its own organization.
        own_create = a_client.post("/api/v1/batteries", json={"asset_id": "AGENCY-A-ADMIN-001"})
        assert own_create.status_code == 201
        assert own_create.json()["organization_id"] == agency_a.id
        assert a_client.post(
            "/api/v1/batteries",
            json={"asset_id": "AGENCY-A-CROSS-001", "organization_id": agency_b.id},
        ).status_code == 403

        # 5. Viewer is read-only.
        assert viewer_client.get(f"/api/v1/batteries/{a_battery['id']}").status_code == 200
        assert viewer_client.post("/api/v1/batteries", json={"asset_id": "VIEWER-NO"}).status_code == 403
        assert viewer_client.patch(f"/api/v1/batteries/{a_battery['id']}", json={"notes": "no"}).status_code == 404

        # 6. Disabled account cannot use an existing authenticated session.
        a_viewer.is_active = False
        db.commit()
        assert viewer_client.get("/api/v1/batteries").status_code == 401

        # 7. Unassigned Agency Technician cannot see the asset; assignment grants access.
        tech_listing = tech_client.get("/api/v1/batteries")
        assert tech_listing.status_code == 200 and tech_listing.json()["total"] == 0
        assert tech_client.get(f"/api/v1/batteries/{a_battery['id']}").status_code == 404
        assigned = a_client.post(
            f"/api/v1/batteries/{a_battery['id']}/assignments",
            json={"user_id": a_tech.id},
        )
        assert assigned.status_code == 201
        assert tech_client.get(f"/api/v1/batteries/{a_battery['id']}").status_code == 200
        audit_actions = set(db.scalars(select(SecurityAuditEvent.action)).all())
        assert "battery.assignment.create" in audit_actions

        # 8. No membership is denied by default, even for list endpoints.
        assert no_membership_client.get("/api/v1/batteries").status_code == 403

        # 9. Cross-tenant battery mutation is hidden as 404.
        assert a_client.patch(f"/api/v1/batteries/{b_battery['id']}", json={"notes": "cross"}).status_code == 404

        # PinLab Manager has cross-agency operational visibility.
        manager = create_user(
            db,
            "manager@example.com",
            UserRole.viewer,
            organization=pinlab_org,
            organization_role=OrganizationRole.pinlab_manager,
        )
        manager_client = api_client(manager.email)
        try:
            manager_ids = {item["asset_id"] for item in manager_client.get("/api/v1/batteries").json()["items"]}
            assert {"AGENCY-A-001", "AGENCY-B-001"} <= manager_ids
        finally:
            manager_client.close()

        # Organization reassignment is audited.
        reassigned = admin_client.patch(
            f"/api/v1/batteries/{a_battery['id']}",
            json={"organization_id": agency_b.id},
        )
        assert reassigned.status_code == 200
        audit_actions = set(db.scalars(select(SecurityAuditEvent.action)).all())
        assert "battery.organization.reassign" in audit_actions
    finally:
        for client in (a_client, b_client, tech_client, viewer_client, no_membership_client):
            client.close()
