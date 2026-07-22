import asyncio
import io
from datetime import timedelta

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

_client: Minio | None = None


def _get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_use_ssl,
        )
    return _client


async def ensure_bucket() -> None:
    client = _get_client()

    def _check() -> None:
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)

    await asyncio.to_thread(_check)


async def upload_file(key: str, data: bytes, content_type: str) -> None:
    client = _get_client()

    def _upload() -> None:
        client.put_object(
            settings.minio_bucket,
            key,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    await asyncio.to_thread(_upload)


async def download_file(key: str) -> bytes:
    client = _get_client()

    def _download() -> bytes:
        response = client.get_object(settings.minio_bucket, key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    return await asyncio.to_thread(_download)


async def delete_file(key: str) -> None:
    client = _get_client()
    try:
        await asyncio.to_thread(client.remove_object, settings.minio_bucket, key)
    except S3Error:
        pass  # already gone — treat as success
