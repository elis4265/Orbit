"""Unit tests for automation rule matching (trigger + conditions)."""
import uuid
from unittest.mock import MagicMock

from app.services.automation import rule_matches, applicable_rules


def _task(issue_type="task", priority_id=None, assignee_id=None, status="todo", custom_status_id=None):
    t = MagicMock()
    t.issue_type = issue_type
    t.priority_id = priority_id
    t.assignee_id = assignee_id
    t.status = status
    t.custom_status_id = custom_status_id
    return t


def _rule(trigger, trigger_config=None, conditions=None, enabled=True):
    r = MagicMock()
    r.trigger = trigger
    r.trigger_config = trigger_config or {}
    r.conditions = conditions or []
    r.enabled = enabled
    return r


def test_created_trigger_matches_created_event():
    r = _rule("task_created")
    assert rule_matches(r, "task_created", _task()) is True
    assert rule_matches(r, "status_changed", _task()) is False


def test_status_changed_to_specific_status():
    r = _rule("status_changed", trigger_config={"to_status": "done"})
    assert rule_matches(r, "status_changed", _task(status="done")) is True
    assert rule_matches(r, "status_changed", _task(status="todo")) is False


def test_conditions_must_all_match():
    r = _rule("task_created", conditions=[{"field": "issue_type", "value": "bug"}])
    assert rule_matches(r, "task_created", _task(issue_type="bug")) is True
    assert rule_matches(r, "task_created", _task(issue_type="task")) is False


def test_multiple_conditions_and():
    aid = uuid.uuid4()
    r = _rule("task_created", conditions=[
        {"field": "issue_type", "value": "bug"},
        {"field": "assignee", "value": str(aid)},
    ])
    assert rule_matches(r, "task_created", _task(issue_type="bug", assignee_id=aid)) is True
    assert rule_matches(r, "task_created", _task(issue_type="bug")) is False  # no assignee


def test_disabled_rule_never_matches():
    r = _rule("task_created", enabled=False)
    assert rule_matches(r, "task_created", _task()) is False


def test_custom_status_condition():
    sid = uuid.uuid4()
    r = _rule("status_changed", trigger_config={"to_status": str(sid)})
    assert rule_matches(r, "status_changed", _task(custom_status_id=sid)) is True
    assert rule_matches(r, "status_changed", _task(custom_status_id=uuid.uuid4())) is False


def test_operator_neq():
    r = _rule("task_created", conditions=[{"field": "issue_type", "op": "neq", "value": "bug"}])
    assert rule_matches(r, "task_created", _task(issue_type="task")) is True   # not a bug
    assert rule_matches(r, "task_created", _task(issue_type="bug")) is False    # is a bug


def test_operator_is_set_and_is_empty():
    aid = uuid.uuid4()
    set_rule = _rule("task_created", conditions=[{"field": "assignee", "op": "is_set"}])
    empty_rule = _rule("task_created", conditions=[{"field": "assignee", "op": "is_empty"}])
    assert rule_matches(set_rule, "task_created", _task(assignee_id=aid)) is True
    assert rule_matches(set_rule, "task_created", _task()) is False
    assert rule_matches(empty_rule, "task_created", _task()) is True
    assert rule_matches(empty_rule, "task_created", _task(assignee_id=aid)) is False


def test_multiple_conditions_with_mixed_operators():
    aid = uuid.uuid4()
    r = _rule("task_created", conditions=[
        {"field": "issue_type", "op": "neq", "value": "epic"},
        {"field": "assignee", "op": "is_empty"},
    ])
    assert rule_matches(r, "task_created", _task(issue_type="bug")) is True            # not epic + unassigned
    assert rule_matches(r, "task_created", _task(issue_type="bug", assignee_id=aid)) is False  # assigned
    assert rule_matches(r, "task_created", _task(issue_type="epic")) is False          # is epic


def test_applicable_rules_filters():
    r1 = _rule("task_created")
    r2 = _rule("status_changed", trigger_config={"to_status": "done"})
    r3 = _rule("task_created", enabled=False)
    out = applicable_rules([r1, r2, r3], "task_created", _task())
    assert out == [r1]
