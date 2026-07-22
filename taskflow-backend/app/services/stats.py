import uuid
from datetime import date, timedelta

from app.repositories.stats import StatsRepository
from app.services.forecast import monte_carlo_periods
from app.schemas.stats import (
    BurndownPoint,
    CFDPoint,
    CycleTimeResponse,
    ForecastResponse,
    StatsResponse,
    TimeInStatusPoint,
)


class StatsService:
    def __init__(self, repo: StatsRepository):
        self.repo = repo

    async def get_project_stats(
        self,
        project_id: uuid.UUID,
        date_from: date,
        date_to: date,
    ) -> StatsResponse:
        by_status = await self.repo.get_by_status(project_id)
        by_priority = await self.repo.get_by_priority(project_id)
        by_assignee = await self.repo.get_by_assignee(project_id)
        throughput = await self.repo.get_throughput(project_id, date_from, date_to)
        created_count, completed_count = await self.repo.get_aggregate_counts(
            project_id, date_from, date_to
        )
        completion_rate = (
            round(completed_count / created_count * 100, 1) if created_count > 0 else 0.0
        )
        overdue_count = await self.repo.get_overdue_count(project_id)
        by_age = await self.repo.get_age_distribution(project_id)

        return StatsResponse(
            by_status=by_status,
            by_priority=by_priority,
            by_assignee=by_assignee,
            throughput=throughput,
            completion_rate=completion_rate,
            completed_count=completed_count,
            created_count=created_count,
            overdue_count=overdue_count,
            by_age=by_age,
        )

    async def get_burndown(
        self,
        project_id: uuid.UUID,
        date_from: date,
        date_to: date,
        unit: str = "count",
    ) -> list[BurndownPoint]:
        if unit == "points":
            return await self.repo.get_point_burndown(project_id, date_from, date_to)
        return await self.repo.get_burndown(project_id, date_from, date_to)

    async def get_cfd(
        self,
        project_id: uuid.UUID,
        date_from: date,
        date_to: date,
    ) -> list[CFDPoint]:
        return await self.repo.get_cfd(project_id, date_from, date_to)

    async def get_time_in_status(
        self, project_id: uuid.UUID
    ) -> list[TimeInStatusPoint]:
        return await self.repo.get_time_in_status(project_id)

    async def get_cycle_time(
        self,
        project_id: uuid.UUID,
        date_from: date,
        date_to: date,
    ) -> CycleTimeResponse:
        return await self.repo.get_cycle_time(project_id, date_from, date_to)

    async def get_forecast(
        self,
        project_id: uuid.UUID,
        weeks: int = 12,
        remaining_override: int | None = None,
    ) -> ForecastResponse:
        throughput = await self.repo.get_weekly_throughput(project_id, weeks)
        remaining = (
            remaining_override
            if remaining_override is not None
            else await self.repo.count_remaining(project_id)
        )
        # Need a couple of productive weeks before a forecast means anything.
        enough = sum(1 for t in throughput if t > 0) >= 2
        mc = monte_carlo_periods(throughput, remaining) if enough else None
        if mc is None:
            return ForecastResponse(enough_data=False, remaining=remaining, throughput=throughput)

        today = date.today()
        to_date = lambda wk: (today + timedelta(weeks=wk)).isoformat()
        return ForecastResponse(
            enough_data=True,
            remaining=remaining,
            throughput=throughput,
            p50_weeks=mc["p50"], p85_weeks=mc["p85"], p95_weeks=mc["p95"],
            p50_date=to_date(mc["p50"]), p85_date=to_date(mc["p85"]), p95_date=to_date(mc["p95"]),
        )
