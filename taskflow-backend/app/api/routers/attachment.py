import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response

from app.api.dependencies import (
    get_attachment_repository,
    get_attachment_service,
    get_viewer_project_task,
    get_member_project_task,
    get_current_user,
    get_activity_service,
)
from app.models.task import Task
from app.models.user import User
from app.repositories.attachment import AttachmentRepository
from app.schemas.attachment import AttachmentResponse
from app.services.attachment import AttachmentService
from app.services.activity import ActivityService

router = APIRouter(
    prefix="/projects/{project_id}/tasks/{task_id}/attachments",
    tags=["Attachments"],
)


@router.get("", response_model=list[AttachmentResponse])
async def list_attachments(
    task: Task = Depends(get_viewer_project_task),
    svc: AttachmentService = Depends(get_attachment_service),
):
    return await svc.list(task_id=task.id)


@router.post("", response_model=AttachmentResponse, status_code=201)
async def upload_attachment(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    svc: AttachmentService = Depends(get_attachment_service),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    attachment = await svc.upload(current_user, file, task_id=task.id)
    await activity_svc.log_attachment_added(
        task_id=task.id,
        task_title=task.title,
        project_id=project_id,
        actor_id=current_user.id,
        actor_name=current_user.username or current_user.email,
        filename=attachment.filename,
        size_bytes=attachment.size_bytes,
    )
    return attachment


@router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: uuid.UUID,
    task: Task = Depends(get_viewer_project_task),
    svc: AttachmentService = Depends(get_attachment_service),
):
    data, filename, content_type = await svc.download(attachment_id, task_id=task.id)
    safe_name = filename.replace('"', '\\"').replace("\r", "").replace("\n", "")
    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.delete("/{attachment_id}", status_code=204)
async def delete_attachment(
    project_id: uuid.UUID,
    attachment_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    repo: AttachmentRepository = Depends(get_attachment_repository),
    svc: AttachmentService = Depends(get_attachment_service),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    existing = await repo.get(attachment_id)
    await svc.delete(attachment_id, task_id=task.id)
    if existing:
        await activity_svc.log_attachment_deleted(
            task_id=task.id,
            task_title=task.title,
            project_id=project_id,
            actor_id=current_user.id,
            actor_name=current_user.username or current_user.email,
            filename=existing.filename,
        )
