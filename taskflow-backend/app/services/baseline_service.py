"""Baseline effort-prediction service — loads a project's closed-task history and
delegates to the pure TF-IDF/kNN model. Local, no external calls."""
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import and_, func, select

from app.core.errors import AppError
from app.models.activity import Activity
from app.models.task import Task, TaskStatus
from app.repositories.task import TaskRepository
from app.services.baseline import BaselineModel, is_surprise

_MIN_SAMPLES = 3
_HTML = re.compile(r"<[^>]+>")


def _text(title: str | None, description: str | None) -> str:
    return f"{title or ''} {_HTML.sub(' ', description or '')}"


class BaselineService:
    def __init__(self, session):
        self.session = session

    async def _completed_efforts(self, project_id: uuid.UUID, limit: int = 500) -> list[tuple[str, float]]:
        q = (
            select(
                Task.title, Task.description, Task.created_at,
                func.max(Activity.created_at).label("done_at"),
            )
            .join(Activity, and_(
                Activity.entity_id == Task.id,
                Activity.entity_type == "task",
                Activity.action == "status_changed",
                Activity.new_value == "done",
            ))
            .where(Task.project_id == project_id, Task.status == TaskStatus.done)
            .group_by(Task.id, Task.title, Task.description, Task.created_at)
            .limit(limit)
        )
        rows = (await self.session.execute(q)).all()
        out = []
        for r in rows:
            lead = max(0.0, (r.done_at - r.created_at).total_seconds() / 86400)
            out.append((_text(r.title, r.description), round(lead, 2)))
        return out

    async def predict_for_task(self, project_id: uuid.UUID, task_id: uuid.UUID) -> dict:
        samples = await self._completed_efforts(project_id)
        if len(samples) < _MIN_SAMPLES:
            return {"enough_data": False}

        task = await TaskRepository(self.session).get(task_id)
        if not task or task.project_id != project_id:
            raise AppError(404, code="NOT_FOUND", message="Task not found")

        pred = BaselineModel(samples).predict(_text(task.title, task.description))
        predicted = round(pred["predicted"], 1)

        # Surprise: an in-progress task running well past its prediction.
        elapsed_days = None
        surprise = False
        if task.status == TaskStatus.in_progress:
            started = await self._in_progress_since(task_id)
            if started:
                elapsed_days = round((datetime.now(timezone.utc) - started).total_seconds() / 86400, 1)
                surprise = is_surprise(elapsed_days, predicted)

        return {
            "enough_data": True,
            "predicted_days": predicted,
            "confidence": pred["confidence"],
            "elapsed_days": elapsed_days,
            "surprise": surprise,
            "neighbors": [
                {"title": n["text"].strip()[:60], "days": n["effort"], "similarity": n["similarity"]}
                for n in pred["neighbors"]
            ],
        }

    async def _in_progress_since(self, task_id: uuid.UUID):
        q = select(func.min(Activity.created_at)).where(
            Activity.entity_id == task_id,
            Activity.entity_type == "task",
            Activity.action == "status_changed",
            Activity.new_value == "in_progress",
        )
        return (await self.session.execute(q)).scalar()
