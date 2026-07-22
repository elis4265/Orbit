"""
Integration tests for file attachment routes (REQ-032).

Storage calls (MinIO) are patched so tests run without a real MinIO instance.
"""
import io
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.board import BoardRepository
from app.repositories.task import TaskRepository
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository

STORAGE = "app.services.attachment"


async def _seed(db):
    user = await UserRepository(db).create({
        "email": f"att_{uuid.uuid4().hex[:6]}@taskflow.io",
        "hashed_password": "argon2hash",
    })
    ws = await ProjectRepository(db).create({"key": "WS", "name": "WS", "owner_id": user.id})
    board = await BoardRepository(db).create({"name": "Board", "project_id": ws.id})
    task = await TaskRepository(db).create({
        "title": "Task",
        "project_id": ws.id,
    })
    return user, ws, board, task


def _file(name="doc.txt", content=b"hello", content_type="text/plain"):
    return {"file": (name, io.BytesIO(content), content_type)}


# ── upload ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_returns_201(db_session):
    """[REQ-032] Uploading a file returns 201 with attachment metadata."""
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    with patch(f"{STORAGE}.upload_file", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                f"/api/v1/projects/{ws.id}/tasks/{task.id}/attachments",
                files=_file(),
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 201
    data = resp.json()
    assert data["filename"] == "doc.txt"
    assert data["content_type"] == "text/plain"
    assert data["size_bytes"] == 5
    assert "id" in data


@pytest.mark.asyncio
async def test_upload_empty_file_returns_400(db_session):
    """[REQ-032] Uploading an empty file returns 400."""
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    with patch(f"{STORAGE}.upload_file", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                f"/api/v1/projects/{ws.id}/tasks/{task.id}/attachments",
                files=_file(content=b""),
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_upload_cap_enforced(db_session):
    """[REQ-032] Uploading more than 10 files to the same task returns 400."""
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    with patch(f"{STORAGE}.upload_file", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            url = f"/api/v1/projects/{ws.id}/tasks/{task.id}/attachments"
            for i in range(10):
                r = await ac.post(url, files=_file(name=f"f{i}.txt", content=b"x"))
                assert r.status_code == 201
            resp = await ac.post(url, files=_file(name="overflow.txt", content=b"x"))

    app.dependency_overrides.clear()
    assert resp.status_code == 400


# ── list ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_returns_uploaded_attachment(db_session):
    """[REQ-032] List returns the attachment that was just uploaded."""
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    with patch(f"{STORAGE}.upload_file", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            url = f"/api/v1/projects/{ws.id}/tasks/{task.id}/attachments"
            await ac.post(url, files=_file(name="report.pdf", content=b"data"))
            resp = await ac.get(url)

    app.dependency_overrides.clear()
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["filename"] == "report.pdf"


@pytest.mark.asyncio
async def test_list_empty_returns_empty_list(db_session):
    """[REQ-032] List on a task with no attachments returns an empty list."""
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(
            f"/api/v1/projects/{ws.id}/tasks/{task.id}/attachments"
        )

    app.dependency_overrides.clear()
    assert resp.status_code == 200
    assert resp.json() == []


# ── download ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_download_streams_file_bytes(db_session):
    """[REQ-032] GET /{id}/download streams the file with correct content-type."""
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    with (
        patch(f"{STORAGE}.upload_file", new_callable=AsyncMock),
        patch(f"{STORAGE}.download_file", new_callable=AsyncMock, return_value=b"hello"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            url = f"/api/v1/projects/{ws.id}/tasks/{task.id}/attachments"
            att = (await ac.post(url, files=_file(content=b"hello"))).json()
            resp = await ac.get(f"{url}/{att['id']}/download")

    app.dependency_overrides.clear()
    assert resp.status_code == 200
    assert resp.content == b"hello"
    assert resp.headers["content-type"].startswith("text/plain")
    assert "doc.txt" in resp.headers["content-disposition"]


@pytest.mark.asyncio
async def test_download_missing_attachment_returns_404(db_session):
    """[REQ-032] GET /{id}/download for non-existent attachment returns 404."""
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    with patch(f"{STORAGE}.download_file", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get(
                f"/api/v1/projects/{ws.id}/tasks/{task.id}"
                f"/attachments/{uuid.uuid4()}/download"
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 404


# ── delete ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_attachment_returns_204(db_session):
    """[REQ-032] Deleting an attachment returns 204 and removes it from the list."""
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    with (
        patch(f"{STORAGE}.upload_file", new_callable=AsyncMock),
        patch(f"{STORAGE}.delete_file", new_callable=AsyncMock),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            url = f"/api/v1/projects/{ws.id}/tasks/{task.id}/attachments"
            att = (await ac.post(url, files=_file())).json()
            del_resp = await ac.delete(f"{url}/{att['id']}")
            list_resp = await ac.get(url)

    app.dependency_overrides.clear()
    assert del_resp.status_code == 204
    assert list_resp.json() == []


@pytest.mark.asyncio
async def test_delete_missing_attachment_returns_404(db_session):
    """[REQ-032] Deleting a non-existent attachment returns 404."""
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    with patch(f"{STORAGE}.delete_file", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.delete(
                f"/api/v1/projects/{ws.id}/tasks/{task.id}"
                f"/attachments/{uuid.uuid4()}"
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 404


# ── ownership guard ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_wrong_workspace_returns_404(db_session):
    """[REQ-032] Upload to a task that doesn't belong to the project returns 404."""
    user, ws, board, task = await _seed(db_session)
    other_ws = await ProjectRepository(db_session).create({"key": "WS", 
        "name": "Other WS", "owner_id": user.id,
    })
    app.dependency_overrides[get_current_user] = lambda: user

    with patch(f"{STORAGE}.upload_file", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                f"/api/v1/projects/{other_ws.id}/tasks/{task.id}/attachments",
                files=_file(),
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 404
