import uuid
from pydantic import BaseModel


class VelocitySprintPoint(BaseModel):
    sprint_id: uuid.UUID
    name: str
    committed: int
    completed: int


class VelocityResponse(BaseModel):
    sprints: list[VelocitySprintPoint]
    rolling_average: float
    suggested_capacity: int


class SprintReportResponse(BaseModel):
    committed: int
    completed: int
    total: int
    scope_change: int
    carryover: int
    task_count: int
    completed_count: int
