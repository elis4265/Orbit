import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.task import Task, TaskStatus
from app.models.priority import PrioritySchemeItem
from app.models.user import User
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

_AGE_BUCKETS = [
    ("<7d",    0,   7),
    ("7-14d",  7,  14),
    ("14-30d", 14, 30),
    ("30-60d", 30, 60),
    ("60+d",   60, 999_999),
]


def _dt_range(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    tz = timezone.utc
    return (
        datetime(date_from.year, date_from.month, date_from.day, tzinfo=tz),
        datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=tz),
    )


def _percentiles(data: list[float]) -> CycleTimePercentiles | None:
    if not data:
        return None
    s = sorted(data)
    n = len(s)

    def p(pct: int) -> float:
        idx = min(int(pct / 100 * n), n - 1)
        return round(s[idx], 1)

    return CycleTimePercentiles(p50=p(50), p85=p(85), p95=p(95))


class StatsRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_status(
        self, project_id: uuid.UUID
    ) -> list[StatusCount]:
        q = (
            select(Task.status, func.count(Task.id).label("cnt"))
            .where(Task.project_id == project_id, Task.parent_id.is_(None), Task.archived_at.is_(None))
            .group_by(Task.status)
        )
        rows = (await self.session.execute(q)).all()
        return [
            StatusCount(
                status=r.status.value if hasattr(r.status, "value") else str(r.status),
                count=r.cnt,
            )
            for r in rows
        ]

    async def get_by_priority(
        self, project_id: uuid.UUID
    ) -> list[PriorityCount]:
        # Priorities are named scheme items now — group by priority_id, resolve the name.
        q = (
            select(Task.priority_id, PrioritySchemeItem.name, func.count(Task.id).label("cnt"))
            .outerjoin(PrioritySchemeItem, Task.priority_id == PrioritySchemeItem.id)
            .where(Task.project_id == project_id, Task.parent_id.is_(None), Task.archived_at.is_(None))
            .group_by(Task.priority_id, PrioritySchemeItem.name)
        )
        rows = (await self.session.execute(q)).all()
        return [
            PriorityCount(
                priority_id=str(r.priority_id) if r.priority_id else None,
                priority_name=r.name or "None",
                count=r.cnt,
            )
            for r in rows
        ]

    async def get_by_assignee(
        self, project_id: uuid.UUID
    ) -> list[AssigneeCount]:
        q = (
            select(
                Task.assignee_id,
                User.first_name,
                User.last_name,
                User.username,
                User.email,
                func.count(Task.id).label("cnt"),
            )
            .join(User, User.id == Task.assignee_id)
            .where(
                Task.project_id == project_id,
                Task.parent_id.is_(None),
                Task.archived_at.is_(None),
                Task.status != TaskStatus.done,
                Task.assignee_id.isnot(None),
            )
            .group_by(
                Task.assignee_id, User.first_name, User.last_name, User.username, User.email
            )
            .order_by(func.count(Task.id).desc())
            .limit(10)
        )
        rows = (await self.session.execute(q)).all()
        return [
            AssigneeCount(
                user_id=r.assignee_id,
                name=(
                    f"{r.first_name} {r.last_name}".strip()
                    if r.first_name and r.last_name
                    else r.username or r.email
                ),
                count=r.cnt,
            )
            for r in rows
        ]

    async def get_throughput(
        self,
        project_id: uuid.UUID,
        date_from: date,
        date_to: date,
    ) -> list[ThroughputPoint]:
        dt_from, dt_to = _dt_range(date_from, date_to)

        base = lambda action: (  # noqa: E731
            select(cast(Activity.created_at, Date).label("day"), func.count(Activity.id).label("cnt"))
            .where(
                Activity.project_id == project_id,
                Activity.entity_type == "task",
                Activity.action == action,
                Activity.created_at >= dt_from,
                Activity.created_at <= dt_to,
            )
            .group_by(cast(Activity.created_at, Date))
        )

        q_created = base("task_created")
        q_completed = base("status_changed").where(Activity.new_value == "done")

        created_map = {r.day: r.cnt for r in (await self.session.execute(q_created)).all()}
        completed_map = {r.day: r.cnt for r in (await self.session.execute(q_completed)).all()}

        points, current = [], date_from
        while current <= date_to:
            points.append(ThroughputPoint(
                date=current.isoformat(),
                created=created_map.get(current, 0),
                completed=completed_map.get(current, 0),
            ))
            current += timedelta(days=1)
        return points

    async def get_aggregate_counts(
        self,
        project_id: uuid.UUID,
        date_from: date,
        date_to: date,
    ) -> tuple[int, int]:
        dt_from, dt_to = _dt_range(date_from, date_to)

        q_c = select(func.count(Activity.id)).where(
            Activity.project_id == project_id,
            Activity.entity_type == "task",
            Activity.action == "task_created",
            Activity.created_at >= dt_from,
            Activity.created_at <= dt_to,
        )
        q_d = select(func.count(Activity.id)).where(
            Activity.project_id == project_id,
            Activity.entity_type == "task",
            Activity.action == "status_changed",
            Activity.new_value == "done",
            Activity.created_at >= dt_from,
            Activity.created_at <= dt_to,
        )
        created = (await self.session.execute(q_c)).scalar_one()
        completed = (await self.session.execute(q_d)).scalar_one()
        return created, completed

    async def get_burndown(
        self,
        project_id: uuid.UUID,
        date_from: date,
        date_to: date,
    ) -> list[BurndownPoint]:
        dt_from, dt_to = _dt_range(date_from, date_to)

        q_c = (
            select(cast(Activity.created_at, Date).label("day"), func.count(Activity.id).label("cnt"))
            .where(
                Activity.project_id == project_id,
                Activity.entity_type == "task",
                Activity.action == "task_created",
                Activity.created_at >= dt_from,
                Activity.created_at <= dt_to,
            )
            .group_by(cast(Activity.created_at, Date))
        )
        q_d = (
            select(cast(Activity.created_at, Date).label("day"), func.count(Activity.id).label("cnt"))
            .where(
                Activity.project_id == project_id,
                Activity.entity_type == "task",
                Activity.action == "status_changed",
                Activity.new_value == "done",
                Activity.created_at >= dt_from,
                Activity.created_at <= dt_to,
            )
            .group_by(cast(Activity.created_at, Date))
        )

        created_map = {r.day: r.cnt for r in (await self.session.execute(q_c)).all()}
        completed_map = {r.day: r.cnt for r in (await self.session.execute(q_d)).all()}

        points, current, cum_c, cum_d = [], date_from, 0, 0
        while current <= date_to:
            cum_c += created_map.get(current, 0)
            cum_d += completed_map.get(current, 0)
            points.append(BurndownPoint(
                date=current.isoformat(),
                created=created_map.get(current, 0),
                completed=completed_map.get(current, 0),
                remaining=max(0, cum_c - cum_d),
            ))
            current += timedelta(days=1)
        return points

    async def get_weekly_throughput(self, project_id: uuid.UUID, weeks: int = 12) -> list[int]:
        """Completed items per week (oldest→newest), dense (idle weeks = 0)."""
        since = datetime.now(timezone.utc) - timedelta(weeks=weeks)
        week = func.date_trunc("week", Activity.created_at)
        q = (
            select(week.label("w"), func.count(Activity.id).label("cnt"))
            .where(
                Activity.project_id == project_id,
                Activity.entity_type == "task",
                Activity.action == "status_changed",
                Activity.new_value == "done",
                Activity.created_at >= since,
            )
            .group_by(week)
        )
        rows = (await self.session.execute(q)).all()
        counts = {r.w.date(): r.cnt for r in rows}
        today = datetime.now(timezone.utc).date()
        this_monday = today - timedelta(days=today.weekday())
        buckets = [this_monday - timedelta(weeks=i) for i in range(weeks - 1, -1, -1)]
        return [counts.get(b, 0) for b in buckets]

    async def count_remaining(self, project_id: uuid.UUID) -> int:
        """Open (not-done) tasks — the forecast backlog."""
        q = select(func.count(Task.id)).where(
            Task.project_id == project_id, Task.status != TaskStatus.done
        )
        return int((await self.session.execute(q)).scalar() or 0)

    async def get_point_burndown(
        self,
        project_id: uuid.UUID,
        date_from: date,
        date_to: date,
    ) -> list[BurndownPoint]:
        """Story-point-weighted burndown: sums task.estimate via the activity ledger
        (created points vs completed points) instead of counting tasks."""
        dt_from, dt_to = _dt_range(date_from, date_to)
        pts = func.coalesce(func.sum(Task.estimate), 0)

        def _q(action: str, done: bool):
            q = (
                select(cast(Activity.created_at, Date).label("day"), pts.label("pts"))
                .join(Task, Task.id == Activity.entity_id)
                .where(
                    Activity.project_id == project_id,
                    Activity.entity_type == "task",
                    Activity.action == action,
                    Activity.created_at >= dt_from,
                    Activity.created_at <= dt_to,
                )
                .group_by(cast(Activity.created_at, Date))
            )
            if done:
                q = q.where(Activity.new_value == "done")
            return q

        created_map = {r.day: r.pts for r in (await self.session.execute(_q("task_created", False))).all()}
        completed_map = {r.day: r.pts for r in (await self.session.execute(_q("status_changed", True))).all()}

        bd, current, cum_c, cum_d = [], date_from, 0, 0
        while current <= date_to:
            cum_c += created_map.get(current, 0)
            cum_d += completed_map.get(current, 0)
            bd.append(BurndownPoint(
                date=current.isoformat(),
                created=created_map.get(current, 0),
                completed=completed_map.get(current, 0),
                remaining=max(0, cum_c - cum_d),
            ))
            current += timedelta(days=1)
        return bd

    async def get_overdue_count(
        self, project_id: uuid.UUID
    ) -> int:
        now = datetime.now(tz=timezone.utc)
        # completed_at excludes any resolved status (completed/cancelled), incl.
        # user-defined ones; Task.status is the legacy enum custom statuses bypass.
        q = select(func.count(Task.id)).where(
            Task.project_id == project_id,
            Task.parent_id.is_(None),
            Task.completed_at.is_(None),
            Task.due_date.isnot(None),
            Task.due_date < now,
        )
        return (await self.session.execute(q)).scalar_one()

    async def get_age_distribution(
        self, project_id: uuid.UUID
    ) -> list[AgeDistributionBucket]:
        now = datetime.now(tz=timezone.utc)
        q = select(Task.created_at).where(
            Task.project_id == project_id,
            Task.parent_id.is_(None),
            Task.status != TaskStatus.done,
        )
        rows = (await self.session.execute(q)).scalars().all()

        bucket_counts: dict[str, int] = {label: 0 for label, _, _ in _AGE_BUCKETS}
        for created_at in rows:
            age_days = (now - created_at).days
            for label, low, high in _AGE_BUCKETS:
                if low <= age_days < high:
                    bucket_counts[label] += 1
                    break

        return [
            AgeDistributionBucket(label=label, count=bucket_counts[label], max_days=high)
            for label, _, high in _AGE_BUCKETS
        ]

    async def get_cfd(
        self,
        project_id: uuid.UUID,
        date_from: date,
        date_to: date,
    ) -> list[CFDPoint]:
        _, dt_to = _dt_range(date_from, date_to)

        q_tasks = select(Task.id, Task.created_at).where(
            Task.project_id == project_id,
            Task.created_at <= dt_to,
            Task.parent_id.is_(None),
        )
        tasks = (await self.session.execute(q_tasks)).all()
        if not tasks:
            return []

        task_ids = [t.id for t in tasks]
        q_changes = (
            select(Activity.entity_id, Activity.new_value, Activity.created_at)
            .where(
                Activity.entity_type == "task",
                Activity.action == "status_changed",
                Activity.entity_id.in_(task_ids),
            )
            .order_by(Activity.entity_id, Activity.created_at)
        )
        changes = (await self.session.execute(q_changes)).all()

        task_history: dict[uuid.UUID, list[tuple[datetime, str]]] = defaultdict(list)
        for c in changes:
            task_history[c.entity_id].append((c.created_at, c.new_value))

        points: list[CFDPoint] = []
        current = date_from
        while current <= date_to:
            dt_eod = datetime(current.year, current.month, current.day, 23, 59, 59, tzinfo=timezone.utc)
            counts: dict[str, int] = {"todo": 0, "in_progress": 0, "done": 0}

            for task in tasks:
                if task.created_at > dt_eod:
                    continue
                status = "todo"
                for change_dt, new_status in task_history.get(task.id, []):
                    if change_dt <= dt_eod:
                        status = new_status
                    else:
                        break
                counts[status] = counts.get(status, 0) + 1

            points.append(CFDPoint(
                date=current.isoformat(),
                todo=counts["todo"],
                in_progress=counts["in_progress"],
                done=counts["done"],
            ))
            current += timedelta(days=1)
        return points

    async def get_time_in_status(
        self, project_id: uuid.UUID
    ) -> list[TimeInStatusPoint]:
        q_tasks = select(Task.id, Task.created_at).where(
            Task.project_id == project_id,
            Task.parent_id.is_(None),
        )
        tasks = (await self.session.execute(q_tasks)).all()
        if not tasks:
            return []

        task_ids = [t.id for t in tasks]
        task_created = {t.id: t.created_at for t in tasks}

        q_changes = (
            select(Activity.entity_id, Activity.new_value, Activity.created_at)
            .where(
                Activity.entity_type == "task",
                Activity.action == "status_changed",
                Activity.entity_id.in_(task_ids),
            )
            .order_by(Activity.entity_id, Activity.created_at)
        )
        changes = (await self.session.execute(q_changes)).all()

        task_history: dict[uuid.UUID, list[tuple[datetime, str]]] = defaultdict(list)
        for c in changes:
            task_history[c.entity_id].append((c.created_at, c.new_value))

        status_durations: dict[str, list[float]] = {"todo": [], "in_progress": [], "done": []}

        for task in tasks:
            timeline: list[tuple[str, datetime]] = [("todo", task_created[task.id])]
            for change_dt, new_status in task_history.get(task.id, []):
                timeline.append((new_status, change_dt))

            for i, (status, start_dt) in enumerate(timeline[:-1]):
                end_dt = timeline[i + 1][1]
                hours = (end_dt - start_dt).total_seconds() / 3600
                if status in status_durations and hours >= 0:
                    status_durations[status].append(hours)

        result: list[TimeInStatusPoint] = []
        for status in ("todo", "in_progress", "done"):
            durations = status_durations[status]
            if not durations:
                result.append(TimeInStatusPoint(
                    status=status, avg_hours=0.0, median_hours=0.0, sample_count=0
                ))
                continue
            avg = sum(durations) / len(durations)
            s = sorted(durations)
            n = len(s)
            median = s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2
            result.append(TimeInStatusPoint(
                status=status,
                avg_hours=round(avg, 1),
                median_hours=round(median, 1),
                sample_count=n,
            ))
        return result

    async def get_cycle_time(
        self,
        project_id: uuid.UUID,
        date_from: date,
        date_to: date,
    ) -> CycleTimeResponse:
        dt_from, dt_to = _dt_range(date_from, date_to)

        q_tasks = select(Task.id, Task.created_at).where(
            Task.project_id == project_id,
            Task.parent_id.is_(None),
        )
        tasks = (await self.session.execute(q_tasks)).all()
        if not tasks:
            return CycleTimeResponse(lead_time=None, cycle_time=None, scatter=[])

        task_ids = [t.id for t in tasks]
        task_created = {t.id: t.created_at for t in tasks}

        q_changes = (
            select(Activity.entity_id, Activity.new_value, Activity.created_at)
            .where(
                Activity.entity_type == "task",
                Activity.action == "status_changed",
                Activity.entity_id.in_(task_ids),
            )
            .order_by(Activity.entity_id, Activity.created_at)
        )
        changes = (await self.session.execute(q_changes)).all()

        task_history: dict[uuid.UUID, list[tuple[datetime, str]]] = defaultdict(list)
        for c in changes:
            task_history[c.entity_id].append((c.created_at, c.new_value))

        lead_days_list: list[float] = []
        cycle_days_list: list[float] = []
        scatter: list[CycleTimeScatterPoint] = []

        for task in tasks:
            history = task_history.get(task.id, [])
            first_done_at: datetime | None = None
            first_in_progress_at: datetime | None = None

            for change_dt, new_val in history:
                if new_val == "in_progress" and first_in_progress_at is None:
                    first_in_progress_at = change_dt
                if new_val == "done" and first_done_at is None:
                    first_done_at = change_dt

            if first_done_at is None:
                continue
            if not (dt_from <= first_done_at <= dt_to):
                continue

            lead_days = (first_done_at - task_created[task.id]).total_seconds() / 86400
            lead_days_list.append(lead_days)

            cycle_days: float | None = None
            if first_in_progress_at:
                cycle_days = (first_done_at - first_in_progress_at).total_seconds() / 86400
                cycle_days_list.append(cycle_days)

            scatter.append(CycleTimeScatterPoint(
                date=first_done_at.date().isoformat(),
                lead_days=round(lead_days, 1),
                cycle_days=round(cycle_days, 1) if cycle_days is not None else None,
            ))

        return CycleTimeResponse(
            lead_time=_percentiles(lead_days_list),
            cycle_time=_percentiles(cycle_days_list),
            scatter=scatter,
        )
