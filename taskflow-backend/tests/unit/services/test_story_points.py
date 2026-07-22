"""Unit tests for Story-Points reporting math (pure)."""
import uuid
from unittest.mock import MagicMock

from app.services.story_points import velocity_series, sprint_report


def _sprint(committed, name="S", sid=None):
    s = MagicMock()
    s.id = sid or uuid.uuid4()
    s.name = name
    s.committed_points = committed
    return s


def _task(estimate, done=False):
    t = MagicMock()
    t.id = uuid.uuid4()
    t.estimate = estimate
    t._done = done
    return t


def _resolved(t):
    return t._done


def test_velocity_committed_vs_completed_per_sprint():
    s1, s2 = _sprint(10, "S1"), _sprint(8, "S2")
    tasks = {
        s1.id: [_task(5, done=True), _task(3, done=True), _task(2, done=False)],
        s2.id: [_task(8, done=True)],
    }
    v = velocity_series([s1, s2], tasks, _resolved)
    assert v["sprints"][0]["committed"] == 10 and v["sprints"][0]["completed"] == 8
    assert v["sprints"][1]["completed"] == 8


def test_velocity_rolling_average_and_capacity():
    sprints = [_sprint(0, f"S{i}") for i in range(4)]
    completed = [6, 10, 8, 12]  # only last 3 count with window=3
    tasks = {s.id: [_task(c, done=True)] for s, c in zip(sprints, completed)}
    v = velocity_series(sprints, tasks, _resolved, window=3)
    assert v["rolling_average"] == 10.0          # (10+8+12)/3
    assert v["suggested_capacity"] == 10


def test_velocity_none_estimate_counts_as_zero():
    s = _sprint(5)
    tasks = {s.id: [_task(None, done=True), _task(3, done=True)]}
    v = velocity_series([s], tasks, _resolved)
    assert v["sprints"][0]["completed"] == 3


def test_sprint_report_scope_change_and_carryover():
    s = _sprint(committed=10)
    # current total 13 (scope +3); completed 8 → carryover 5
    tasks = [_task(5, done=True), _task(3, done=True), _task(3, done=False), _task(2, done=False)]
    r = sprint_report(s, tasks, _resolved)
    assert r["committed"] == 10
    assert r["completed"] == 8
    assert r["total"] == 13
    assert r["scope_change"] == 3
    assert r["carryover"] == 5
    assert r["task_count"] == 4 and r["completed_count"] == 2


def test_sprint_report_empty():
    s = _sprint(committed=0)
    r = sprint_report(s, [], _resolved)
    assert r == {"committed": 0, "completed": 0, "total": 0, "scope_change": 0,
                 "carryover": 0, "task_count": 0, "completed_count": 0}
