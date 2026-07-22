"""
Unit tests for storage.py (REQ-032).

Presigned URLs are not used — download is proxied through the backend.
"""
import sys
from unittest.mock import MagicMock, patch, AsyncMock

import pytest

# minio is not installed locally — stub before importing storage.
_minio_stub = MagicMock()
sys.modules.setdefault("minio", _minio_stub)
sys.modules.setdefault("minio.error", _minio_stub)

import app.core.storage  # noqa: E402


def _reset():
    app.core.storage._client = None


@pytest.mark.asyncio
async def test_download_file_returns_bytes():
    """[REQ-032] download_file reads object bytes from MinIO."""
    _reset()
    fake_response = MagicMock()
    fake_response.read.return_value = b"file content"

    mock_client = MagicMock()
    mock_client.get_object.return_value = fake_response

    with (
        patch.object(app.core.storage, "_get_client", return_value=mock_client),
        patch.object(app.core.storage, "settings") as s,
        patch("asyncio.to_thread", new_callable=AsyncMock, return_value=b"file content"),
    ):
        s.minio_bucket = "taskflow-attachments"
        result = await app.core.storage.download_file("tasks/abc/file.txt")

    assert result == b"file content"

    _reset()


@pytest.mark.asyncio
async def test_upload_uses_internal_client():
    """[REQ-032] upload_file uses the internal client (minio_endpoint)."""
    _reset()

    with (
        patch.object(app.core.storage, "settings") as s,
        patch.object(app.core.storage, "Minio") as MockMinio,
    ):
        s.minio_endpoint = "minio:9000"
        s.minio_access_key = "minioadmin"
        s.minio_secret_key = "minioadmin"
        s.minio_use_ssl = False

        app.core.storage._get_client()

        MockMinio.assert_called_once_with(
            endpoint="minio:9000",
            access_key="minioadmin",
            secret_key="minioadmin",
            secure=False,
        )

    _reset()
