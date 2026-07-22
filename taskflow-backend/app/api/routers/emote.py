"""Project custom reaction emotes (REQ-162 extension, Teams model).

Members upload their own emotes; an emote named like a curated default
replaces that default in the picker. Reactions store ':name:'.
"""
import io
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_member_project,
    get_project_member_repository,
    get_viewer_project,
)
from app.core.storage import delete_file, download_file, upload_file
from app.database import get_db_session
from app.models.comment import Comment
from app.models.comment_reaction import CommentReaction
from app.models.custom_emote import CustomEmote
from app.models.project import Project
from app.models.project_member import MemberRole
from app.models.task import Task
from app.models.user import User
from app.repositories.project_member import ProjectMemberRepository
from app.schemas.emote import EMOTE_NAME_RE, EmoteResponse

router = APIRouter(prefix="/projects/{project_id}/emotes", tags=["Emotes"])

_EMOTE_ALLOWED_TYPES = {"image/png", "image/gif", "image/webp", "image/jpeg"}
_EMOTE_MAX_BYTES = 256 * 1024  # 256 KB — rendered at ~20px, anything bigger is waste


def _is_admin(project: Project, current_user: User, membership) -> bool:
    return (
        project.owner_id == current_user.id
        or (membership is not None and MemberRole(membership.role) == MemberRole.admin)
    )


@router.get("", response_model=list[EmoteResponse])
async def list_emotes(
    project_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    rows = (await session.execute(
        select(CustomEmote).where(CustomEmote.project_id == project_id).order_by(CustomEmote.name)
    )).scalars().all()
    return rows


@router.post("", response_model=EmoteResponse, status_code=status.HTTP_201_CREATED)
async def create_emote(
    project_id: uuid.UUID,
    name: str = Form(...),
    file: UploadFile = File(...),
    _project: Project = Depends(get_member_project),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    name = name.strip().lower()
    if not EMOTE_NAME_RE.match(name):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Emote name must be 2-32 chars: lowercase letters, digits, underscore.",
        )
    if file.content_type not in _EMOTE_ALLOWED_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unsupported image type.")
    data = await file.read()
    if len(data) > _EMOTE_MAX_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Emote must be under 256 KB.")

    existing = (await session.execute(select(CustomEmote).where(
        CustomEmote.project_id == project_id, CustomEmote.name == name
    ))).scalars().first()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Emote :{name}: already exists.")

    ext = (file.content_type or "image/png").split("/")[-1]
    key = f"emotes/{project_id}/{uuid.uuid4()}.{ext}"
    await upload_file(key, data, file.content_type or "image/png")

    emote = CustomEmote(
        project_id=project_id, name=name, image_key=key,
        content_type=file.content_type or "image/png", created_by=current_user.id,
    )
    session.add(emote)
    await session.commit()
    await session.refresh(emote)
    return emote


@router.delete("/{emote_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_emote(
    project_id: uuid.UUID,
    emote_id: uuid.UUID,
    project: Project = Depends(get_member_project),
    current_user: User = Depends(get_current_user),
    member_repo: ProjectMemberRepository = Depends(get_project_member_repository),
    session: AsyncSession = Depends(get_db_session),
):
    emote = await session.get(CustomEmote, emote_id)
    if emote is None or emote.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Emote not found.")

    membership = await member_repo.get_membership(project_id, current_user.id)
    if emote.created_by != current_user.id and not _is_admin(project, current_user, membership):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the uploader or an admin can delete an emote.")

    # Reactions referencing the emote go with it (delete policy: no orphaned :name:).
    project_comments = (
        select(Comment.id).join(Task, Comment.task_id == Task.id).where(Task.project_id == project_id)
    )
    await session.execute(sa_delete(CommentReaction).where(
        CommentReaction.emoji == f":{emote.name}:",
        CommentReaction.comment_id.in_(project_comments),
    ))
    await delete_file(emote.image_key)
    await session.delete(emote)
    await session.commit()


@router.get("/{emote_id}/image")
async def get_emote_image(
    project_id: uuid.UUID,
    emote_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
):
    # No auth — same policy as user avatars: raw image content behind an
    # unguessable UUID, served to <img> tags that cannot attach a bearer token.
    emote = await session.get(CustomEmote, emote_id)
    if emote is None or emote.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Emote not found.")
    data = await download_file(emote.image_key)
    return StreamingResponse(
        io.BytesIO(data),
        media_type=emote.content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
