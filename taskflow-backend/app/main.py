from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.errors import AppError, STATUS_CODE_MAP
from app.core.limiter import limiter
from app.core.logging import configure_logging
from app.core.otel import configure_otel, instrument_app, instrument_db
from app.database import async_session_local
from app.api.routers.project import router as project_router
from app.api.routers.auth import router as auth_router
from app.api.routers.admin import router as admin_router
from app.api.routers.task_actions import router as task_actions_router
from app.api.routers.bulk_edit import router as bulk_edit_router
from app.api.routers.share_link import admin_router as share_admin_router, public_router as share_public_router
from app.api.routers.board import router as board_router
from app.api.routers.task import router as task_router, board_router as task_board_router
from app.api.routers.subtask import router as subtask_router
from app.api.routers.ws import router as ws_router
from app.api.routers.attachment import router as attachment_router
from app.api.routers.project_member import router as member_router
from app.api.routers.project_member import invite_accept_router
from app.api.routers.internal import router as internal_router
from app.api.routers.comment import router as comment_router, att_router as comment_att_router
from app.api.routers.watcher import router as watcher_router
from app.api.routers.notification import router as notification_router
from app.api.routers.tag import router as tag_router, task_tag_router
from app.api.routers.emote import router as emote_router
from app.api.routers.activity import task_activity_router, project_activity_router
from app.api.routers.audit_log import router as audit_log_router
from app.api.routers.user import router as user_router
from app.api.routers.api_token import router as api_token_router
from app.api.routers.webhook import router as webhook_router
from app.api.routers.work_log import router as work_log_router, report_router as time_report_router
from app.api.routers.recurring_task import router as recurring_task_router
from app.api.routers.related import router as related_router
from app.api.routers.task_import import router as task_import_router
from app.api.routers.task_link import router as task_link_router
from app.api.routers.stats import router as stats_router
from app.api.routers.sprint import router as sprint_router
from app.api.routers.project_settings import router as project_settings_router
from app.api.routers.priority import router as priority_router, schemes_router as priority_schemes_router
from app.api.routers.saved_search import router as saved_search_router
from app.api.routers.cycle import router as cycle_config_router, cycles_router
from app.api.routers.story_points import router as story_points_router
from app.api.routers.baseline import router as baseline_router
from app.api.routers.custom_field import router as custom_field_router
from app.api.routers.automation_rule import router as automation_rule_router
from app.api.routers.release import router as release_router
from app.api.routers.search import router as search_router
from app.api.routers.task_template import router as task_template_router
from app.api.routers.vcs import router as vcs_router
from app.api.routers.vcs_connection import router as vcs_connection_router, dev_links_router, integrations_router

configure_logging()
configure_otel()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    from app.core.storage import ensure_bucket
    from app.core.scheduler import start_scheduler, stop_scheduler

    async def _init_storage() -> None:
        try:
            await ensure_bucket()
        except Exception:
            pass  # MinIO unavailable — attachment ops will fail at request time

    async def _init_priorities() -> None:
        try:
            from app.database import async_session_local as _sl
            from app.repositories.priority import PrioritySchemeRepository
            from app.services.priority import PriorityService
            async with _sl() as session:
                svc = PriorityService(PrioritySchemeRepository(session))
                await svc.ensure_default_scheme()
                await session.commit()
        except Exception:
            pass  # DB unavailable — priorities seeded on next healthy start

    async def _init_superuser() -> None:
        if not settings.orbit_superuser_email:
            return
        try:
            from app.database import async_session_local as _sl
            from app.services.instance_admin import promote_superuser
            async with _sl() as session:
                await promote_superuser(session, settings.orbit_superuser_email)
                await session.commit()
        except Exception:
            pass  # DB unavailable — promotion retried on next healthy start

    asyncio.create_task(_init_storage())
    asyncio.create_task(_init_priorities())
    asyncio.create_task(_init_superuser())
    try:
        start_scheduler()
    except RuntimeError:
        pass  # event loop unavailable in test environments that reuse the process
    yield
    stop_scheduler()


app = FastAPI(
    title="Orbit Backend Engine",
    version="1.0.0",
    debug=settings.debug and settings.environment == "development",
    lifespan=lifespan,
)
instrument_app(app)
instrument_db()

app.state.limiter = limiter


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "detail": exc.detail_data}},
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Rate limit exceeded. Please try again later.", "detail": {}}},
    )


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    code = STATUS_CODE_MAP.get(exc.status_code, "ERROR")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": code, "message": str(exc.detail), "detail": {}}},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    import json
    errors = json.loads(json.dumps(exc.errors(), default=str))
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALIDATION_ERROR", "message": "Validation failed.", "detail": errors}},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(task_actions_router, prefix="/api/v1")
app.include_router(bulk_edit_router, prefix="/api/v1")
app.include_router(share_admin_router, prefix="/api/v1")
app.include_router(share_public_router, prefix="/api/v1")
app.include_router(project_router, prefix="/api/v1")
app.include_router(board_router, prefix="/api/v1")
app.include_router(task_board_router, prefix="/api/v1")
app.include_router(task_router, prefix="/api/v1")
app.include_router(subtask_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/api/v1")
app.include_router(attachment_router, prefix="/api/v1")
app.include_router(member_router, prefix="/api/v1")
app.include_router(invite_accept_router, prefix="/api/v1")
app.include_router(internal_router, prefix="/api/v1")
app.include_router(comment_router, prefix="/api/v1")
app.include_router(comment_att_router, prefix="/api/v1")
app.include_router(watcher_router, prefix="/api/v1")
app.include_router(notification_router, prefix="/api/v1")
app.include_router(tag_router, prefix="/api/v1")
app.include_router(emote_router, prefix="/api/v1")
app.include_router(task_tag_router, prefix="/api/v1")
app.include_router(task_activity_router, prefix="/api/v1")
app.include_router(project_activity_router, prefix="/api/v1")
app.include_router(audit_log_router, prefix="/api/v1")
app.include_router(user_router, prefix="/api/v1")
app.include_router(api_token_router, prefix="/api/v1")
app.include_router(webhook_router, prefix="/api/v1")
app.include_router(work_log_router, prefix="/api/v1")
app.include_router(time_report_router, prefix="/api/v1")
app.include_router(recurring_task_router, prefix="/api/v1")
app.include_router(related_router, prefix="/api/v1")
app.include_router(task_import_router, prefix="/api/v1")
app.include_router(task_link_router, prefix="/api/v1")
app.include_router(stats_router, prefix="/api/v1")
app.include_router(sprint_router, prefix="/api/v1")
app.include_router(project_settings_router, prefix="/api/v1")
app.include_router(priority_router, prefix="/api/v1")
app.include_router(priority_schemes_router, prefix="/api/v1")
app.include_router(saved_search_router, prefix="/api/v1")
app.include_router(cycle_config_router, prefix="/api/v1")
app.include_router(cycles_router, prefix="/api/v1")
app.include_router(story_points_router, prefix="/api/v1")
app.include_router(baseline_router, prefix="/api/v1")
app.include_router(custom_field_router, prefix="/api/v1")
app.include_router(automation_rule_router, prefix="/api/v1")
app.include_router(release_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(task_template_router, prefix="/api/v1")
app.include_router(vcs_router, prefix="/api/v1")
app.include_router(vcs_connection_router, prefix="/api/v1")
app.include_router(dev_links_router, prefix="/api/v1")
app.include_router(integrations_router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
async def health():
    try:
        async with async_session_local() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ok", "database": "reachable"}
    except Exception as e:
        return {"status": "error", "database": "unreachable", "detail": str(e)}
