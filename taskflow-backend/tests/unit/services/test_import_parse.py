"""REQ-149 — CSV row parsing (pure part of the import router)."""
import pytest

from app.api.routers.task_import import _parse_row
from app.models.task import IssueType, TaskStatus


def test_full_row_parses():
    payload = _parse_row({
        "title": "Fix login", "description": "broken", "status": "in_progress",
        "issue_type": "bug", "due_date": "2026-08-01",
    })
    assert payload.title == "Fix login"
    assert payload.status == TaskStatus.in_progress
    assert payload.issue_type == IssueType.bug
    assert payload.due_date.year == 2026


def test_title_only_row_parses():
    assert _parse_row({"title": "Just a title"}).title == "Just a title"


def test_missing_title_rejected():
    with pytest.raises(ValueError, match="missing title"):
        _parse_row({"title": "  ", "description": "x"})


def test_bad_status_and_type_and_date_rejected():
    with pytest.raises(ValueError, match="invalid status"):
        _parse_row({"title": "t", "status": "flying"})
    with pytest.raises(ValueError, match="invalid issue_type"):
        _parse_row({"title": "t", "issue_type": "saga"})
    with pytest.raises(ValueError, match="invalid due_date"):
        _parse_row({"title": "t", "due_date": "someday"})


def test_long_title_truncated_to_100():
    assert len(_parse_row({"title": "x" * 300}).title) == 100
