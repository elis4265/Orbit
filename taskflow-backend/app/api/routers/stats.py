import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_current_user, get_viewer_project, get_stats_service
from app.models.user import User
from app.models.project import Project
from app.schemas.stats import (
    BurndownPoint,
    CFDPoint,
    CycleTimeResponse,
    ForecastResponse,
    StatsResponse,
    TimeInStatusPoint,
)
from app.services.stats import StatsService

router = APIRouter(prefix="/projects/{project_id}", tags=["Stats"])


def _resolve_dates(
    date_from: Optional[date], date_to: Optional[date]
) -> tuple[date, date]:
    end = date_to or date.today()
    start = date_from or (end - timedelta(days=30))
    return start, end


@router.get("/stats", response_model=StatsResponse)
async def get_workspace_stats(
    project_id: uuid.UUID,
    board_id: Optional[uuid.UUID] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    _project: Project = Depends(get_viewer_project),
    current_user: User = Depends(get_current_user),
    svc: StatsService = Depends(get_stats_service),
) -> StatsResponse:
    start, end = _resolve_dates(date_from, date_to)
    # board_id is vestigial — tasks are project-scoped, so stats are project-wide.
    return await svc.get_project_stats(project_id, start, end)


@router.get("/stats/burndown", response_model=list[BurndownPoint])
async def get_burndown(
    project_id: uuid.UUID,
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    board_id: Optional[uuid.UUID] = Query(None),
    unit: str = Query("count"),
    _project: Project = Depends(get_viewer_project),
    current_user: User = Depends(get_current_user),
    svc: StatsService = Depends(get_stats_service),
) -> list[BurndownPoint]:
    date_from, date_to = _resolve_dates(start, end)
    return await svc.get_burndown(project_id, date_from, date_to, unit)


@router.get("/stats/forecast", response_model=ForecastResponse)
async def get_forecast(
    project_id: uuid.UUID,
    weeks: int = Query(12, ge=4, le=52),
    remaining: Optional[int] = Query(None, ge=0),
    _project: Project = Depends(get_viewer_project),
    current_user: User = Depends(get_current_user),
    svc: StatsService = Depends(get_stats_service),
) -> ForecastResponse:
    return await svc.get_forecast(project_id, weeks, remaining)


@router.get("/stats/cfd", response_model=list[CFDPoint])
async def get_cfd(
    project_id: uuid.UUID,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    board_id: Optional[uuid.UUID] = Query(None),
    _project: Project = Depends(get_viewer_project),
    current_user: User = Depends(get_current_user),
    svc: StatsService = Depends(get_stats_service),
) -> list[CFDPoint]:
    start, end = _resolve_dates(date_from, date_to)
    return await svc.get_cfd(project_id, start, end)


@router.get("/stats/time-in-status", response_model=list[TimeInStatusPoint])
async def get_time_in_status(
    project_id: uuid.UUID,
    board_id: Optional[uuid.UUID] = Query(None),
    _project: Project = Depends(get_viewer_project),
    current_user: User = Depends(get_current_user),
    svc: StatsService = Depends(get_stats_service),
) -> list[TimeInStatusPoint]:
    return await svc.get_time_in_status(project_id)


@router.get("/stats/cycle-time", response_model=CycleTimeResponse)
async def get_cycle_time(
    project_id: uuid.UUID,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    board_id: Optional[uuid.UUID] = Query(None),
    _project: Project = Depends(get_viewer_project),
    current_user: User = Depends(get_current_user),
    svc: StatsService = Depends(get_stats_service),
) -> CycleTimeResponse:
    start, end = _resolve_dates(date_from, date_to)
    return await svc.get_cycle_time(project_id, start, end)
