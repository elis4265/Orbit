import uuid
from pydantic import BaseModel


class StatusCount(BaseModel):
    status: str
    count: int


class PriorityCount(BaseModel):
    priority_id: str | None = None   # None = no priority set
    priority_name: str = "None"
    count: int


class AssigneeCount(BaseModel):
    user_id: uuid.UUID
    name: str
    count: int


class ThroughputPoint(BaseModel):
    date: str  # YYYY-MM-DD
    created: int
    completed: int


class AgeDistributionBucket(BaseModel):
    label: str   # "<7d", "7-14d", "14-30d", "30-60d", "60+d"
    count: int
    max_days: int  # upper bound of bucket (for sort)


class StatsResponse(BaseModel):
    by_status: list[StatusCount]
    by_priority: list[PriorityCount]
    by_assignee: list[AssigneeCount]
    throughput: list[ThroughputPoint]
    completion_rate: float
    completed_count: int
    created_count: int
    overdue_count: int
    by_age: list[AgeDistributionBucket]


class BurndownPoint(BaseModel):
    date: str  # YYYY-MM-DD
    created: int
    completed: int
    remaining: int


# ── Cumulative Flow Diagram ───────────────────────────────────────────────────

class CFDPoint(BaseModel):
    date: str  # YYYY-MM-DD
    todo: int
    in_progress: int
    done: int


# ── Time in Status ────────────────────────────────────────────────────────────

class TimeInStatusPoint(BaseModel):
    status: str
    avg_hours: float
    median_hours: float
    sample_count: int


# ── Cycle Time / Lead Time ────────────────────────────────────────────────────

class CycleTimePercentiles(BaseModel):
    p50: float
    p85: float
    p95: float
    unit: str = "days"


class CycleTimeScatterPoint(BaseModel):
    date: str          # YYYY-MM-DD when task was completed
    lead_days: float
    cycle_days: float | None  # None when task never entered in_progress


class CycleTimeResponse(BaseModel):
    lead_time: CycleTimePercentiles | None
    cycle_time: CycleTimePercentiles | None
    scatter: list[CycleTimeScatterPoint]


class ForecastResponse(BaseModel):
    enough_data: bool
    remaining: int
    throughput: list[int]            # weekly completed counts, oldest→newest
    p50_weeks: int | None = None
    p85_weeks: int | None = None
    p95_weeks: int | None = None
    p50_date: str | None = None
    p85_date: str | None = None
    p95_date: str | None = None
