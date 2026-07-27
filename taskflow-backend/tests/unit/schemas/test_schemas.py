import uuid
from datetime import datetime, timezone
import pytest
from pydantic import ValidationError
from app.schemas.auth import UserRegister
from app.schemas.user import UserCreate, UserResponse
from app.schemas.task import TaskUpdate
from app.schemas.board import BoardCreate, BoardUpdate, BoardResponse
from app.schemas.attachment import AttachmentResponse
from app.schemas.project_member import (
    InviteCreate, InviteResponse, InviteMetadataResponse,
    MemberResponse, PromoteRoleRequest,
)
from app.models.task import TaskStatus, IssueType
from app.schemas.task import TaskCreate, SubTaskCreate
from app.models.project_member import MemberRole
from app.schemas.activity import ActivityResponse

# ============================================================================
# USER SCHEMA TESTS
# ============================================================================

def test_user_create_success():
    """Ensure valid user registration payloads pass validation."""
    payload = {
        "email": "test@example.com",
        "password": "supersecurepassword123"
    }
    user_schema = UserCreate(**payload)
    assert user_schema.email == "test@example.com"
    # Ensure the plain password didn't get dropped or truncated
    assert user_schema.password == "supersecurepassword123"


def test_user_create_invalid_email():
    """Ensure Pydantic's EmailStr rejects malformed email addresses."""
    payload = {
        "email": "not-a-valid-email",
        "password": "securepassword123"
    }
    with pytest.raises(ValidationError) as exc_info:
        UserCreate(**payload)
    
    assert "value is not a valid email address" in str(exc_info.value)


def test_user_create_password_too_short():
    """Ensure passwords below the 8-character threshold are rejected."""
    payload = {
        "email": "test@example.com",
        "password": "short"
    }
    with pytest.raises(ValidationError) as exc_info:
        UserCreate(**payload)
        
    assert "String should have at least 8 characters" in str(exc_info.value)


# ============================================================================
# USER REGISTER SCHEMA TESTS (PASSWORD COMPLEXITY)
# ============================================================================

def test_user_register_valid_password():
    u = UserRegister(email="a@example.com", username="testuser", password="Secure99!", first_name="Test", last_name="User")
    assert u.password == "Secure99!"


def test_user_register_missing_uppercase_rejected():
    with pytest.raises(ValidationError) as exc_info:
        UserRegister(email="a@example.com", username="testuser", password="alllower1", first_name="Test", last_name="User")
    assert "uppercase" in str(exc_info.value)


def test_user_register_missing_digit_rejected():
    with pytest.raises(ValidationError) as exc_info:
        UserRegister(email="a@example.com", username="testuser", password="AllUpperNoDigit", first_name="Test", last_name="User")
    assert "digit" in str(exc_info.value)


def test_user_register_too_short_rejected():
    with pytest.raises(ValidationError):
        UserRegister(email="a@example.com", username="testuser", password="A1!", first_name="Test", last_name="User")


# ============================================================================
# TASK SCHEMA TESTS (OPTIMISTIC CONCURRENCY CONTROL)
# ============================================================================

def test_task_update_success_with_version():
    """Ensure a task update passes when the concurrency version token is supplied."""
    payload = {
        "title": "Updated Task Title",
        "status": TaskStatus.in_progress,
        "version": 3  # Simulating that this is the 3rd modification
    }
    update_schema = TaskUpdate(**payload)
    assert update_schema.title == "Updated Task Title"
    assert update_schema.version == 3


def test_task_update_missing_version_raises_error():
    """Ensure updates fail immediately if the client omits the version token."""
    payload = {
        "title": "Malicious or outdated drag-and-drop try",
        "status": TaskStatus.done
        # 'version' is missing entirely
    }
    with pytest.raises(ValidationError) as exc_info:
        TaskUpdate(**payload)
        
    assert "Field required" in str(exc_info.value)
    assert "version" in str(exc_info.value)

def test_task_update_version_must_be_positive():
    """Ensure optimistic locking version must be at least 1."""
    with pytest.raises(ValidationError):
        TaskUpdate(version=0)

def test_task_update_negative_position_rejected():
    """Ensure task positions cannot be negative."""
    with pytest.raises(ValidationError):
        TaskUpdate(version=1, position=-1)

def test_task_update_title_too_long():
    """Ensure task titles exceeding 100 characters are rejected."""
    with pytest.raises(ValidationError):
        TaskUpdate(
            version=1,
            title="a" * 101,
        )


# ============================================================================
# ISSUE TYPE SCHEMA TESTS
# ============================================================================

def test_task_create_default_issue_type():
    t = TaskCreate(title="Fix login")
    assert t.issue_type == IssueType.task


def test_task_create_epic_issue_type():
    t = TaskCreate(title="Big feature", issue_type=IssueType.epic)
    assert t.issue_type == IssueType.epic


def test_task_create_bug_issue_type():
    t = TaskCreate(title="Crash on submit", issue_type=IssueType.bug)
    assert t.issue_type == IssueType.bug


def test_task_create_invalid_issue_type_rejected():
    with pytest.raises(ValidationError):
        TaskCreate(title="Oops", issue_type="ticket")


def test_task_update_issue_type_optional():
    u = TaskUpdate(version=1)
    assert u.issue_type is None


# ============================================================================
# HW-34: TITLE LENGTH LIMITS
# ============================================================================

def test_task_create_title_at_limit_accepted():
    t = TaskCreate(title="a" * 100)
    assert len(t.title) == 100


def test_task_create_title_over_limit_rejected():
    with pytest.raises(ValidationError) as exc:
        TaskCreate(title="a" * 101)
    assert exc.value.errors()[0]["type"] == "string_too_long"


def test_task_update_title_over_limit_rejected():
    with pytest.raises(ValidationError):
        TaskUpdate(title="a" * 101, version=1)


def test_subtask_title_at_limit_accepted():
    s = SubTaskCreate(title="a" * 100)
    assert len(s.title) == 100


def test_subtask_title_over_limit_rejected():
    # Subtasks are child Task rows (String(100)); the old 200 cap let
    # 101-200-char titles through Pydantic into a DB-level 500.
    with pytest.raises(ValidationError) as exc:
        SubTaskCreate(title="a" * 101)
    assert exc.value.errors()[0]["type"] == "string_too_long"


def test_task_update_issue_type_set():
    u = TaskUpdate(version=2, issue_type=IssueType.story)
    assert u.issue_type == IssueType.story


# ============================================================================
# BOARD SCHEMA TESTS
# ============================================================================

def test_board_create_valid():
    b = BoardCreate(name="Sprint 1")
    assert b.name == "Sprint 1"


def test_board_create_empty_name_rejected():
    with pytest.raises(ValidationError):
        BoardCreate(name="")


def test_board_create_name_too_long_rejected():
    with pytest.raises(ValidationError):
        BoardCreate(name="x" * 256)


def test_board_update_valid():
    b = BoardUpdate(name="Renamed Board")
    assert b.name == "Renamed Board"


def test_board_response_from_attributes():
    now = datetime.now(timezone.utc)
    project_id = uuid.uuid4()
    board_id = uuid.uuid4()
    b = BoardResponse(id=board_id, project_id=project_id, name="My Board", created_at=now, updated_at=now)
    assert b.id == board_id
    assert b.project_id == project_id
    assert b.name == "My Board"


# ============================================================================
# ATTACHMENT SCHEMA TESTS
# ============================================================================

def test_attachment_response_valid():
    now = datetime.now(timezone.utc)
    a = AttachmentResponse(
        id=uuid.uuid4(),
        task_id=uuid.uuid4(),
        comment_id=None,
        filename="report.pdf",
        content_type="application/pdf",
        size_bytes=1024,
        created_at=now,
    )
    assert a.filename == "report.pdf"
    assert a.size_bytes == 1024


# ============================================================================
# WORKSPACE MEMBER SCHEMA TESTS
# ============================================================================

def test_invite_create_valid():
    i = InviteCreate(email="member@example.com")
    assert i.email == "member@example.com"


def test_invite_create_invalid_email():
    with pytest.raises(ValidationError):
        InviteCreate(email="not-an-email")


def test_invite_metadata_response_valid():
    m = InviteMetadataResponse(
        project_id=uuid.uuid4(),
        workspace_name="Acme",
        email="user@example.com",
        expired=False,
        used=False,
    )
    assert m.workspace_name == "Acme"
    assert m.expired is False


def test_invite_response_valid():
    now = datetime.now(timezone.utc)
    r = InviteResponse(
        id=uuid.uuid4(),
        token=uuid.uuid4(),
        project_id=uuid.uuid4(),
        email="user@example.com",
        used=False,
        expires_at=now,
        created_at=now,
    )
    assert r.used is False


def test_member_response_valid():
    m = MemberResponse(
        id=uuid.uuid4(),
        email="member@example.com",
        username="alice",
        joined_at=datetime.now(timezone.utc),
        role=MemberRole.member,
    )
    assert m.role == MemberRole.member


def test_member_response_defaults():
    m = MemberResponse(id=uuid.uuid4(), email="x@example.com")
    assert m.username is None
    assert m.joined_at is None
    assert m.role == MemberRole.member


def test_promote_role_request_valid():
    p = PromoteRoleRequest(role=MemberRole.admin)
    assert p.role == MemberRole.admin


def test_promote_role_request_invalid():
    with pytest.raises(ValidationError):
        PromoteRoleRequest(role="superuser")


# ============================================================================
# COMMENT SCHEMA TESTS
# ============================================================================

from app.schemas.comment import CommentCreate, CommentUpdate, CommentResponse, CommentHistoryResponse


def test_comment_create_valid():
    c = CommentCreate(content="Nice work!")
    assert c.content == "Nice work!"


def test_comment_create_empty_rejected():
    with pytest.raises(ValidationError) as exc_info:
        CommentCreate(content="   ")
    assert "cannot be empty" in str(exc_info.value)


def test_comment_update_valid():
    c = CommentUpdate(content="Edited comment.")
    assert c.content == "Edited comment."


def test_comment_update_empty_rejected():
    with pytest.raises(ValidationError):
        CommentUpdate(content="")


def test_comment_response_from_attributes():
    now = datetime.now(timezone.utc)
    tid = uuid.uuid4()
    aid = uuid.uuid4()
    cid = uuid.uuid4()
    r = CommentResponse(id=cid, task_id=tid, author_id=aid, content="hello", created_at=now, edited_at=None)
    assert r.task_id == tid
    assert r.edited_at is None


def test_comment_history_response_valid():
    now = datetime.now(timezone.utc)
    r = CommentHistoryResponse(
        id=uuid.uuid4(),
        comment_id=uuid.uuid4(),
        content="old text",
        edited_by=uuid.uuid4(),
        edited_at=now,
    )
    assert r.content == "old text"


def test_comment_history_edited_by_nullable():
    now = datetime.now(timezone.utc)
    r = CommentHistoryResponse(
        id=uuid.uuid4(), comment_id=uuid.uuid4(), content="x", edited_by=None, edited_at=now
    )
    assert r.edited_by is None


# ============================================================================
# NOTIFICATION SCHEMA TESTS
# ============================================================================

from app.schemas.notification import (
    NotificationResponse, NotificationPreferencesResponse,
    NotificationPreferencesUpdate, WatcherResponse,
)
from app.models.notification import NotificationType


def test_notification_response_valid():
    now = datetime.now(timezone.utc)
    r = NotificationResponse(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        task_id=uuid.uuid4(),
        type=NotificationType.comment_added,
        read=False,
        payload={"message": "hey"},
        created_at=now,
    )
    assert r.read is False
    assert r.type == NotificationType.comment_added


def test_notification_response_task_id_nullable():
    now = datetime.now(timezone.utc)
    r = NotificationResponse(
        id=uuid.uuid4(), project_id=uuid.uuid4(), task_id=None,
        type=NotificationType.task_deleted, read=True,
        payload={}, created_at=now,
    )
    assert r.task_id is None


def test_notification_preferences_response_defaults():
    r = NotificationPreferencesResponse(
        on_comment=True, on_mention=True, on_status_change=False,
        on_assignee_change=True, on_priority_change=True,
        on_due_date_approaching=True, on_task_deleted=True,
        due_date_reminder_hours=24, email_enabled=False,
    )
    assert r.on_status_change is False
    assert r.due_date_reminder_hours == 24


def test_notification_preferences_update_defaults():
    r = NotificationPreferencesUpdate()
    assert r.on_comment is True
    assert r.email_enabled is False
    assert r.due_date_reminder_hours == 24


def test_notification_preferences_update_custom():
    r = NotificationPreferencesUpdate(on_comment=False, email_enabled=True, due_date_reminder_hours=48)
    assert r.on_comment is False
    assert r.due_date_reminder_hours == 48


def test_watcher_response_valid():
    r = WatcherResponse(id=uuid.uuid4(), email="watcher@example.com", username="watcher1")
    assert r.email == "watcher@example.com"


def test_watcher_response_username_nullable():
    r = WatcherResponse(id=uuid.uuid4(), email="anon@example.com", username=None)
    assert r.username is None


# ============================================================================
# TAG SCHEMA TESTS
# ============================================================================

from app.schemas.tag import TagCreate, TagUpdate, TagResponse
from app.models.tag import TagVisibility


def test_tag_create_valid():
    t = TagCreate(name="bug", color="#ef4444", visibility=TagVisibility.workspace)
    assert t.name == "bug"
    assert t.color == "#ef4444"


def test_tag_create_no_color():
    t = TagCreate(name="feature")
    assert t.color is None
    assert t.visibility == TagVisibility.workspace


def test_tag_create_invalid_color():
    with pytest.raises(ValidationError):
        TagCreate(name="x", color="red")


def test_tag_create_empty_name_rejected():
    with pytest.raises(ValidationError):
        TagCreate(name="")


def test_tag_create_name_too_long_rejected():
    with pytest.raises(ValidationError):
        TagCreate(name="x" * 51)


def test_tag_update_partial():
    t = TagUpdate(name="renamed")
    assert t.name == "renamed"
    assert t.color is None
    assert t.visibility is None


def test_tag_update_invalid_color():
    with pytest.raises(ValidationError):
        TagUpdate(color="notahex")


def test_tag_response_from_attributes():
    now = datetime.now(timezone.utc)
    r = TagResponse(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        owner_id=uuid.uuid4(),
        name="bug",
        color="#ef4444",
        visibility=TagVisibility.workspace,
        created_at=now,
    )
    assert r.visibility == TagVisibility.workspace


def test_tag_private_visibility():
    now = datetime.now(timezone.utc)
    r = TagResponse(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        owner_id=uuid.uuid4(),
        name="my-tag",
        color="#7c6af7",
        visibility=TagVisibility.private,
        created_at=now,
    )
    assert r.visibility == TagVisibility.private

# ============================================================================
# ACTIVITY SCHEMA TESTS
# ============================================================================

def test_activity_response_full():
    now = datetime.now(timezone.utc)
    r = ActivityResponse(
        id=42,
        entity_type="task",
        entity_id=uuid.uuid4(),
        entity_name="Fix bug",
        project_id=uuid.uuid4(),
        actor_id=uuid.uuid4(),
        actor_name="alice",
        action="status_changed",
        field="status",
        old_value="todo",
        new_value="in_progress",
        meta={"note": "test"},
        created_at=now,
    )
    assert r.id == 42
    assert r.entity_type == "task"
    assert r.entity_name == "Fix bug"
    assert r.action == "status_changed"
    assert r.old_value == "todo"
    assert r.new_value == "in_progress"
    assert r.meta == {"note": "test"}


def test_activity_response_nullable_fields():
    now = datetime.now(timezone.utc)
    r = ActivityResponse(
        id=1,
        entity_type="task",
        entity_id=None,
        entity_name=None,
        project_id=uuid.uuid4(),
        actor_id=None,
        actor_name=None,
        action="task_deleted",
        field=None,
        old_value=None,
        new_value=None,
        meta=None,
        created_at=now,
    )
    assert r.entity_id is None
    assert r.entity_name is None
    assert r.actor_id is None
    assert r.meta is None


# ============================================================================
# AUDIT LOG SCHEMA TESTS
# ============================================================================

from app.schemas.audit_log import AuditLogResponse, PaginatedAuditLogResponse


def test_audit_log_response_full():
    now = datetime.now(timezone.utc)
    r = AuditLogResponse(
        id=1,
        project_id=uuid.uuid4(),
        actor_id=uuid.uuid4(),
        actor_name="alice",
        action="workspace.created",
        entity_type="workspace",
        entity_id=str(uuid.uuid4()),
        entity_name="My WS",
        meta={"extra": "data"},
        created_at=now,
    )
    assert r.action == "workspace.created"
    assert r.entity_type == "workspace"
    assert r.actor_name == "alice"
    assert r.meta == {"extra": "data"}


def test_audit_log_response_nullable_fields():
    now = datetime.now(timezone.utc)
    r = AuditLogResponse(
        id=2,
        project_id=uuid.uuid4(),
        actor_id=None,
        actor_name=None,
        action="member.removed",
        entity_type="member",
        entity_id=None,
        entity_name=None,
        meta=None,
        created_at=now,
    )
    assert r.actor_id is None
    assert r.entity_id is None
    assert r.meta is None


def test_paginated_audit_log_response_with_cursor():
    now = datetime.now(timezone.utc)
    item = AuditLogResponse(
        id=5, project_id=uuid.uuid4(), actor_id=None, actor_name=None,
        action="board.created", entity_type="board",
        entity_id=None, entity_name=None, meta=None, created_at=now,
    )
    r = PaginatedAuditLogResponse(items=[item], total=1, next_cursor=5)
    assert r.total == 1
    assert r.next_cursor == 5
    assert r.items[0].action == "board.created"


def test_paginated_audit_log_response_no_cursor():
    r = PaginatedAuditLogResponse(items=[], total=0)
    assert r.next_cursor is None
    assert r.items == []


# ============================================================================
# USER RESPONSE COMPUTED FIELDS (Phase 16)
# ============================================================================

from app.core.config import settings


def test_user_response_avatar_url_with_key():
    now = datetime.now(timezone.utc)
    uid = uuid.uuid4()
    r = UserResponse(
        id=uid, email="u@example.com",
        first_name="Jan", last_name="Doe",
        avatar_key="avatars/x/img.jpeg",
        is_verified=True, created_at=now,
    )
    assert r.avatar_url == f"{settings.base_url}/api/v1/users/{uid}/avatar"


def test_user_response_avatar_url_without_key():
    now = datetime.now(timezone.utc)
    r = UserResponse(id=uuid.uuid4(), email="u@example.com", is_verified=True, created_at=now)
    assert r.avatar_url is None


def test_user_response_initials_from_first_last():
    now = datetime.now(timezone.utc)
    r = UserResponse(
        id=uuid.uuid4(), email="u@example.com",
        first_name="Jan", last_name="Mrkvicka",
        is_verified=True, created_at=now,
    )
    assert r.initials == "JM"


def test_user_response_initials_from_username():
    now = datetime.now(timezone.utc)
    r = UserResponse(
        id=uuid.uuid4(), email="u@example.com",
        username="alice", is_verified=True, created_at=now,
    )
    assert r.initials == "A"


def test_user_response_initials_from_email():
    now = datetime.now(timezone.utc)
    r = UserResponse(id=uuid.uuid4(), email="zoe@example.com", is_verified=True, created_at=now)
    assert r.initials == "Z"


# ============================================================================
# REQ-GRID — Grid coordinate schema tests
# ============================================================================

def test_task_update_accepts_grid_coordinates():
    """REQ-GRID-05: grid_x and grid_y are valid optional fields on TaskUpdate."""
    payload = TaskUpdate(version=1, grid_x=1, grid_y=3)
    assert payload.grid_x == 1
    assert payload.grid_y == 3


def test_task_update_grid_coordinates_nullable():
    """REQ-GRID-05: grid_x and grid_y default to None when omitted."""
    payload = TaskUpdate(version=1)
    assert payload.grid_x is None
    assert payload.grid_y is None


def test_task_update_grid_coordinates_explicit_none():
    """REQ-GRID-05: grid_x and grid_y can be explicitly set to None to clear grid placement."""
    payload = TaskUpdate(version=1, grid_x=None, grid_y=None)
    assert payload.grid_x is None
    assert payload.grid_y is None


def test_task_reorder_item_accepts_grid_coordinates():
    """REQ-GRID-06: TaskReorderItem accepts optional grid_x and grid_y."""
    from app.schemas.task import TaskReorderItem
    item = TaskReorderItem(id=uuid.uuid4(), position=0, grid_x=0, grid_y=2)
    assert item.grid_x == 0
    assert item.grid_y == 2


def test_task_reorder_item_grid_coordinates_optional():
    """REQ-GRID-06: TaskReorderItem grid_x/grid_y default to None."""
    from app.schemas.task import TaskReorderItem
    item = TaskReorderItem(id=uuid.uuid4(), position=0)
    assert item.grid_x is None
    assert item.grid_y is None


# ============================================================================
# AUTOMATION RULE SCHEMAS
# ============================================================================

from app.schemas.automation_rule import (
    AutomationRuleCreate, AutomationRuleUpdate, AutomationRuleResponse,
)


def test_automation_rule_create_valid():
    r = AutomationRuleCreate(
        name="Auto-close PR",
        trigger="pr_merged",
        actions=[{"type": "set_status", "value": "done"}],
    )
    assert r.trigger == "pr_merged"
    assert r.enabled is True
    assert r.conditions is None


def test_automation_rule_create_with_conditions():
    r = AutomationRuleCreate(
        name="On create",
        trigger="task_created",
        trigger_config={"source": "api"},
        conditions=[{"field": "priority", "op": "eq", "value": "high"}],
        actions=[{"type": "assign", "user": "me"}],
        enabled=False,
    )
    assert r.enabled is False
    assert len(r.conditions) == 1


def test_automation_rule_create_empty_name_rejected():
    with pytest.raises(ValidationError):
        AutomationRuleCreate(name="", trigger="task_created", actions=[{"type": "noop"}])


def test_automation_rule_create_empty_actions_rejected():
    with pytest.raises(ValidationError):
        AutomationRuleCreate(name="x", trigger="task_created", actions=[])


def test_automation_rule_create_invalid_trigger_rejected():
    with pytest.raises(ValidationError):
        AutomationRuleCreate(name="x", trigger="unknown_event", actions=[{"type": "noop"}])


def test_automation_rule_update_all_none():
    u = AutomationRuleUpdate()
    assert u.name is None
    assert u.enabled is None
    assert u.position is None


def test_automation_rule_update_partial():
    u = AutomationRuleUpdate(enabled=False, position=2)
    assert u.enabled is False
    assert u.position == 2


def test_automation_rule_response_from_attributes():
    pid = uuid.uuid4()
    rid = uuid.uuid4()
    r = AutomationRuleResponse(
        id=rid,
        project_id=pid,
        name="Test rule",
        trigger="status_changed",
        actions=[{"type": "notify"}],
        enabled=True,
        position=0,
    )
    assert r.id == rid
    assert r.trigger == "status_changed"
    assert r.trigger_config is None


# ============================================================================
# BASELINE SCHEMAS
# ============================================================================

from app.schemas.baseline import BaselineNeighbor, BaselinePredictionResponse


def test_baseline_neighbor_valid():
    n = BaselineNeighbor(title="Similar task", days=3.5, similarity=0.87)
    assert n.days == 3.5
    assert n.similarity == 0.87


def test_baseline_prediction_no_data():
    r = BaselinePredictionResponse(enough_data=False)
    assert r.enough_data is False
    assert r.predicted_days is None
    assert r.neighbors == []
    assert r.surprise is False


def test_baseline_prediction_with_data():
    n = BaselineNeighbor(title="Old task", days=2.0, similarity=0.9)
    r = BaselinePredictionResponse(
        enough_data=True,
        predicted_days=4.2,
        confidence=0.78,
        elapsed_days=1.5,
        surprise=True,
        neighbors=[n],
    )
    assert r.predicted_days == 4.2
    assert r.surprise is True
    assert len(r.neighbors) == 1


# ============================================================================
# CUSTOM FIELD SCHEMAS
# ============================================================================

from app.schemas.custom_field import CustomFieldCreate, CustomFieldUpdate, CustomFieldResponse


def test_custom_field_create_text():
    f = CustomFieldCreate(name="Notes", field_type="text")
    assert f.field_type == "text"
    assert f.required is False
    assert f.options is None


def test_custom_field_create_select_with_options():
    f = CustomFieldCreate(name="Priority", field_type="select", options=["Low", "Medium", "High"], required=True)
    assert f.options == ["Low", "Medium", "High"]
    assert f.required is True


def test_custom_field_create_empty_name_rejected():
    with pytest.raises(ValidationError):
        CustomFieldCreate(name="", field_type="text")


def test_custom_field_create_invalid_type_rejected():
    with pytest.raises(ValidationError):
        CustomFieldCreate(name="x", field_type="json")


def test_custom_field_update_all_none():
    u = CustomFieldUpdate()
    assert u.name is None
    assert u.required is None
    assert u.position is None


def test_custom_field_response_valid():
    r = CustomFieldResponse(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        name="Story Points",
        field_type="number",
        required=False,
        position=1,
    )
    assert r.field_type == "number"
    assert r.options is None


# ============================================================================
# CYCLE CONFIG SCHEMAS
# ============================================================================

from datetime import date as date_
from app.schemas.cycle_config import CycleConfigUpdate, CycleConfigResponse


def test_cycle_config_update_defaults():
    u = CycleConfigUpdate(start_anchor=date_(2026, 1, 1))
    assert u.enabled is True
    assert u.duration_weeks == 2
    assert u.cooldown_days == 0
    assert u.upcoming_count == 2


def test_cycle_config_update_custom():
    u = CycleConfigUpdate(enabled=False, duration_weeks=4, cooldown_days=3,
                          start_anchor=date_(2026, 3, 15), upcoming_count=5)
    assert u.duration_weeks == 4
    assert u.cooldown_days == 3


def test_cycle_config_update_duration_out_of_range_rejected():
    with pytest.raises(ValidationError):
        CycleConfigUpdate(duration_weeks=10, start_anchor=date_(2026, 1, 1))


def test_cycle_config_response_valid():
    pid = uuid.uuid4()
    r = CycleConfigResponse(
        project_id=pid,
        enabled=True,
        duration_weeks=2,
        cooldown_days=0,
        start_anchor=date_(2026, 6, 1),
        upcoming_count=2,
    )
    assert r.project_id == pid
    assert r.start_anchor == date_(2026, 6, 1)


# ============================================================================
# RELEASE SCHEMAS
# ============================================================================

from app.schemas.release import (
    ReleaseCreate, ReleaseUpdate, ReleaseResponse,
    ReleaseShipRequest, ReleaseShipResponse,
)


def test_release_create_minimal():
    r = ReleaseCreate(name="v1.0")
    assert r.name == "v1.0"
    assert r.status == "planned"
    assert r.start_date is None


def test_release_create_full():
    r = ReleaseCreate(
        name="v2.0",
        description="Major release",
        status="released",
        start_date=date_(2026, 5, 1),
        release_date=date_(2026, 6, 30),
    )
    assert r.status == "released"
    assert r.release_date == date_(2026, 6, 30)


def test_release_create_invalid_status_rejected():
    with pytest.raises(ValidationError):
        ReleaseCreate(name="bad", status="shipped")


def test_release_create_empty_name_rejected():
    with pytest.raises(ValidationError):
        ReleaseCreate(name="")


def test_release_update_all_none():
    u = ReleaseUpdate()
    assert u.name is None
    assert u.status is None
    assert u.position is None


def test_release_update_partial():
    u = ReleaseUpdate(status="archived", position=3)
    assert u.status == "archived"
    assert u.position == 3


def test_release_response_valid():
    now = datetime.now(timezone.utc)
    r = ReleaseResponse(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        name="v1.0",
        status="planned",
        created_at=now,
    )
    assert r.total_tasks == 0
    assert r.progress_pct == 0


def test_release_ship_request_defaults():
    r = ReleaseShipRequest()
    assert r.unfinished_action == "keep"
    assert r.target_release_id is None


def test_release_ship_request_move():
    tid = uuid.uuid4()
    r = ReleaseShipRequest(unfinished_action="move", target_release_id=tid)
    assert r.unfinished_action == "move"
    assert r.target_release_id == tid


def test_release_ship_request_invalid_action_rejected():
    with pytest.raises(ValidationError):
        ReleaseShipRequest(unfinished_action="delete")


def test_release_ship_response_valid():
    r = ReleaseShipResponse(
        id=uuid.uuid4(),
        status="released",
        total_tasks=10,
        done_tasks=8,
        incomplete_tasks=2,
        clean=False,
    )
    assert r.incomplete_tasks == 2
    assert r.clean is False


# ============================================================================
# STORY POINTS / VELOCITY SCHEMAS
# ============================================================================

from app.schemas.story_points import VelocitySprintPoint, VelocityResponse, SprintReportResponse


def test_velocity_sprint_point_valid():
    p = VelocitySprintPoint(sprint_id=uuid.uuid4(), name="Sprint 1", committed=20, completed=18)
    assert p.committed == 20
    assert p.completed == 18


def test_velocity_response_valid():
    p = VelocitySprintPoint(sprint_id=uuid.uuid4(), name="S1", committed=10, completed=10)
    r = VelocityResponse(sprints=[p], rolling_average=10.0, suggested_capacity=10)
    assert r.rolling_average == 10.0
    assert len(r.sprints) == 1


def test_velocity_response_empty_sprints():
    r = VelocityResponse(sprints=[], rolling_average=0.0, suggested_capacity=0)
    assert r.sprints == []


def test_sprint_report_response_valid():
    r = SprintReportResponse(
        committed=20, completed=15, total=22,
        scope_change=2, carryover=5,
        task_count=10, completed_count=7,
    )
    assert r.carryover == 5
    assert r.completed_count == 7


# ============================================================================
# TASK TEMPLATE SCHEMAS
# ============================================================================

from app.schemas.task_template import TaskTemplateCreate, TaskTemplateUpdate, TaskTemplateResponse


def test_task_template_create_minimal():
    t = TaskTemplateCreate(name="Bug report")
    assert t.name == "Bug report"
    assert t.issue_type is None
    assert t.tag_ids == []


def test_task_template_create_full():
    pid = uuid.uuid4()
    t = TaskTemplateCreate(
        name="Feature request",
        title="New feature: {name}",
        description="Describe the feature",
        issue_type="story",
        priority_id=pid,
        severity="medium",
        tag_ids=[uuid.uuid4()],
    )
    assert t.issue_type == "story"
    assert t.severity == "medium"
    assert len(t.tag_ids) == 1


def test_task_template_create_empty_name_rejected():
    with pytest.raises(ValidationError):
        TaskTemplateCreate(name="")


def test_task_template_create_invalid_issue_type_rejected():
    with pytest.raises(ValidationError):
        TaskTemplateCreate(name="x", issue_type="ticket")


def test_task_template_create_invalid_severity_rejected():
    with pytest.raises(ValidationError):
        TaskTemplateCreate(name="x", severity="extreme")


def test_task_template_update_all_none():
    u = TaskTemplateUpdate()
    assert u.name is None
    assert u.issue_type is None
    assert u.position is None


def test_task_template_update_position_negative_rejected():
    with pytest.raises(ValidationError):
        TaskTemplateUpdate(position=-1)


def test_task_template_response_valid():
    r = TaskTemplateResponse(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        name="Bug report",
        position=0,
    )
    assert r.title is None
    assert r.tag_ids == []
    assert r.position == 0


# ============================================================================
# VCS SCHEMAS
# ============================================================================

from app.schemas.vcs import (
    VcsConnectionCreate, DevicePollRequest, VcsConnectionUpdate,
    VcsConnectionResponse, VcsConnectionCreated, TaskDevLinkResponse,
)


def test_vcs_connection_create_minimal():
    c = VcsConnectionCreate(provider="github", repo_identifier="org/repo")
    assert c.provider == "github"
    assert c.base_url is None
    assert c.token is None


def test_vcs_connection_create_with_token():
    c = VcsConnectionCreate(
        provider="bitbucket",
        repo_identifier="myteam/myrepo",
        token="bbtoken123",
        settings={"map": {"pr_merged": "done"}},
    )
    assert c.token == "bbtoken123"
    assert c.settings is not None


def test_vcs_connection_create_gitlab_custom_url():
    c = VcsConnectionCreate(
        provider="gitlab",
        repo_identifier="mygroup/myproject",
        base_url="https://gitlab.mycompany.com",
    )
    assert c.base_url == "https://gitlab.mycompany.com"


def test_device_poll_request_valid():
    r = DevicePollRequest(device_code="ABCD-1234")
    assert r.device_code == "ABCD-1234"


def test_vcs_connection_update_none():
    u = VcsConnectionUpdate()
    assert u.settings is None


def test_vcs_connection_update_with_settings():
    u = VcsConnectionUpdate(settings={"pr_merged": "done"})
    assert u.settings == {"pr_merged": "done"}


def test_vcs_connection_response_defaults():
    now = datetime.now(timezone.utc)
    r = VcsConnectionResponse(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        provider="github",
        repo_identifier="org/repo",
        created_at=now,
    )
    assert r.connected is False
    assert r.webhook_url == ""
    assert r.base_url is None


def test_vcs_connection_created_has_secret():
    now = datetime.now(timezone.utc)
    r = VcsConnectionCreated(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        provider="github",
        repo_identifier="org/repo",
        created_at=now,
        webhook_secret="supersecret",
    )
    assert r.webhook_secret == "supersecret"


def test_task_dev_link_response_commit():
    now = datetime.now(timezone.utc)
    r = TaskDevLinkResponse(
        id=uuid.uuid4(),
        kind="commit",
        external_id="abc123",
        title="fix: login crash",
        url="https://github.com/org/repo/commit/abc123",
        state="merged",
        created_at=now,
    )
    assert r.kind == "commit"
    assert r.number is None
    assert r.author_login is None
    assert r.provider == ""


def test_task_dev_link_response_pr():
    now = datetime.now(timezone.utc)
    r = TaskDevLinkResponse(
        id=uuid.uuid4(),
        kind="pr",
        external_id="pr-42",
        number=42,
        title="feat: new endpoint",
        url="https://github.com/org/repo/pull/42",
        state="open",
        author_login="alice",
        created_at=now,
        provider="github",
        repo_identifier="org/repo",
    )
    assert r.number == 42
    assert r.author_login == "alice"
    assert r.repo_identifier == "org/repo"
