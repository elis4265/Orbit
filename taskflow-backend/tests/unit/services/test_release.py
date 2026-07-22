"""Unit tests for pure release progress / ship-readiness math."""
import uuid
from unittest.mock import MagicMock

from app.services.release import is_task_done, release_progress, ship_summary


def _task(status="todo", custom_status_id=None):
    t = MagicMock()
    t.status = status
    t.custom_status_id = custom_status_id
    return t


def test_is_task_done_open_mode_uses_status_enum():
    assert is_task_done(_task(status="done")) is True
    assert is_task_done(_task(status="in_progress")) is False
    assert is_task_done(_task(status="todo")) is False


def test_is_task_done_custom_mode_uses_completed_set():
    done_id = uuid.uuid4()
    other_id = uuid.uuid4()
    completed = {str(done_id)}
    assert is_task_done(_task(custom_status_id=done_id), completed) is True
    assert is_task_done(_task(custom_status_id=other_id), completed) is False


def test_custom_mode_falls_back_to_enum_when_no_custom_status():
    # a task with no custom_status_id in a custom-mode project → enum decides
    assert is_task_done(_task(status="done", custom_status_id=None), {str(uuid.uuid4())}) is True


def test_release_progress_empty_is_zero():
    assert release_progress([]) == {"total_tasks": 0, "done_tasks": 0, "progress_pct": 0}


def test_release_progress_counts_and_rounds():
    tasks = [_task(status="done"), _task(status="done"), _task(status="todo")]
    prog = release_progress(tasks)
    assert prog == {"total_tasks": 3, "done_tasks": 2, "progress_pct": 67}  # 66.7 → 67


def test_release_progress_all_done_is_100():
    tasks = [_task(status="done"), _task(status="done")]
    assert release_progress(tasks)["progress_pct"] == 100


def test_ship_summary_clean_when_all_done():
    tasks = [_task(status="done"), _task(status="done")]
    s = ship_summary(tasks)
    assert s["incomplete_tasks"] == 0
    assert s["clean"] is True


def test_ship_summary_dirty_with_unfinished():
    tasks = [_task(status="done"), _task(status="in_progress"), _task(status="todo")]
    s = ship_summary(tasks)
    assert s["incomplete_tasks"] == 2
    assert s["clean"] is False
    assert s["progress_pct"] == 33  # 1/3
