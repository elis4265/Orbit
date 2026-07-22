"""Pure automation-rule matching (Trigger → Conditions). DB-free → unit-testable.

A rule exposes .enabled, .trigger, .trigger_config (dict), .conditions (list of
{field, op?, value?}; op ∈ eq|neq|is_set|is_empty, default eq; AND across the
list). Action application is IO and lives in the service layer.
"""


def _val(x):
    return getattr(x, "value", x)


def _task_field(task, field: str):
    """Normalize a task attribute to a comparable string (or None)."""
    if field == "issue_type":
        return str(_val(task.issue_type)) if task.issue_type is not None else None
    if field == "priority":
        return str(task.priority_id) if task.priority_id else None
    if field == "assignee":
        return str(task.assignee_id) if task.assignee_id else None
    if field == "status":
        # custom-status modes use custom_status_id; Flow uses the fixed enum
        return str(task.custom_status_id) if task.custom_status_id else (
            str(_val(task.status)) if task.status is not None else None
        )
    return None


def _truthy(v) -> bool:
    if v is None:
        return False
    if isinstance(v, (int, float)):
        return v != 0
    return str(v) != ""


def _field_value(task, field: str, context: dict | None):
    """Computed facts in `context` (e.g. VCS `open_prs`) take precedence over task fields."""
    if context is not None and field in context:
        return context[field]
    return _task_field(task, field)


def _condition_matches(task, cond: dict, context: dict | None = None) -> bool:
    """A condition is {field, op?, value?}. op ∈ eq|neq|is_set|is_empty (default eq).
    `context` supplies non-task facts like `open_prs` (count of open PR links)."""
    actual = _field_value(task, cond.get("field"), context)
    op = cond.get("op", "eq")
    if op == "is_set":
        return _truthy(actual)
    if op == "is_empty":
        return not _truthy(actual)
    value = cond.get("value")
    if value is None:
        return True  # nothing to compare against → don't block
    if op == "neq":
        return str(actual) != str(value)
    return str(actual) == str(value)  # eq (default)


def rule_matches(rule, event_type: str, task, context: dict | None = None) -> bool:
    if not rule.enabled:
        return False
    if rule.trigger != event_type:
        return False
    cfg = rule.trigger_config or {}
    if rule.trigger == "status_changed":
        to = cfg.get("to_status")
        if to and _task_field(task, "status") != str(to):
            return False
    # All conditions must hold (AND).
    return all(_condition_matches(task, cond, context) for cond in (rule.conditions or []))


def applicable_rules(rules, event_type: str, task, context: dict | None = None) -> list:
    return [r for r in rules if rule_matches(r, event_type, task, context)]
