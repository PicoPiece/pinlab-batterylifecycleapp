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
