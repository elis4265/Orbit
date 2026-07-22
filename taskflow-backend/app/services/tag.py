import uuid
from typing import Optional

from app.core.errors import AppError
from app.models.tag import Tag, TagVisibility
from app.repositories.tag import TagRepository
from app.repositories.project_member import ProjectMemberRepository

_DEFAULT_COLORS = [
    "#7c6af7", "#ef4444", "#f97316", "#eab308",
    "#22c55e", "#06b6d4", "#3b82f6", "#a855f7",
]


def _build_tag_update(
    name: Optional[str],
    color: Optional[str],
    visibility: Optional["TagVisibility"],
) -> dict:
    data: dict = {}
    if name is not None:
        data["name"] = name
    if color is not None:
        data["color"] = color
    if visibility is not None:
        data["visibility"] = visibility
    return data


def _pick_color(name: str) -> str:
    return _DEFAULT_COLORS[sum(ord(c) for c in name) % len(_DEFAULT_COLORS)]


class TagService:
    def __init__(self, tag_repo: TagRepository, member_repo: ProjectMemberRepository):
        self.tag_repo = tag_repo
        self.member_repo = member_repo

    async def list_tags(self, project_id: uuid.UUID, user_id: uuid.UUID) -> list[Tag]:
        return await self.tag_repo.get_visible(project_id, user_id)

    async def create_tag(
        self,
        project_id: uuid.UUID,
        owner_id: uuid.UUID,
        name: str,
        color: Optional[str],
        visibility: TagVisibility,
    ) -> Tag:
        existing = await self.tag_repo.get_by_name(project_id, name)
        if existing:
            raise AppError(409, code="DUPLICATE_TAG", message=f"Tag '{name}' already exists in this workspace.")
        resolved_color = color or _pick_color(name)
        return await self.tag_repo.create(
            project_id=project_id,
            owner_id=owner_id,
            name=name,
            color=resolved_color,
            visibility=visibility,
        )

    async def update_tag(
        self,
        tag: Tag,
        requester_id: uuid.UUID,
        is_admin: bool,
        name: Optional[str],
        color: Optional[str],
        visibility: Optional[TagVisibility],
    ) -> Tag:
        if tag.owner_id != requester_id and not is_admin:
            raise AppError(403, code="INSUFFICIENT_ROLE", message="Only the tag owner or a workspace admin can edit this tag.")

        if name and name != tag.name:
            existing = await self.tag_repo.get_by_name(tag.project_id, name)
            if existing and existing.id != tag.id:
                raise AppError(409, code="DUPLICATE_TAG", message=f"Tag '{name}' already exists in this workspace.")

        data = _build_tag_update(name, color, visibility)
        if not data:
            return tag
        return await self.tag_repo.update(tag, data)

    async def delete_tag(self, tag: Tag, requester_id: uuid.UUID, is_admin: bool) -> None:
        if tag.owner_id != requester_id and not is_admin:
            raise AppError(403, code="INSUFFICIENT_ROLE", message="Only the tag owner or a workspace admin can delete this tag.")
        await self.tag_repo.delete(tag)

    async def apply_tag(self, task_id: uuid.UUID, tag_id: uuid.UUID, user_id: uuid.UUID) -> None:
        await self.tag_repo.add_to_task(task_id, tag_id, user_id)

    async def remove_tag(self, task_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        await self.tag_repo.remove_from_task(task_id, tag_id)

    async def get_task_tags(self, task_id: uuid.UUID) -> list[Tag]:
        return await self.tag_repo.get_task_tags(task_id)
