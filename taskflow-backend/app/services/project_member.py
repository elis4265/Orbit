import uuid
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, status

from app.core.config import settings
from app.core.errors import AppError
from app.models.user import User
from app.models.project import Project
from app.models.project_invite import ProjectInvite
from app.models.project_member import MemberRole
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.project_member import ProjectMemberRepository
from app.repositories.project_invite import ProjectInviteRepository

INVITE_TTL_DAYS = 7


def _member_dict(user: User, role: str, joined_at=None) -> dict:
    fn, ln = user.first_name, user.last_name
    if fn and ln:
        initials = (fn[0] + ln[0]).upper()
    elif user.username:
        initials = user.username[0].upper()
    else:
        initials = user.email[0].upper()
    avatar_url = (
        f"{settings.base_url}/api/v1/users/{user.id}/avatar"
        if user.avatar_key else None
    )
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "first_name": fn,
        "last_name": ln,
        "avatar_url": avatar_url,
        "initials": initials,
        "joined_at": joined_at,
        "role": role,
    }


class ProjectMemberService:
    def __init__(
        self,
        member_repo: ProjectMemberRepository,
        invite_repo: ProjectInviteRepository,
        user_repo: UserRepository,
        project_repo: ProjectRepository,
        task_repo=None,
    ) -> None:
        self.member_repo = member_repo
        self.invite_repo = invite_repo
        self.user_repo = user_repo
        self.project_repo = project_repo
        # Optional so existing constructions (and tests) keep working; remove_member
        # skips the unassign step when it is absent.
        self.task_repo = task_repo

    async def get_user_role(self, project: Project, user_id: uuid.UUID) -> MemberRole | None:
        if user_id == project.owner_id:
            return MemberRole.admin
        membership = await self.member_repo.get_membership(project.id, user_id)
        if not membership:
            return None
        return MemberRole(membership.role)

    async def invite(
        self, project: Project, inviter: User, email: str
    ) -> ProjectInvite:
        target = await self.user_repo.get_by_email(email)
        if target:
            existing = await self.member_repo.get_membership(project.id, target.id)
            if existing or target.id == project.owner_id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "User is already a member.")

        pending = await self.invite_repo.get_pending_for_email(project.id, email)
        if pending:
            raise HTTPException(status.HTTP_409_CONFLICT, "A pending invite already exists for this email.")

        invite = await self.invite_repo.create({
            "project_id": project.id,
            "invited_by": inviter.id,
            "email": email,
            "token": uuid.uuid4(),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS),
            "used": False,
        })

        from app.services.email import send_invite_email
        await send_invite_email(email, project.name, str(invite.token))
        return invite

    async def get_metadata(self, token: uuid.UUID) -> dict:
        invite = await self.invite_repo.get_by_token(token)
        if not invite:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found.")
        project = await self.project_repo.get(invite.project_id)
        now = datetime.now(timezone.utc)
        # HW-23: exposed only behind the invite token (the capability) — routes
        # registered invitees to Sign in instead of a doomed Register form.
        existing = await self.user_repo.get_by_email(invite.email)
        return {
            "project_id": invite.project_id,
            "workspace_name": project.name if project else "",
            "email": invite.email,
            "expired": invite.expires_at < now,
            "used": invite.used,
            "user_exists": existing is not None,
        }

    async def accept(self, token: uuid.UUID, user: User) -> uuid.UUID:
        invite = await self.invite_repo.get_by_token(token)
        if not invite:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite not found.")
        if invite.expires_at < datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invite is expired or already used.")

        existing = await self.member_repo.get_membership(invite.project_id, user.id)
        if existing:
            return invite.project_id

        if invite.used:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invite is expired or already used.")

        await self.member_repo.add_member(invite.project_id, user.id, role=MemberRole.member)
        await self.invite_repo.mark_used(invite)
        return invite.project_id

    async def list_members(self, project: Project) -> list[dict]:
        memberships = await self.member_repo.get_members(project.id)
        member_map = {m.user_id: m for m in memberships}

        result = []
        owner = await self.user_repo.get(project.owner_id)
        if owner:
            owner_membership = member_map.get(owner.id)
            result.append(_member_dict(owner, "owner", owner_membership.joined_at if owner_membership else None))

        for uid, m in member_map.items():
            if uid == project.owner_id:
                continue
            u = await self.user_repo.get(uid)
            if u:
                result.append(_member_dict(u, m.role, m.joined_at))
        return result

    async def remove_member(
        self, project: Project, target_user_id: uuid.UUID, actor_id: uuid.UUID
    ) -> None:
        if target_user_id == project.owner_id:
            raise AppError(status.HTTP_400_BAD_REQUEST, code="LAST_ADMIN", message="Cannot remove the project owner.")
        membership = await self.member_repo.get_membership(project.id, target_user_id)
        if not membership:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found.")
        if MemberRole(membership.role) == MemberRole.admin:
            if actor_id != project.owner_id:
                raise AppError(status.HTTP_403_FORBIDDEN, code="INSUFFICIENT_ROLE", message="Only the project owner can remove admins.")
            count = await self.member_repo.get_admin_count(project.id)
            if count <= 1:
                raise AppError(status.HTTP_400_BAD_REQUEST, code="LAST_ADMIN", message="Cannot remove the last admin.")
        await self.member_repo.remove_member(project.id, target_user_id)
        # Their assignments would otherwise point at someone who can no longer open
        # the project: blank avatar in the UI, still "assigned" to filters and stats,
        # and invisible in their own My Work. Unassign so nothing is owned by a ghost.
        if self.task_repo is not None:
            await self.task_repo.unassign_all_for_user(project.id, target_user_id)
        # HW-18: a default assignee who is no longer a member would point every new
        # task at an outsider. Reset the setting rather than leave it dangling.
        # (ondelete=SET NULL only fires on user deletion, not membership removal.)
        if project.default_assignee_id == target_user_id:
            await self.project_repo.update(
                project,
                {"default_assignee_mode": "unassigned", "default_assignee_id": None},
            )

    async def promote_role(
        self, project: Project, target_user_id: uuid.UUID, new_role: MemberRole, actor_id: uuid.UUID
    ) -> dict:
        if target_user_id == project.owner_id:
            raise AppError(status.HTTP_400_BAD_REQUEST, code="LAST_ADMIN", message="Cannot change the project owner's role.")
        membership = await self.member_repo.get_membership(project.id, target_user_id)
        if not membership:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found.")
        if MemberRole(membership.role) == MemberRole.admin:
            if actor_id != project.owner_id:
                raise AppError(status.HTTP_403_FORBIDDEN, code="INSUFFICIENT_ROLE", message="Only the project owner can change an admin's role.")
            if new_role != MemberRole.admin:
                count = await self.member_repo.get_admin_count(project.id)
                if count <= 1:
                    raise AppError(status.HTTP_400_BAD_REQUEST, code="LAST_ADMIN", message="Cannot demote the last admin.")
        updated = await self.member_repo.update_role(project.id, target_user_id, new_role)
        u = await self.user_repo.get(target_user_id)
        return _member_dict(u, updated.role, updated.joined_at)
