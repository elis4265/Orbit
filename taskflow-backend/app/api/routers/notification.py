import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status

from app.api.dependencies import (
    get_current_user,
    get_notification_repository,
    get_notification_preferences_repository,
    get_viewer_project,
)
from app.models.user import User
from app.models.project import Project
from app.repositories.notification import NotificationRepository
from app.repositories.notification_preferences import NotificationPreferencesRepository
from app.schemas.notification import (
    NotificationResponse,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
)
from app.core.errors import AppError

router = APIRouter(tags=["Notifications"])


@router.get("/notifications", response_model=list[NotificationResponse])
async def list_notifications(
    unread: Optional[bool] = Query(default=None),
    current_user: User = Depends(get_current_user),
    notif_repo: NotificationRepository = Depends(get_notification_repository),
):
    return await notif_repo.get_for_user(
        current_user.id, unread_only=bool(unread)
    )


@router.get("/notifications/unread-count")
async def unread_count(
    current_user: User = Depends(get_current_user),
    notif_repo: NotificationRepository = Depends(get_notification_repository),
):
    count = await notif_repo.count_unread(current_user.id)
    return {"count": count}


@router.patch("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    notif_repo: NotificationRepository = Depends(get_notification_repository),
):
    ok = await notif_repo.mark_read(notification_id, current_user.id)
    if not ok:
        raise AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.")


@router.patch("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    notif_repo: NotificationRepository = Depends(get_notification_repository),
):
    await notif_repo.mark_all_read(current_user.id)


@router.delete("/notifications", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_notifications(
    current_user: User = Depends(get_current_user),
    notif_repo: NotificationRepository = Depends(get_notification_repository),
):
    await notif_repo.delete_all(current_user.id)


@router.delete("/notifications/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    notif_repo: NotificationRepository = Depends(get_notification_repository),
):
    ok = await notif_repo.delete_one(notification_id, current_user.id)
    if not ok:
        raise AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.")


# ── Per-workspace notification preferences ────────────────────────────────────

@router.get(
    "/projects/{project_id}/notification-preferences",
    response_model=NotificationPreferencesResponse,
)
async def get_preferences(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    _project: Project = Depends(get_viewer_project),
    prefs_repo: NotificationPreferencesRepository = Depends(get_notification_preferences_repository),
):
    return await prefs_repo.get_or_default(current_user.id, project_id)


@router.put(
    "/projects/{project_id}/notification-preferences",
    response_model=NotificationPreferencesResponse,
)
async def update_preferences(
    project_id: uuid.UUID,
    payload: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    _project: Project = Depends(get_viewer_project),
    prefs_repo: NotificationPreferencesRepository = Depends(get_notification_preferences_repository),
):
    return await prefs_repo.upsert(current_user.id, project_id, payload.model_dump())
