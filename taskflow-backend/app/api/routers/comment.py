import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from app.models.comment import Comment
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_attachment_service,
    get_comment_service,
    get_current_user,
    get_member_project_task,
    get_viewer_project_task,
    get_notification_service,
    get_watcher_service,
    get_activity_service,
)
from app.services.notification import NotificationService
from app.services.watcher import WatcherService
from app.services.activity import ActivityService
from app.core.ws_manager import manager
from app.services.webhook import dispatch as webhook_dispatch
from app.database import get_db_session
from app.models.task import Task
from app.models.user import User
from app.models.project_member import MemberRole
from app.repositories.project import ProjectRepository
from app.repositories.project_member import ProjectMemberRepository
from app.schemas.attachment import AttachmentResponse
from app.schemas.comment import (
    CommentCreate,
    CommentHistoryResponse,
    CommentResponse,
    CommentUpdate,
    ReactionAggregate,
    ReactionRequest,
)
from app.models.comment_reaction import CommentReaction, REACTION_EMOJIS
from app.services.attachment import AttachmentService
from app.services.comment import CommentService

router = APIRouter(
    prefix="/projects/{project_id}/tasks/{task_id}/comments",
    tags=["Comments"],
)

att_router = APIRouter(
    prefix="/projects/{project_id}/tasks/{task_id}/comments/{comment_id}/attachments",
    tags=["Comment Attachments"],
)


# ─── comments ────────────────────────────────────────────────────────────────

async def _reaction_aggregates(
    session: AsyncSession, comment_ids: list, current_user_id
) -> dict:
    """comment_id → [ReactionAggregate], curated-set order (REQ-162)."""
    from sqlalchemy import select

    if not comment_ids:
        return {}
    rows = (await session.execute(
        select(CommentReaction).where(CommentReaction.comment_id.in_(comment_ids))
    )).scalars().all()
    by_comment: dict = {}
    for r in rows:
        by_comment.setdefault(r.comment_id, {}).setdefault(r.emoji, []).append(r.user_id)
    result = {}
    for cid, emojis in by_comment.items():
        # Curated-set order first, then ':name:' custom emotes alphabetically.
        ordered = [e for e in REACTION_EMOJIS if e in emojis] + sorted(
            e for e in emojis if e not in REACTION_EMOJIS
        )
        result[cid] = [
            ReactionAggregate(emoji=e, count=len(emojis[e]), me=current_user_id in emojis[e])
            for e in ordered
        ]
    return result


@router.get("", response_model=list[CommentResponse])
async def list_comments(
    task: Task = Depends(get_viewer_project_task),
    current_user: User = Depends(get_current_user),
    svc: CommentService = Depends(get_comment_service),
    session: AsyncSession = Depends(get_db_session),
):
    comments = await svc.list_comments(task.id)
    aggregates = await _reaction_aggregates(session, [c.id for c in comments], current_user.id)
    out = []
    for c in comments:
        resp = CommentResponse.model_validate(c)
        resp.reactions = aggregates.get(c.id, [])
        out.append(resp)
    return out


@router.post("/{comment_id}/reactions", response_model=list[ReactionAggregate])
async def add_reaction(
    comment_id: uuid.UUID,
    payload: ReactionRequest,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """REQ-162: idempotent add — same user + emoji never duplicates."""
    from sqlalchemy import select

    comment = await session.get(Comment, comment_id)
    if comment is None or comment.task_id != task.id:
        raise HTTPException(404, "Comment not found.")

    # ':name:' must reference an existing emote in this project.
    if payload.emoji.startswith(":"):
        from app.models.custom_emote import CustomEmote
        emote = (await session.execute(select(CustomEmote).where(
            CustomEmote.project_id == task.project_id,
            CustomEmote.name == payload.emoji.strip(":"),
        ))).scalars().first()
        if emote is None:
            raise HTTPException(404, f"Emote {payload.emoji} not found in this project.")

    existing = (await session.execute(select(CommentReaction).where(
        CommentReaction.comment_id == comment_id,
        CommentReaction.user_id == current_user.id,
        CommentReaction.emoji == payload.emoji,
    ))).scalars().first()
    if existing is None:
        session.add(CommentReaction(
            comment_id=comment_id, user_id=current_user.id, emoji=payload.emoji
        ))
        await session.commit()
    aggregates = await _reaction_aggregates(session, [comment_id], current_user.id)
    return aggregates.get(comment_id, [])


@router.delete("/{comment_id}/reactions", response_model=list[ReactionAggregate])
async def remove_reaction(
    comment_id: uuid.UUID,
    payload: ReactionRequest,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    from sqlalchemy import delete as sa_delete

    comment = await session.get(Comment, comment_id)
    if comment is None or comment.task_id != task.id:
        raise HTTPException(404, "Comment not found.")

    await session.execute(sa_delete(CommentReaction).where(
        CommentReaction.comment_id == comment_id,
        CommentReaction.user_id == current_user.id,
        CommentReaction.emoji == payload.emoji,
    ))
    await session.commit()
    aggregates = await _reaction_aggregates(session, [comment_id], current_user.id)
    return aggregates.get(comment_id, [])


@router.post("", response_model=CommentResponse, status_code=201)
async def create_comment(
    project_id: uuid.UUID,
    payload: CommentCreate,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    svc: CommentService = Depends(get_comment_service),
    notif_service: NotificationService = Depends(get_notification_service),
    watcher_service: WatcherService = Depends(get_watcher_service),
    activity_svc: ActivityService = Depends(get_activity_service),
    session: AsyncSession = Depends(get_db_session),
):
    comment = await svc.create_comment(task.id, current_user, payload.content)
    await watcher_service.auto_watch_commenter(task.id, current_user.id)
    actor_name = current_user.username or current_user.email
    await notif_service.on_comment_added(
        task_id=task.id,
        project_id=project_id,
        task_title=task.title,
        actor_id=current_user.id,
        actor_name=actor_name,
        assignee_id=task.assignee_id,
        comment_html=payload.content,
    )
    await activity_svc.log_comment_added(
        task_id=task.id,
        task_title=task.title,
        project_id=project_id,
        actor_id=current_user.id,
        actor_name=actor_name,
        comment_html=payload.content,
    )
    comment_json = CommentResponse.model_validate(comment).model_dump(mode="json")
    await manager.broadcast(str(project_id), {
        "type": "comment.created",
        "payload": comment_json,
    })
    await webhook_dispatch(session, project_id, "comment.created", comment_json)
    return comment


@router.patch("/{comment_id}", response_model=CommentResponse)
async def edit_comment(
    project_id: uuid.UUID,
    comment_id: uuid.UUID,
    payload: CommentUpdate,
    task: Task = Depends(get_viewer_project_task),
    current_user: User = Depends(get_current_user),
    svc: CommentService = Depends(get_comment_service),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    comment = await svc.edit_comment(comment_id, current_user, payload.content)
    await activity_svc.log_comment_edited(
        task_id=task.id,
        task_title=task.title,
        project_id=project_id,
        actor_id=current_user.id,
        actor_name=current_user.username or current_user.email,
        comment_html=payload.content,
    )
    await manager.broadcast(str(project_id), {
        "type": "comment.updated",
        "payload": CommentResponse.model_validate(comment).model_dump(mode="json"),
    })
    return comment


@router.delete("/{comment_id}", status_code=204)
async def delete_comment(
    project_id: uuid.UUID,
    comment_id: uuid.UUID,
    task: Task = Depends(get_viewer_project_task),
    current_user: User = Depends(get_current_user),
    svc: CommentService = Depends(get_comment_service),
    activity_svc: ActivityService = Depends(get_activity_service),
    session: AsyncSession = Depends(get_db_session),
):
    workspace = await ProjectRepository(session).get(project_id)
    is_admin = False
    owner_id = workspace.owner_id if workspace else uuid.uuid4()
    if workspace:
        if workspace.owner_id == current_user.id:
            is_admin = True
        else:
            membership = await ProjectMemberRepository(session).get_membership(project_id, current_user.id)
            is_admin = membership is not None and MemberRole(membership.role) == MemberRole.admin

    await svc.delete_comment(comment_id, current_user, owner_id, is_admin=is_admin)
    await activity_svc.log_comment_deleted(
        task_id=task.id,
        task_title=task.title,
        project_id=project_id,
        actor_id=current_user.id,
        actor_name=current_user.username or current_user.email,
    )
    await manager.broadcast(str(project_id), {
        "type": "comment.deleted",
        "payload": {"comment_id": str(comment_id), "task_id": str(task.id)},
    })


@router.get("/{comment_id}/history", response_model=list[CommentHistoryResponse])
async def get_comment_history(
    comment_id: uuid.UUID,
    task: Task = Depends(get_viewer_project_task),
    svc: CommentService = Depends(get_comment_service),
):
    return await svc.get_history(comment_id)


# ─── comment attachments ─────────────────────────────────────────────────────

@att_router.get("", response_model=list[AttachmentResponse])
async def list_comment_attachments(
    comment_id: uuid.UUID,
    task: Task = Depends(get_viewer_project_task),
    svc: AttachmentService = Depends(get_attachment_service),
):
    return await svc.list(comment_id=comment_id)


@att_router.post("", response_model=AttachmentResponse, status_code=201)
async def upload_comment_attachment(
    comment_id: uuid.UUID,
    file: UploadFile = File(...),
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    svc: AttachmentService = Depends(get_attachment_service),
):
    return await svc.upload(current_user, file, comment_id=comment_id)


@att_router.get("/{attachment_id}/download")
async def download_comment_attachment(
    comment_id: uuid.UUID,
    attachment_id: uuid.UUID,
    task: Task = Depends(get_viewer_project_task),
    svc: AttachmentService = Depends(get_attachment_service),
):
    data, filename, content_type = await svc.download(attachment_id, comment_id=comment_id)
    safe_name = filename.replace('"', '\\"').replace("\r", "").replace("\n", "")
    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@att_router.delete("/{attachment_id}", status_code=204)
async def delete_comment_attachment(
    comment_id: uuid.UUID,
    attachment_id: uuid.UUID,
    task: Task = Depends(get_viewer_project_task),
    svc: AttachmentService = Depends(get_attachment_service),
):
    await svc.delete(attachment_id, comment_id=comment_id)
