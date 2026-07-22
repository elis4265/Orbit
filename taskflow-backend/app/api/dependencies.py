import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
import jwt
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.models.user import User
from app.models.project import Project
from app.models.board import Board
from app.models.task import Task
from app.repositories.user import UserRepository
from app.repositories.board import BoardRepository
from app.repositories.project import ProjectRepository
from app.repositories.task import TaskRepository
from app.repositories.email_verification import EmailVerificationRepository
from app.repositories.password_reset import PasswordResetRepository
from app.repositories.attachment import AttachmentRepository
from app.repositories.project_member import ProjectMemberRepository
from app.repositories.project_invite import ProjectInviteRepository
from app.repositories.comment import CommentRepository, CommentHistoryRepository
from app.repositories.task_watcher import TaskWatcherRepository
from app.repositories.notification import NotificationRepository
from app.repositories.notification_preferences import NotificationPreferencesRepository
from app.models.project_member import MemberRole
from app.core.errors import AppError
from app.services.auth import AuthService
from app.services.board import BoardService
from app.services.project import ProjectService
from app.services.task import TaskService
from app.services.subtask import SubtaskService
from app.services.project_member import ProjectMemberService
from app.core.security import decode_token, API_TOKEN_PREFIX, hash_api_token
from app.core.redis import redis_client
from app.services.token_blacklist import is_blacklisted
from app.services.ai import AIService
from app.core.logging import get_logger

_log = get_logger("dependencies")


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_redis() -> aioredis.Redis:
    return redis_client


async def get_user_repository(session: AsyncSession = Depends(get_db_session)) -> UserRepository:
    return UserRepository(session)


async def get_auth_service(
    user_repo: UserRepository = Depends(get_user_repository),
) -> AuthService:
    return AuthService(user_repo=user_repo)


async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    user_repo: UserRepository = Depends(get_user_repository),
    redis: aioredis.Redis = Depends(get_redis),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # REQ-143: personal API tokens authenticate anywhere a session JWT does.
    if token.startswith(API_TOKEN_PREFIX):
        from app.models.api_token import ApiToken
        from sqlalchemy import select as _select

        result = await user_repo.session.execute(
            _select(ApiToken).where(ApiToken.token_hash == hash_api_token(token))
        )
        api_token = result.scalars().first()
        if api_token is None:
            _log.warning("token_rejected", reason="unknown_api_token")
            raise credentials_exception
        if api_token.scope == "read" and request.method not in ("GET", "HEAD", "OPTIONS"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This API token is read-only.",
            )
        user = await user_repo.get(api_token.user_id)
        if user is None or not user.is_active:
            raise credentials_exception
        api_token.last_used_at = datetime.now(timezone.utc)
        await user_repo.session.commit()
        return user

    try:
        payload = decode_token(token)
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        _log.warning("token_rejected", reason="invalid_or_expired")
        raise credentials_exception

    if payload.get("type") != "access":
        _log.warning("token_rejected", reason="wrong_type", token_type=payload.get("type"))
        raise credentials_exception

    jti = payload.get("jti")
    if jti and await is_blacklisted(redis, jti):
        _log.warning("token_rejected", reason="blacklisted", jti=jti)
        raise credentials_exception

    user_id_str: str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise credentials_exception

    user = await user_repo.get(user_id)
    if user is None or not user.is_active:
        raise credentials_exception

    return user


async def get_superuser(current_user: User = Depends(get_current_user)) -> User:
    """REQ-155: instance admin gate. is_superuser is consulted here and nowhere else —
    it never grants project-level access (DD-048)."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superuser required.")
    return current_user


async def get_project_repository(session: AsyncSession = Depends(get_db_session)) -> ProjectRepository:
    return ProjectRepository(session)


async def get_project_service(
    project_repo: ProjectRepository = Depends(get_project_repository),
    session: AsyncSession = Depends(get_db_session),
) -> ProjectService:
    from app.repositories.project_status import ProjectStatusRepository
    from app.services.project_status import ProjectStatusService
    from app.repositories.priority import PrioritySchemeRepository
    from app.services.priority import PriorityService
    from app.repositories.project_member import ProjectMemberRepository
    status_svc = ProjectStatusService(ProjectStatusRepository(session))
    priority_svc = PriorityService(PrioritySchemeRepository(session))
    return ProjectService(
        project_repo,
        status_service=status_svc,
        priority_service=priority_svc,
        # HW-18: validates default_assignee_id membership
        member_repo=ProjectMemberRepository(session),
    )


# ── Project-level access guards ───────────────────────────────────────────────

async def get_owned_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    project_repo: ProjectRepository = Depends(get_project_repository),
) -> Project:
    project = await project_repo.get(project_id)
    if not project or project.owner_id != current_user.id:
        _log.warning(
            "ownership_denied",
            user_id=str(current_user.id),
            project_id=str(project_id),
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


async def get_viewer_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    project_repo: ProjectRepository = Depends(get_project_repository),
    session: AsyncSession = Depends(get_db_session),
) -> Project:
    project = await project_repo.get(project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    if project.owner_id == current_user.id:
        return project
    membership = await ProjectMemberRepository(session).get_membership(project_id, current_user.id)
    if not membership:
        raise AppError(status.HTTP_403_FORBIDDEN, "INSUFFICIENT_ROLE", "Access denied.")
    return project


async def get_member_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    project_repo: ProjectRepository = Depends(get_project_repository),
    session: AsyncSession = Depends(get_db_session),
) -> Project:
    project = await project_repo.get(project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    if project.owner_id == current_user.id:
        return project
    membership = await ProjectMemberRepository(session).get_membership(project_id, current_user.id)
    if not membership or MemberRole(membership.role) == MemberRole.viewer:
        raise AppError(status.HTTP_403_FORBIDDEN, "INSUFFICIENT_ROLE", "Access denied.")
    return project


async def get_admin_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    project_repo: ProjectRepository = Depends(get_project_repository),
    session: AsyncSession = Depends(get_db_session),
) -> Project:
    project = await project_repo.get(project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    if project.owner_id == current_user.id:
        return project
    membership = await ProjectMemberRepository(session).get_membership(project_id, current_user.id)
    if not membership or MemberRole(membership.role) != MemberRole.admin:
        raise AppError(status.HTTP_403_FORBIDDEN, "INSUFFICIENT_ROLE", "Access denied.")
    return project


# ── Board-level access guards ─────────────────────────────────────────────────

async def get_board_repository(session: AsyncSession = Depends(get_db_session)) -> BoardRepository:
    return BoardRepository(session)


async def get_board_service(
    board_repo: BoardRepository = Depends(get_board_repository),
) -> BoardService:
    return BoardService(board_repo)


async def get_owned_board(
    board_id: uuid.UUID,
    project: Project = Depends(get_owned_project),
    board_repo: BoardRepository = Depends(get_board_repository),
) -> Board:
    board = await board_repo.get(board_id)
    if not board or board.project_id != project.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")
    return board


async def get_member_board(
    board_id: uuid.UUID,
    project: Project = Depends(get_member_project),
    board_repo: BoardRepository = Depends(get_board_repository),
) -> Board:
    board = await board_repo.get(board_id)
    if not board or board.project_id != project.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")
    return board


async def get_viewer_board(
    board_id: uuid.UUID,
    project: Project = Depends(get_viewer_project),
    board_repo: BoardRepository = Depends(get_board_repository),
) -> Board:
    board = await board_repo.get(board_id)
    if not board or board.project_id != project.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")
    return board


# ── Project-scoped task guards ────────────────────────────────────────────────

async def get_task_repository(session: AsyncSession = Depends(get_db_session)) -> TaskRepository:
    return TaskRepository(session)


async def get_task_service(
    task_repo: TaskRepository = Depends(get_task_repository),
    project_repo: ProjectRepository = Depends(get_project_repository),
) -> TaskService:
    # project_repo: HW-18 default-assignee policy lookup on create.
    return TaskService(task_repo, project_repo=project_repo)


async def get_subtask_service(
    task_repo: TaskRepository = Depends(get_task_repository),
) -> SubtaskService:
    return SubtaskService(task_repo)


async def get_project_task(
    task_id: uuid.UUID,
    project: Project = Depends(get_viewer_project),
    task_repo: TaskRepository = Depends(get_task_repository),
) -> Task:
    task = await task_repo.get(task_id)
    if not task or task.project_id != project.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return task


async def get_viewer_project_task(
    task_id: uuid.UUID,
    project: Project = Depends(get_viewer_project),
    task_repo: TaskRepository = Depends(get_task_repository),
) -> Task:
    task = await task_repo.get(task_id)
    if not task or task.project_id != project.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return task


async def get_member_project_task(
    task_id: uuid.UUID,
    project: Project = Depends(get_member_project),
    task_repo: TaskRepository = Depends(get_task_repository),
) -> Task:
    task = await task_repo.get(task_id)
    if not task or task.project_id != project.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return task


# ── Misc repositories and services ───────────────────────────────────────────

async def get_email_verification_repository(
    session: AsyncSession = Depends(get_db_session),
) -> EmailVerificationRepository:
    return EmailVerificationRepository(session)


async def get_password_reset_repository(
    session: AsyncSession = Depends(get_db_session),
) -> PasswordResetRepository:
    return PasswordResetRepository(session)


async def get_project_member_repository(
    session: AsyncSession = Depends(get_db_session),
) -> ProjectMemberRepository:
    return ProjectMemberRepository(session)


async def get_project_invite_repository(
    session: AsyncSession = Depends(get_db_session),
) -> ProjectInviteRepository:
    return ProjectInviteRepository(session)


async def get_project_member_service(
    member_repo: ProjectMemberRepository = Depends(get_project_member_repository),
    invite_repo: ProjectInviteRepository = Depends(get_project_invite_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    project_repo: ProjectRepository = Depends(get_project_repository),
    task_repo: TaskRepository = Depends(get_task_repository),
) -> ProjectMemberService:
    return ProjectMemberService(member_repo, invite_repo, user_repo, project_repo, task_repo)


async def get_ai_service() -> AIService:
    return AIService()


async def get_attachment_repository(
    session: AsyncSession = Depends(get_db_session),
) -> AttachmentRepository:
    return AttachmentRepository(session)


async def get_attachment_service(
    repo: AttachmentRepository = Depends(get_attachment_repository),
):
    from app.services.attachment import AttachmentService
    return AttachmentService(repo)


async def get_comment_repository(
    session: AsyncSession = Depends(get_db_session),
) -> CommentRepository:
    return CommentRepository(session)


async def get_comment_history_repository(
    session: AsyncSession = Depends(get_db_session),
) -> CommentHistoryRepository:
    return CommentHistoryRepository(session)


async def get_comment_service(
    repo: CommentRepository = Depends(get_comment_repository),
    history_repo: CommentHistoryRepository = Depends(get_comment_history_repository),
):
    from app.services.comment import CommentService
    return CommentService(repo, history_repo)


async def get_task_watcher_repository(
    session: AsyncSession = Depends(get_db_session),
) -> TaskWatcherRepository:
    return TaskWatcherRepository(session)


async def get_notification_repository(
    session: AsyncSession = Depends(get_db_session),
) -> NotificationRepository:
    return NotificationRepository(session)


async def get_notification_preferences_repository(
    session: AsyncSession = Depends(get_db_session),
) -> NotificationPreferencesRepository:
    return NotificationPreferencesRepository(session)


async def get_notification_service(
    notif_repo: NotificationRepository = Depends(get_notification_repository),
    prefs_repo: NotificationPreferencesRepository = Depends(get_notification_preferences_repository),
    watcher_repo: TaskWatcherRepository = Depends(get_task_watcher_repository),
    user_repo: UserRepository = Depends(get_user_repository),
):
    from app.services.notification import NotificationService
    return NotificationService(notif_repo, prefs_repo, watcher_repo, user_repo)


async def get_watcher_service(
    watcher_repo: TaskWatcherRepository = Depends(get_task_watcher_repository),
):
    from app.services.watcher import WatcherService
    return WatcherService(watcher_repo)


async def get_tag_repository(session: AsyncSession = Depends(get_db_session)):
    from app.repositories.tag import TagRepository
    return TagRepository(session)


async def get_tag_service(
    tag_repo=Depends(get_tag_repository),
    member_repo: ProjectMemberRepository = Depends(get_project_member_repository),
):
    from app.services.tag import TagService
    return TagService(tag_repo=tag_repo, member_repo=member_repo)


async def get_activity_repository(session: AsyncSession = Depends(get_db_session)):
    from app.repositories.activity import ActivityRepository
    return ActivityRepository(session)


async def get_activity_service(repo=Depends(get_activity_repository)):
    from app.services.activity import ActivityService
    return ActivityService(repo)


async def get_project_status_service(session: AsyncSession = Depends(get_db_session)):
    from app.repositories.project_status import ProjectStatusRepository
    from app.services.project_status import ProjectStatusService
    return ProjectStatusService(ProjectStatusRepository(session))


async def get_audit_log_repository(session: AsyncSession = Depends(get_db_session)):
    from app.repositories.audit_log import AuditLogRepository
    return AuditLogRepository(session)


async def get_audit_log_service(repo=Depends(get_audit_log_repository)):
    from app.services.audit_log import AuditLogService
    return AuditLogService(repo)


async def get_task_link_repository(session: AsyncSession = Depends(get_db_session)):
    from app.repositories.task_link import TaskLinkRepository
    return TaskLinkRepository(session)


async def get_task_link_service(
    repo=Depends(get_task_link_repository),
    session: AsyncSession = Depends(get_db_session),
):
    from app.services.task_link import TaskLinkService
    return TaskLinkService(repo, session)


async def get_stats_repository(session: AsyncSession = Depends(get_db_session)):
    from app.repositories.stats import StatsRepository
    return StatsRepository(session)


async def get_stats_service(repo=Depends(get_stats_repository)):
    from app.services.stats import StatsService
    return StatsService(repo)


async def get_sprint_repository(session: AsyncSession = Depends(get_db_session)):
    from app.repositories.sprint import SprintRepository
    return SprintRepository(session)


async def get_sprint_service(session: AsyncSession = Depends(get_db_session)):
    from app.repositories.sprint import SprintRepository
    from app.repositories.task import TaskRepository
    from app.repositories.project_status import ProjectStatusRepository
    from app.services.sprint import SprintService
    return SprintService(
        SprintRepository(session),
        TaskRepository(session),
        ProjectStatusRepository(session),
    )

