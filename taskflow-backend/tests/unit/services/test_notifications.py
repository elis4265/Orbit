"""Unit tests for NotificationService — REQ-064 through REQ-071."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.models.notification import NotificationType
from app.models.notification_preferences import NotificationPreferences
from app.services.notification import NotificationService, _extract_mentions


@pytest.fixture(autouse=True)
def _patch_ws_broadcast():
    with patch("app.services.notification.manager") as mock_mgr:
        mock_mgr.broadcast = AsyncMock()
        yield mock_mgr


# ── Mention extraction (REQ-065) ─────────────────────────────────────────────

def test_extract_mentions_finds_usernames():
    html = "<p>Hey @alice and @bob-dev, check this out.</p>"
    assert set(_extract_mentions(html)) == {"alice", "bob-dev"}


def test_extract_mentions_empty_when_none():
    assert _extract_mentions("<p>no mentions here</p>") == []


def test_extract_mentions_deduplicates_in_caller():
    html = "<p>@alice again @alice</p>"
    # Returns raw list; deduplication is caller's responsibility (set() in service)
    assert _extract_mentions(html).count("alice") == 2


# ── NotificationService fixture ───────────────────────────────────────────────

def _prefs(**overrides) -> MagicMock:
    defaults = dict(
        on_comment=True, on_mention=True, on_status_change=True,
        on_assignee_change=True, on_priority_change=True,
        on_due_date_approaching=True, on_task_deleted=True,
        due_date_reminder_hours=24, email_enabled=False,
    )
    m = MagicMock(spec=NotificationPreferences)
    for k, v in {**defaults, **overrides}.items():
        setattr(m, k, v)
    return m


def _make_service():
    notif_repo = MagicMock()
    notif_repo.create = AsyncMock(return_value=MagicMock(id=uuid.uuid4()))
    notif_repo.session = MagicMock()
    notif_repo.session.commit = AsyncMock()
    notif_repo.due_date_already_notified = AsyncMock(return_value=False)

    prefs_repo = MagicMock()
    prefs_repo.get_or_default = AsyncMock(return_value=_prefs())
    prefs_repo.get_for_users = AsyncMock(return_value={})

    watcher_repo = MagicMock()
    watcher_repo.get_watcher_ids = AsyncMock(return_value=[])

    user_repo = MagicMock()
    user_repo.get = AsyncMock(return_value=None)
    user_repo.get_by_username = AsyncMock(return_value=None)

    svc = NotificationService(notif_repo, prefs_repo, watcher_repo, user_repo)
    return svc, notif_repo, prefs_repo, watcher_repo, user_repo


TASK_ID = uuid.uuid4()
PROJECT_ID = uuid.uuid4()
ACTOR_ID = uuid.uuid4()
WATCHER_ID = uuid.uuid4()
ASSIGNEE_ID = uuid.uuid4()


def _mock_user(uid: uuid.UUID, username: str = "alice", email: str = "alice@example.com"):
    u = MagicMock()
    u.id = uid
    u.username = username
    u.email = email
    return u


# ── on_comment_added (REQ-064) ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_on_comment_notifies_watcher():
    svc, notif_repo, prefs_repo, watcher_repo, user_repo = _make_service()
    watcher_repo.get_watcher_ids.return_value = [WATCHER_ID]
    prefs_repo.get_for_users.return_value = {WATCHER_ID: _prefs(on_comment=True)}
    user_repo.get = AsyncMock(return_value=_mock_user(WATCHER_ID))

    await svc.on_comment_added(
        task_id=TASK_ID, project_id=PROJECT_ID, task_title="Bug",
        actor_id=ACTOR_ID, actor_name="bob",
        assignee_id=None, comment_html="<p>fix this</p>",
    )

    notif_repo.create.assert_awaited_once()
    call_kwargs = notif_repo.create.call_args.kwargs
    assert call_kwargs["notification_type"] == NotificationType.comment_added
    assert call_kwargs["user_id"] == WATCHER_ID


@pytest.mark.asyncio
async def test_on_comment_skips_actor():
    """Watcher who is also the actor should not get notified."""
    svc, notif_repo, prefs_repo, watcher_repo, user_repo = _make_service()
    watcher_repo.get_watcher_ids.return_value = [ACTOR_ID]
    prefs_repo.get_for_users.return_value = {ACTOR_ID: _prefs(on_comment=True)}

    await svc.on_comment_added(
        task_id=TASK_ID, project_id=PROJECT_ID, task_title="Bug",
        actor_id=ACTOR_ID, actor_name="bob",
        assignee_id=None, comment_html="<p>fix this</p>",
    )

    notif_repo.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_on_comment_skips_when_pref_off():
    svc, notif_repo, prefs_repo, watcher_repo, user_repo = _make_service()
    watcher_repo.get_watcher_ids.return_value = [WATCHER_ID]
    prefs_repo.get_for_users.return_value = {WATCHER_ID: _prefs(on_comment=False)}

    await svc.on_comment_added(
        task_id=TASK_ID, project_id=PROJECT_ID, task_title="Bug",
        actor_id=ACTOR_ID, actor_name="bob",
        assignee_id=None, comment_html="<p>fix this</p>",
    )

    notif_repo.create.assert_not_awaited()


# ── @mention (REQ-065) ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mention_notifies_tagged_user():
    svc, notif_repo, prefs_repo, watcher_repo, user_repo = _make_service()
    watcher_repo.get_watcher_ids.return_value = []
    prefs_repo.get_for_users.return_value = {}
    prefs_repo.get_or_default.return_value = _prefs(on_mention=True)
    mentioned = _mock_user(WATCHER_ID, username="alice")
    user_repo.get_by_username = AsyncMock(return_value=mentioned)

    await svc.on_comment_added(
        task_id=TASK_ID, project_id=PROJECT_ID, task_title="Bug",
        actor_id=ACTOR_ID, actor_name="bob",
        assignee_id=None, comment_html="<p>@alice check this</p>",
    )

    types = [c.kwargs["notification_type"] for c in notif_repo.create.call_args_list]
    assert NotificationType.mentioned in types


@pytest.mark.asyncio
async def test_mention_skips_when_pref_off():
    svc, notif_repo, prefs_repo, watcher_repo, user_repo = _make_service()
    watcher_repo.get_watcher_ids.return_value = []
    prefs_repo.get_for_users.return_value = {}
    prefs_repo.get_or_default.return_value = _prefs(on_mention=False)
    user_repo.get_by_username = AsyncMock(return_value=_mock_user(WATCHER_ID))

    await svc.on_comment_added(
        task_id=TASK_ID, project_id=PROJECT_ID, task_title="Bug",
        actor_id=ACTOR_ID, actor_name="bob",
        assignee_id=None, comment_html="<p>@alice check this</p>",
    )

    notif_repo.create.assert_not_awaited()


# ── on_status_changed (REQ-066) ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_on_status_changed_notifies_assignee():
    svc, notif_repo, prefs_repo, watcher_repo, user_repo = _make_service()
    watcher_repo.get_watcher_ids.return_value = []
    prefs_repo.get_for_users.return_value = {ASSIGNEE_ID: _prefs(on_status_change=True)}
    user_repo.get = AsyncMock(return_value=_mock_user(ASSIGNEE_ID))

    await svc.on_status_changed(
        task_id=TASK_ID, project_id=PROJECT_ID, task_title="Bug",
        actor_id=ACTOR_ID, actor_name="bob",
        assignee_id=ASSIGNEE_ID, new_status="done",
    )

    notif_repo.create.assert_awaited_once()
    assert notif_repo.create.call_args.kwargs["notification_type"] == NotificationType.status_changed


# ── on_assignee_changed (REQ-067) ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_on_assignee_changed_notifies_new_assignee_unconditionally():
    svc, notif_repo, prefs_repo, watcher_repo, user_repo = _make_service()
    watcher_repo.get_watcher_ids.return_value = []
    prefs_repo.get_or_default.return_value = _prefs()
    prefs_repo.get_for_users.return_value = {}
    user_repo.get = AsyncMock(return_value=_mock_user(ASSIGNEE_ID))

    await svc.on_assignee_changed(
        task_id=TASK_ID, project_id=PROJECT_ID, task_title="Bug",
        actor_id=ACTOR_ID, actor_name="bob",
        new_assignee_id=ASSIGNEE_ID, old_assignee_id=None,
    )

    notif_repo.create.assert_awaited_once()
    assert notif_repo.create.call_args.kwargs["notification_type"] == NotificationType.assignee_changed


# ── on_task_deleted (REQ-069) ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_on_task_deleted_notifies_watcher():
    svc, notif_repo, prefs_repo, watcher_repo, user_repo = _make_service()
    prefs_repo.get_for_users.return_value = {WATCHER_ID: _prefs(on_task_deleted=True)}
    user_repo.get = AsyncMock(return_value=_mock_user(WATCHER_ID))

    await svc.on_task_deleted(
        task_id=TASK_ID, project_id=PROJECT_ID, task_title="Bug",
        actor_id=ACTOR_ID, actor_name="bob",
        assignee_id=None, watcher_ids=[WATCHER_ID],
    )

    notif_repo.create.assert_awaited_once()
    assert notif_repo.create.call_args.kwargs["notification_type"] == NotificationType.task_deleted


# ── on_due_date_approaching (REQ-070) ────────────────────────────────────────

@pytest.mark.asyncio
async def test_due_date_skips_already_notified():
    svc, notif_repo, prefs_repo, watcher_repo, user_repo = _make_service()
    notif_repo.due_date_already_notified = AsyncMock(return_value=True)
    prefs_repo.get_for_users.return_value = {WATCHER_ID: _prefs(on_due_date_approaching=True)}
    user_repo.get = AsyncMock(return_value=_mock_user(WATCHER_ID))

    await svc.on_due_date_approaching(
        task_id=TASK_ID, project_id=PROJECT_ID, task_title="Bug",
        assignee_id=None, watcher_ids=[WATCHER_ID],
    )

    notif_repo.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_due_date_notifies_when_not_yet_sent():
    svc, notif_repo, prefs_repo, watcher_repo, user_repo = _make_service()
    notif_repo.due_date_already_notified = AsyncMock(return_value=False)
    prefs_repo.get_for_users.return_value = {WATCHER_ID: _prefs(on_due_date_approaching=True)}
    user_repo.get = AsyncMock(return_value=_mock_user(WATCHER_ID))

    await svc.on_due_date_approaching(
        task_id=TASK_ID, project_id=PROJECT_ID, task_title="Bug",
        assignee_id=None, watcher_ids=[WATCHER_ID],
    )

    notif_repo.create.assert_awaited_once()
    assert notif_repo.create.call_args.kwargs["notification_type"] == NotificationType.due_date_approaching
