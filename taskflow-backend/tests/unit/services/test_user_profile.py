"""Unit tests for app/api/routers/user.py — profile + avatar endpoints."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.schemas.user import UserProfileUpdate


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_user(uid=None, username="testuser", avatar_key=None):
    u = MagicMock()
    u.id = uid or uuid.uuid4()
    u.email = "user@example.com"
    u.username = username
    u.first_name = "Test"
    u.last_name = "User"
    u.is_verified = True
    u.avatar_key = avatar_key
    u.created_at = "2026-01-01"
    return u


def _make_upload_file(content_type="image/png", size=1024):
    f = MagicMock()
    f.content_type = content_type
    f.read = AsyncMock(return_value=b"x" * size)
    return f


# ── update_profile ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_profile_returns_user_when_no_updates():
    from app.api.routers.user import update_profile

    user = _make_user()
    user_repo = AsyncMock()
    payload = UserProfileUpdate()

    result = await update_profile(payload, current_user=user, user_repo=user_repo)
    assert result is user
    user_repo.update.assert_not_called()


@pytest.mark.asyncio
async def test_update_profile_updates_first_last_name():
    from app.api.routers.user import update_profile

    user = _make_user()
    updated_user = _make_user(uid=user.id, username=user.username)
    user_repo = MagicMock()
    user_repo.get_by_username = AsyncMock(return_value=None)
    user_repo.update = AsyncMock(return_value=updated_user)

    payload = UserProfileUpdate(first_name="Alice", last_name="Smith")
    result = await update_profile(payload, current_user=user, user_repo=user_repo)
    user_repo.update.assert_awaited_once()
    assert result is updated_user


@pytest.mark.asyncio
async def test_update_profile_username_conflict_raises_409():
    from app.api.routers.user import update_profile

    user = _make_user(username="myname")
    conflict = _make_user(username="takenname")
    user_repo = MagicMock()
    user_repo.get_by_username = AsyncMock(return_value=conflict)
    user_repo.update = AsyncMock()

    payload = UserProfileUpdate(username="takenname")
    with pytest.raises(HTTPException) as exc:
        await update_profile(payload, current_user=user, user_repo=user_repo)
    assert exc.value.status_code == 409
    user_repo.update.assert_not_called()


@pytest.mark.asyncio
async def test_update_profile_same_username_skips_conflict_check():
    """Changing to the same username the user already has should not 409."""
    from app.api.routers.user import update_profile

    user = _make_user(username="myname")
    user_repo = MagicMock()
    user_repo.get_by_username = AsyncMock(return_value=None)
    user_repo.update = AsyncMock(return_value=user)

    payload = UserProfileUpdate(username="myname")
    await update_profile(payload, current_user=user, user_repo=user_repo)
    user_repo.get_by_username.assert_not_awaited()


# ── upload_avatar ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_avatar_rejects_unsupported_type():
    from app.api.routers.user import upload_avatar

    user = _make_user()
    user_repo = AsyncMock()
    file = _make_upload_file(content_type="text/plain")

    with pytest.raises(HTTPException) as exc:
        await upload_avatar(file=file, current_user=user, user_repo=user_repo)
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_upload_avatar_rejects_oversized_file():
    from app.api.routers.user import upload_avatar

    user = _make_user()
    user_repo = AsyncMock()
    file = _make_upload_file(content_type="image/jpeg", size=6 * 1024 * 1024)

    with (
        patch("app.api.routers.user.upload_file", new_callable=AsyncMock),
        patch("app.api.routers.user.delete_file", new_callable=AsyncMock),
    ):
        with pytest.raises(HTTPException) as exc:
            await upload_avatar(file=file, current_user=user, user_repo=user_repo)
        assert exc.value.status_code == 413


@pytest.mark.asyncio
async def test_upload_avatar_stores_file_and_updates_user():
    from app.api.routers.user import upload_avatar

    user = _make_user(avatar_key=None)
    updated = _make_user(uid=user.id)
    user_repo = MagicMock()
    user_repo.update = AsyncMock(return_value=updated)
    file = _make_upload_file(content_type="image/png", size=500)

    with (
        patch("app.api.routers.user.upload_file", new_callable=AsyncMock) as mock_up,
        patch("app.api.routers.user.delete_file", new_callable=AsyncMock) as mock_del,
    ):
        result = await upload_avatar(file=file, current_user=user, user_repo=user_repo)

    mock_up.assert_awaited_once()
    mock_del.assert_not_awaited()
    user_repo.update.assert_awaited_once()
    assert result is updated


@pytest.mark.asyncio
async def test_upload_avatar_deletes_old_key_before_new_upload():
    from app.api.routers.user import upload_avatar

    user = _make_user(avatar_key="avatars/abc/old.png")
    updated = _make_user(uid=user.id)
    user_repo = MagicMock()
    user_repo.update = AsyncMock(return_value=updated)
    file = _make_upload_file(content_type="image/png", size=500)

    with (
        patch("app.api.routers.user.upload_file", new_callable=AsyncMock),
        patch("app.api.routers.user.delete_file", new_callable=AsyncMock) as mock_del,
    ):
        await upload_avatar(file=file, current_user=user, user_repo=user_repo)

    mock_del.assert_awaited_once_with("avatars/abc/old.png")


# ── delete_avatar ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_avatar_removes_key_from_storage():
    from app.api.routers.user import delete_avatar

    user = _make_user(avatar_key="avatars/abc/photo.png")
    updated = _make_user(uid=user.id, avatar_key=None)
    user_repo = MagicMock()
    user_repo.update = AsyncMock(return_value=updated)

    with patch("app.api.routers.user.delete_file", new_callable=AsyncMock) as mock_del:
        result = await delete_avatar(current_user=user, user_repo=user_repo)

    mock_del.assert_awaited_once_with("avatars/abc/photo.png")
    user_repo.update.assert_awaited_once_with(user, {"avatar_key": None})
    assert result is updated


@pytest.mark.asyncio
async def test_delete_avatar_no_op_when_no_avatar():
    from app.api.routers.user import delete_avatar

    user = _make_user(avatar_key=None)
    user_repo = MagicMock()
    user_repo.update = AsyncMock(return_value=user)

    with patch("app.api.routers.user.delete_file", new_callable=AsyncMock) as mock_del:
        await delete_avatar(current_user=user, user_repo=user_repo)

    mock_del.assert_not_awaited()


# ── get_avatar ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_avatar_returns_404_when_user_not_found():
    from app.api.routers.user import get_avatar

    user_repo = MagicMock()
    user_repo.get = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc:
        await get_avatar(user_id=uuid.uuid4(), user_repo=user_repo)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_avatar_returns_404_when_no_avatar_key():
    from app.api.routers.user import get_avatar

    user = _make_user(avatar_key=None)
    user_repo = MagicMock()
    user_repo.get = AsyncMock(return_value=user)

    with pytest.raises(HTTPException) as exc:
        await get_avatar(user_id=user.id, user_repo=user_repo)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_avatar_streams_image_data():
    from app.api.routers.user import get_avatar
    from fastapi.responses import StreamingResponse

    user = _make_user(avatar_key="avatars/abc/photo.png")
    user_repo = MagicMock()
    user_repo.get = AsyncMock(return_value=user)

    with patch("app.api.routers.user.download_file", new_callable=AsyncMock, return_value=b"imgbytes"):
        response = await get_avatar(user_id=user.id, user_repo=user_repo)

    assert isinstance(response, StreamingResponse)
    assert "image/png" in response.media_type
    assert response.headers["Cache-Control"] == "public, max-age=86400"
