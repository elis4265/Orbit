"""Validation rules of the Tier 0/1/2 schemas (REQ-143/144/147/148)."""
import uuid

import pytest
from pydantic import ValidationError

from app.schemas.api_token import ApiTokenCreate
from app.schemas.recurring_task import RecurringTaskCreate
from app.schemas.webhook import WebhookCreate, WebhookUpdate
from app.schemas.work_log import WorkLogCreate


def test_api_token_scope_literal():
    assert ApiTokenCreate(name="ci", scope="write").scope == "write"
    with pytest.raises(ValidationError):
        ApiTokenCreate(name="ci", scope="admin")
    with pytest.raises(ValidationError):
        ApiTokenCreate(name="", scope="read")


def test_webhook_url_scheme_and_events():
    ok = WebhookCreate(url="https://example.com/h", events=["task.created"])
    assert ok.format == "json"
    with pytest.raises(ValidationError):
        WebhookCreate(url="ftp://example.com", events=["task.created"])
    with pytest.raises(ValidationError):
        WebhookCreate(url="https://example.com", events=[])
    with pytest.raises(ValidationError):
        WebhookCreate(url="https://example.com", events=["nonsense.event"])
    with pytest.raises(ValidationError):
        WebhookCreate(url="https://example.com", events=["task.created"], format="carrier-pigeon")
    assert WebhookUpdate(format="slack").format == "slack"


def test_worklog_minutes_bounds():
    assert WorkLogCreate(minutes=90).minutes == 90
    with pytest.raises(ValidationError):
        WorkLogCreate(minutes=0)
    with pytest.raises(ValidationError):
        WorkLogCreate(minutes=25 * 60)
    with pytest.raises(ValidationError):
        WorkLogCreate(minutes=30, note="x" * 501)


def test_recurring_cadence_requires_params():
    tpl = uuid.uuid4()
    assert RecurringTaskCreate(template_id=tpl, cadence="daily").cadence == "daily"
    assert RecurringTaskCreate(template_id=tpl, cadence="weekly", weekday=0).weekday == 0
    assert RecurringTaskCreate(template_id=tpl, cadence="monthly", day_of_month=31).day_of_month == 31
    with pytest.raises(ValidationError):
        RecurringTaskCreate(template_id=tpl, cadence="weekly")  # weekday missing
    with pytest.raises(ValidationError):
        RecurringTaskCreate(template_id=tpl, cadence="monthly")  # day_of_month missing
    with pytest.raises(ValidationError):
        RecurringTaskCreate(template_id=tpl, cadence="monthly", day_of_month=32)
