def test_attachment_upload_and_download(admin_client):
    battery = admin_client.post("/api/v1/batteries", json={"asset_id": "ATT-001"}).json()
    response = admin_client.post(
        f"/api/v1/batteries/{battery['id']}/attachments",
        files={"file": ("evidence.png", b"\x89PNG\r\n\x1a\nDEMO", "image/png")},
    )
    assert response.status_code == 201, response.text
    attachment = response.json()
    assert attachment["filename"] == "evidence.png"
    assert attachment["size_bytes"] > 0

    listed = admin_client.get(f"/api/v1/batteries/{battery['id']}/attachments")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    download = admin_client.get(f"/api/v1/attachments/{attachment['id']}/download")
    assert download.status_code == 200
    assert download.content.startswith(b"\x89PNG")


def test_rejects_unsupported_attachment(admin_client):
    battery = admin_client.post("/api/v1/batteries", json={"asset_id": "ATT-002"}).json()
    response = admin_client.post(
        f"/api/v1/batteries/{battery['id']}/attachments",
        files={"file": ("notes.txt", b"text", "text/plain")},
    )
    assert response.status_code == 415


def test_rejects_extension_mime_mismatch(admin_client):
    battery = admin_client.post("/api/v1/batteries", json={"asset_id": "ATT-003"}).json()
    response = admin_client.post(
        f"/api/v1/batteries/{battery['id']}/attachments",
        files={"file": ("evidence.jpg", b"\x89PNG\r\n\x1a\nDEMO", "image/png")},
    )
    assert response.status_code == 415
    assert "Phần mở rộng" in response.json()["detail"]


def test_rejects_magic_byte_mismatch(admin_client):
    battery = admin_client.post("/api/v1/batteries", json={"asset_id": "ATT-004"}).json()
    response = admin_client.post(
        f"/api/v1/batteries/{battery['id']}/attachments",
        files={"file": ("evidence.png", b"not-a-real-png", "image/png")},
    )
    assert response.status_code == 415
    assert "Nội dung file" in response.json()["detail"]


def test_accepts_valid_pdf_with_secure_download_headers(admin_client):
    battery = admin_client.post("/api/v1/batteries", json={"asset_id": "ATT-005"}).json()
    response = admin_client.post(
        f"/api/v1/batteries/{battery['id']}/attachments",
        files={"file": ("evidence.pdf", b"%PDF-1.4\nDEMO\n%%EOF", "application/pdf")},
    )
    assert response.status_code == 201, response.text
    attachment = response.json()
    download = admin_client.get(f"/api/v1/attachments/{attachment['id']}/download")
    assert download.status_code == 200
    assert download.headers["content-disposition"].startswith("attachment;")
    assert download.headers["x-content-type-options"] == "nosniff"
    assert download.headers["cache-control"] == "no-store"


def test_rejects_file_over_size_limit(admin_client):
    from app.config import settings

    battery = admin_client.post("/api/v1/batteries", json={"asset_id": "ATT-006"}).json()
    old_limit = settings.max_upload_mb
    settings.max_upload_mb = 0
    try:
        response = admin_client.post(
            f"/api/v1/batteries/{battery['id']}/attachments",
            files={"file": ("evidence.png", b"\x89PNG\r\n\x1a\nDEMO", "image/png")},
        )
        assert response.status_code == 413
    finally:
        settings.max_upload_mb = old_limit
