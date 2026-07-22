import uuid

from fastapi import APIRouter, Depends, status

from app.api.dependencies import (
    get_current_user,
    get_admin_project,
    get_viewer_project,
    get_project_member_service,
    get_audit_log_service,
    get_project_member_repository,
    get_user_repository,
)
from app.models.user import User
from app.models.project import Project
from app.schemas.project_member import (
    InviteCreate,
    InviteResponse,
    MemberResponse,
    InviteMetadataResponse,
    PromoteRoleRequest,
)
from app.services.project_member import ProjectMemberService
from app.services.audit_log import AuditLogService

router = APIRouter(prefix="/projects/{project_id}", tags=["Members"])


def _actor_name(user: User) -> str:
    return user.username or user.email


@router.post("/invites", response_model=InviteResponse, status_code=201)
async def invite_member(
    payload: InviteCreate,
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    svc: ProjectMemberService = Depends(get_project_member_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    invite = await svc.invite(project, current_user, payload.email)
    await audit_svc.log_member_invited(project.id, current_user.id, _actor_name(current_user), payload.email)
    return invite


@router.get("/members", response_model=list[MemberResponse])
async def list_members(
    project: Project = Depends(get_viewer_project),
    svc: ProjectMemberService = Depends(get_project_member_service),
):
    return await svc.list_members(project)


@router.patch("/members/{user_id}", response_model=MemberResponse)
async def promote_member(
    user_id: uuid.UUID,
    payload: PromoteRoleRequest,
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    svc: ProjectMemberService = Depends(get_project_member_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
    user_repo=Depends(get_user_repository),
):
    member = await svc.promote_role(project, user_id, payload.role, current_user.id)
    target = await user_repo.get(user_id)
    old_role = "member"
    if target:
        await audit_svc.log_member_role_changed(
            project.id, current_user.id, _actor_name(current_user),
            user_id, target.username or target.email, old_role, payload.role,
        )
    return member


@router.delete("/members/{user_id}", status_code=204)
async def remove_member(
    user_id: uuid.UUID,
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    svc: ProjectMemberService = Depends(get_project_member_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
    user_repo=Depends(get_user_repository),
):
    target = await user_repo.get(user_id)
    await svc.remove_member(project, user_id, current_user.id)
    if target:
        await audit_svc.log_member_removed(
            project.id, current_user.id, _actor_name(current_user),
            user_id, target.username or target.email,
        )


# Standalone routes — no project prefix
invite_accept_router = APIRouter(prefix="/invites", tags=["Members"])


@invite_accept_router.get("/{token}", response_model=InviteMetadataResponse)
async def get_invite_metadata(
    token: uuid.UUID,
    svc: ProjectMemberService = Depends(get_project_member_service),
):
    return await svc.get_metadata(token)


@invite_accept_router.post("/{token}/accept")
async def accept_invite(
    token: uuid.UUID,
    current_user: User = Depends(get_current_user),
    svc: ProjectMemberService = Depends(get_project_member_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    project_id = await svc.accept(token, current_user)
    await audit_svc.log_member_joined(project_id, current_user.id, _actor_name(current_user))
    return {"project_id": str(project_id)}
