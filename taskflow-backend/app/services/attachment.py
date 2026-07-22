import uuid

from fastapi import HTTPException, UploadFile, status

from app.core.storage import delete_file, download_file, upload_file
from app.models.attachment import Attachment
from app.models.user import User
from app.repositories.attachment import AttachmentRepository

MAX_FILE_SIZE = 25 * 1024 * 1024   # 25 MB
MAX_PER_TASK = 10


class AttachmentService:
    def __init__(self, repo: AttachmentRepository) -> None:
        self.repo = repo

    async def upload(
        self,
        user: User,
        file: UploadFile,
        task_id: uuid.UUID | None = None,
        comment_id: uuid.UUID | None = None,
    ) -> Attachment:
        if task_id is not None:
            existing = await self.repo.get_task_attachments(task_id)
            scope_key = f"tasks/{task_id}"
        else:
            existing = await self.repo.get_comment_attachments(comment_id)
            scope_key = f"comments/{comment_id}"

        if len(existing) >= MAX_PER_TASK:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Maximum {MAX_PER_TASK} attachments allowed.",
            )

        data = await file.read()
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(
                status.HTTP_413_CONTENT_TOO_LARGE,
                "File exceeds the 25 MB limit.",
            )
        if not data:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty.")

        key = f"{scope_key}/{uuid.uuid4()}/{file.filename}"
        await upload_file(key, data, file.content_type or "application/octet-stream")

        record: dict = {
            "task_id": task_id,
            "comment_id": comment_id,
            "uploaded_by": user.id,
            "filename": file.filename,
            "content_type": file.content_type or "application/octet-stream",
            "size_bytes": len(data),
            "storage_key": key,
        }
        return await self.repo.create(record)

    async def list(
        self,
        task_id: uuid.UUID | None = None,
        comment_id: uuid.UUID | None = None,
    ) -> list[Attachment]:
        if task_id is not None:
            return await self.repo.get_task_attachments(task_id)
        return await self.repo.get_comment_attachments(comment_id)

    async def delete(
        self,
        attachment_id: uuid.UUID,
        task_id: uuid.UUID | None = None,
        comment_id: uuid.UUID | None = None,
    ) -> None:
        attachment = await self.repo.get(attachment_id)
        if not attachment:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found.")
        if task_id is not None and attachment.task_id != task_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found.")
        if comment_id is not None and attachment.comment_id != comment_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found.")
        await delete_file(attachment.storage_key)
        await self.repo.delete(attachment)

    async def download(
        self,
        attachment_id: uuid.UUID,
        task_id: uuid.UUID | None = None,
        comment_id: uuid.UUID | None = None,
    ) -> tuple[bytes, str, str]:
        attachment = await self.repo.get(attachment_id)
        if not attachment:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found.")
        if task_id is not None and attachment.task_id != task_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found.")
        if comment_id is not None and attachment.comment_id != comment_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found.")
        data = await download_file(attachment.storage_key)
        return data, attachment.filename, attachment.content_type
