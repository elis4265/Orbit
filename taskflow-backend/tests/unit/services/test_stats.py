"""Unit tests for StatsService and StatsRepository (mocked)."""
import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.stats import (
    AgeDistributionBucket,
    AssigneeCount,
    BurndownPoint,
    CFDPoint,
    CycleTimePercentiles,
    CycleTimeResponse,
    CycleTimeScatterPoint,
    PriorityCount,
    StatusCount,
    TimeInStatusPoint,
    ThroughputPoint,
)
from app.services.stats import StatsService

_WS = uuid.uuid4()
_D_FROM = date(2026, 6, 1)
_D_TO = date(2026, 6, 30)

_AGE_BUCKETS = [
    AgeDistributionBucket(label="<7d",    count=3,  max_days=7),
    AgeDistributionBucket(label="7-14d",  count=1,  max_days=14),
    AgeDistributionBucket(label="14-30d", count=0,  max_days=30),
    AgeDistributionBucket(label="30-60d", count=2,  max_days=60),
    AgeDistributionBucket(label="60+d",   count=0,  max_days=999_999),
]

_CFD_POINTS = [
    CFDPoint(date="2026-06-01", todo=5, in_progress=2, done=0),
    CFDPoint(date="2026-06-02", todo=4, in_progress=2, done=1),
]

_TIME_IN_STATUS = [
    TimeInStatusPoint(status="todo",        avg_hours=24.0, median_hours=18.0, sample_count=10),
    TimeInStatusPoint(status="in_progress", avg_hours=48.5, median_hours=36.0, sample_count=8),
    TimeInStatusPoint(status="done",        avg_hours=0.0,  median_hours=0.0,  sample_count=0),
]

_CYCLE_TIME = CycleTimeResponse(
    lead_time=CycleTimePercentiles(p50=3.1, p85=7.0, p95=12.5),
    cycle_time=CycleTimePercentiles(p50=1.5, p85=4.2, p95=9.0),
    scatter=[
        CycleTimeScatterPoint(date="2026-06-05", lead_days=2.5, cycle_days=1.2),
        CycleTimeScatterPoint(date="2026-06-10", lead_days=5.0, cycle_days=None),
    ],
)


def _make_repo(**overrides):
    repo = MagicMock()
    defaults = {
        "get_by_status": AsyncMock(return_value=[
            StatusCount(status="todo", count=5),
            StatusCount(status="done", count=3),
        ]),
        "get_by_priority": AsyncMock(return_value=[
            PriorityCount(priority=1, count=2),
            PriorityCount(priority=3, count=6),
        ]),
        "get_by_assignee": AsyncMock(return_value=[
            AssigneeCount(user_id=uuid.uuid4(), name="Alice Smith", count=4),
        ]),
        "get_throughput": AsyncMock(return_value=[
            ThroughputPoint(date="2026-06-01", created=3, completed=2),
            ThroughputPoint(date="2026-06-02", created=1, completed=0),
        ]),
        "get_aggregate_counts": AsyncMock(return_value=(10, 7)),
        "get_burndown": AsyncMock(return_value=[
            BurndownPoint(date="2026-06-01", created=3, completed=2, remaining=1),
            BurndownPoint(date="2026-06-02", created=1, completed=0, remaining=2),
        ]),
        "get_overdue_count": AsyncMock(return_value=3),
        "get_age_distribution": AsyncMock(return_value=_AGE_BUCKETS),
        "get_cfd": AsyncMock(return_value=_CFD_POINTS),
        "get_time_in_status": AsyncMock(return_value=_TIME_IN_STATUS),
        "get_cycle_time": AsyncMock(return_value=_CYCLE_TIME),
    }
    defaults.update(overrides)
    for attr, val in defaults.items():
        setattr(repo, attr, val)
    return repo


# ── Core stats ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_project_stats_returns_all_fields():
    repo = _make_repo()
    svc = StatsService(repo)
    result = await svc.get_project_stats(_WS, _D_FROM, _D_TO)

    assert len(result.by_status) == 2
    assert result.by_status[0].status == "todo"
    assert result.by_status[1].count == 3
    assert len(result.by_priority) == 2
    assert result.by_assignee[0].name == "Alice Smith"
    assert len(result.throughput) == 2
    assert result.throughput[0].date == "2026-06-01"
    assert result.created_count == 10
    assert result.completed_count == 7
    assert result.completion_rate == 70.0


@pytest.mark.asyncio
async def test_completion_rate_zero_when_no_tasks_created():
    repo = _make_repo(get_aggregate_counts=AsyncMock(return_value=(0, 0)))
    svc = StatsService(repo)
    result = await svc.get_project_stats(_WS, _D_FROM, _D_TO)
    assert result.completion_rate == 0.0
    assert result.created_count == 0
    assert result.completed_count == 0


@pytest.mark.asyncio
async def test_completion_rate_rounds_to_one_decimal():
    repo = _make_repo(get_aggregate_counts=AsyncMock(return_value=(3, 1)))
    svc = StatsService(repo)
    result = await svc.get_project_stats(_WS, _D_FROM, _D_TO)
    assert result.completion_rate == 33.3


@pytest.mark.asyncio
async def test_get_project_stats_calls_repo_with_project_id():
    repo = _make_repo()
    svc = StatsService(repo)
    await svc.get_project_stats(_WS, _D_FROM, _D_TO)

    repo.get_by_status.assert_called_once_with(_WS)
    repo.get_by_priority.assert_called_once_with(_WS)
    repo.get_by_assignee.assert_called_once_with(_WS)


@pytest.mark.asyncio
async def test_get_burndown_delegates_to_repo():
    repo = _make_repo()
    svc = StatsService(repo)
    result = await svc.get_burndown(_WS, _D_FROM, date(2026, 6, 2))
    assert len(result) == 2
    assert result[0].remaining == 1
    assert result[1].remaining == 2
    repo.get_burndown.assert_called_once_with(_WS, _D_FROM, date(2026, 6, 2))


@pytest.mark.asyncio
async def test_by_status_empty_when_no_tasks():
    repo = _make_repo(get_by_status=AsyncMock(return_value=[]))
    svc = StatsService(repo)
    result = await svc.get_project_stats(_WS, _D_FROM, _D_TO)
    assert result.by_status == []


@pytest.mark.asyncio
async def test_by_assignee_empty_when_all_assigned_to_none():
    repo = _make_repo(get_by_assignee=AsyncMock(return_value=[]))
    svc = StatsService(repo)
    result = await svc.get_project_stats(_WS, _D_FROM, _D_TO)
    assert result.by_assignee == []


# ── Overdue + age ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stats_response_includes_overdue_count():
    repo = _make_repo(get_overdue_count=AsyncMock(return_value=5))
    svc = StatsService(repo)
    result = await svc.get_project_stats(_WS, _D_FROM, _D_TO)
    assert result.overdue_count == 5
    repo.get_overdue_count.assert_called_once()


@pytest.mark.asyncio
async def test_stats_response_includes_age_distribution():
    repo = _make_repo()
    svc = StatsService(repo)
    result = await svc.get_project_stats(_WS, _D_FROM, _D_TO)
    assert len(result.by_age) == 5
    assert result.by_age[0].label == "<7d"
    assert result.by_age[0].count == 3


@pytest.mark.asyncio
async def test_overdue_zero_when_no_overdue():
    repo = _make_repo(get_overdue_count=AsyncMock(return_value=0))
    svc = StatsService(repo)
    result = await svc.get_project_stats(_WS, _D_FROM, _D_TO)
    assert result.overdue_count == 0


# ── CFD ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_cfd_delegates_to_repo():
    repo = _make_repo()
    svc = StatsService(repo)
    result = await svc.get_cfd(_WS, _D_FROM, _D_TO)
    assert len(result) == 2
    assert result[0].date == "2026-06-01"
    assert result[0].todo == 5
    assert result[0].in_progress == 2
    assert result[0].done == 0
    repo.get_cfd.assert_called_once_with(_WS, _D_FROM, _D_TO)


@pytest.mark.asyncio
async def test_get_cfd_empty_when_no_tasks():
    repo = _make_repo(get_cfd=AsyncMock(return_value=[]))
    svc = StatsService(repo)
    result = await svc.get_cfd(_WS, _D_FROM, _D_TO)
    assert result == []


# ── Time in Status ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_time_in_status_returns_all_statuses():
    repo = _make_repo()
    svc = StatsService(repo)
    result = await svc.get_time_in_status(_WS)
    assert len(result) == 3
    statuses = [p.status for p in result]
    assert "todo" in statuses
    assert "in_progress" in statuses
    assert "done" in statuses


@pytest.mark.asyncio
async def test_get_time_in_status_values():
    repo = _make_repo()
    svc = StatsService(repo)
    result = await svc.get_time_in_status(_WS)
    in_prog = next(p for p in result if p.status == "in_progress")
    assert in_prog.avg_hours == 48.5
    assert in_prog.median_hours == 36.0
    assert in_prog.sample_count == 8


@pytest.mark.asyncio
async def test_get_time_in_status_delegates_to_repo():
    repo = _make_repo()
    svc = StatsService(repo)
    await svc.get_time_in_status(_WS)
    repo.get_time_in_status.assert_called_once_with(_WS)


# ── Cycle Time ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_cycle_time_returns_percentiles():
    repo = _make_repo()
    svc = StatsService(repo)
    result = await svc.get_cycle_time(_WS, _D_FROM, _D_TO)
    assert result.lead_time is not None
    assert result.lead_time.p50 == 3.1
    assert result.lead_time.p85 == 7.0
    assert result.lead_time.p95 == 12.5
    assert result.cycle_time is not None
    assert result.cycle_time.p50 == 1.5


@pytest.mark.asyncio
async def test_get_cycle_time_scatter_points():
    repo = _make_repo()
    svc = StatsService(repo)
    result = await svc.get_cycle_time(_WS, _D_FROM, _D_TO)
    assert len(result.scatter) == 2
    assert result.scatter[0].lead_days == 2.5
    assert result.scatter[1].cycle_days is None


@pytest.mark.asyncio
async def test_get_cycle_time_empty_when_no_completions():
    repo = _make_repo(get_cycle_time=AsyncMock(
        return_value=CycleTimeResponse(lead_time=None, cycle_time=None, scatter=[])
    ))
    svc = StatsService(repo)
    result = await svc.get_cycle_time(_WS, _D_FROM, _D_TO)
    assert result.lead_time is None
    assert result.cycle_time is None
    assert result.scatter == []


@pytest.mark.asyncio
async def test_get_cycle_time_delegates_to_repo():
    repo = _make_repo()
    svc = StatsService(repo)
    await svc.get_cycle_time(_WS, _D_FROM, _D_TO)
    repo.get_cycle_time.assert_called_once_with(_WS, _D_FROM, _D_TO)
