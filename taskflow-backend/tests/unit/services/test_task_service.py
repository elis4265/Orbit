import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.core.errors import AppError
from app.services.task import TaskService
from app.schemas.task import TaskCreate, TaskUpdate, TaskReorderItem
from app.models.task import Task, TaskStatus, IssueType, SeverityLevel


@pytest.fixture
def mock_task_repo():
    return MagicMock()


@pytest.fixture
def task_service(mock_task_repo):
    return TaskService(task_repo=mock_task_repo)


def make_task(**kwargs):
    defaults = {
        "id": uuid.uuid4(),
        "title": "Test Task",
        "description": None,
        "status": TaskStatus.todo,
        "issue_type": IssueType.task,
        "severity": None,
        "priority_id": None,
        "position": 0,
        "version": 1,
        "project_id": uuid.uuid4(),
        "parent_id": None,
        "sub_tasks": [],
    }
    defaults.update(kwargs)
    return Task(**defaults)


@pytest.mark.asyncio
async def test_create_task(task_service, mock_task_repo):
    project_id = uuid.uuid4()
    payload = TaskCreate(title="New Feature")
    expected = make_task(title="New Feature", project_id=project_id, sequence_number=1)

    mock_task_repo.create_with_sequence = AsyncMock(return_value=expected)

    result = await task_service.create_task(project_id, payload)

    assert result.title == "New Feature"
    mock_task_repo.create_with_sequence.assert_called_once()
    call_data = mock_task_repo.create_with_sequence.call_args[0][1]
    assert call_data["project_id"] == project_id
    assert call_data["title"] == "New Feature"


@pytest.mark.asyncio
async def test_get_project_tasks_returns_list(task_service, mock_task_repo):
    project_id = uuid.uuid4()
    tasks = [make_task(), make_task()]
    mock_task_repo.get_project_tasks = AsyncMock(return_value=tasks)

    result = await task_service.get_project_tasks(project_id)

    assert len(result) == 2
    mock_task_repo.get_project_tasks.assert_called_once_with(project_id, None, None, None, False)


@pytest.mark.asyncio
async def test_get_project_tasks_includes_child_tasks(task_service, mock_task_repo):
    project_id = uuid.uuid4()
    parent_id = uuid.uuid4()
    tasks = [make_task(), make_task(parent_id=parent_id)]
    mock_task_repo.get_project_tasks = AsyncMock(return_value=tasks)

    result = await task_service.get_project_tasks(project_id)

    assert len(result) == 2
    assert any(t.parent_id == parent_id for t in result)


@pytest.mark.asyncio
async def test_get_project_tasks_filters_by_status(task_service, mock_task_repo):
    project_id = uuid.uuid4()
    todo_tasks = [make_task(status=TaskStatus.todo)]
    mock_task_repo.get_project_tasks = AsyncMock(return_value=todo_tasks)

    result = await task_service.get_project_tasks(project_id, status=TaskStatus.todo)

    assert len(result) == 1
    mock_task_repo.get_project_tasks.assert_called_once_with(project_id, TaskStatus.todo, None, None, False)


@pytest.mark.asyncio
async def test_get_task_with_subtasks_delegates_to_repo(task_service, mock_task_repo):
    task = make_task()
    mock_task_repo.get_with_children = AsyncMock(return_value=task)

    result = await task_service.get_task_with_subtasks(task.id)

    assert result == task
    mock_task_repo.get_with_children.assert_called_once_with(task.id)


@pytest.mark.asyncio
async def test_update_task_success(task_service, mock_task_repo):
    task_id = uuid.uuid4()
    updated = make_task(id=task_id, status=TaskStatus.in_progress, version=2)

    mock_task_repo.update_with_occ = AsyncMock(return_value=True)
    mock_task_repo.get_with_children = AsyncMock(return_value=updated)

    payload = TaskUpdate(version=1, status=TaskStatus.in_progress)
    result = await task_service.update_task(task_id, payload)

    assert result is not None
    assert result.status == TaskStatus.in_progress
    mock_task_repo.update_with_occ.assert_called_once_with(
        task_id, 1, {"status": TaskStatus.in_progress}
    )
    mock_task_repo.get_with_children.assert_called_once_with(task_id)


@pytest.mark.asyncio
async def test_update_task_version_conflict_returns_none(task_service, mock_task_repo):
    task_id = uuid.uuid4()
    mock_task_repo.update_with_occ = AsyncMock(return_value=False)
    mock_task_repo.get_with_children = AsyncMock()

    payload = TaskUpdate(version=1, status=TaskStatus.done)
    result = await task_service.update_task(task_id, payload)

    assert result is None
    mock_task_repo.get_with_children.assert_not_called()


@pytest.mark.asyncio
async def test_delete_task_success(task_service, mock_task_repo):
    task = make_task()
    mock_task_repo.get = AsyncMock(return_value=task)
    mock_task_repo.delete = AsyncMock()

    result = await task_service.delete_task(task.id)

    assert result is True
    mock_task_repo.delete.assert_called_once_with(task)


@pytest.mark.asyncio
async def test_delete_task_not_found_returns_false(task_service, mock_task_repo):
    mock_task_repo.get = AsyncMock(return_value=None)
    mock_task_repo.delete = AsyncMock()

    result = await task_service.delete_task(uuid.uuid4())

    assert result is False
    mock_task_repo.delete.assert_not_called()


@pytest.mark.asyncio
async def test_reorder_tasks_delegates_to_repo(task_service, mock_task_repo):
    items = [
        TaskReorderItem(id=uuid.uuid4(), position=0),
        TaskReorderItem(id=uuid.uuid4(), position=1),
    ]
    mock_task_repo.bulk_update_positions = AsyncMock()

    await task_service.reorder_tasks(items)

    mock_task_repo.bulk_update_positions.assert_called_once_with(items)


# ---------------------------------------------------------------------------
# HW-18 — per-project default assignee applied at the create_task choke point
# ---------------------------------------------------------------------------

def make_project_repo(mode="unassigned", default_assignee_id=None):
    repo = MagicMock()
    project = MagicMock()
    project.default_assignee_mode = mode
    project.default_assignee_id = default_assignee_id
    repo.get = AsyncMock(return_value=project)
    return repo


async def _created_assignee(mock_task_repo, project_repo, payload, created_by=None,
                            apply_default_assignee=True):
    svc = TaskService(task_repo=mock_task_repo, project_repo=project_repo)
    mock_task_repo.create_with_sequence = AsyncMock(return_value=make_task())
    await svc.create_task(uuid.uuid4(), payload, created_by=created_by,
                          apply_default_assignee=apply_default_assignee)
    return mock_task_repo.create_with_sequence.call_args[0][1]["assignee_id"]


@pytest.mark.asyncio
async def test_default_assignee_unassigned_leaves_null(mock_task_repo):
    result = await _created_assignee(
        mock_task_repo, make_project_repo("unassigned"),
        TaskCreate(title="t"), created_by=uuid.uuid4(),
    )
    assert result is None


@pytest.mark.asyncio
async def test_default_assignee_creator_mode_assigns_creator(mock_task_repo):
    creator = uuid.uuid4()
    result = await _created_assignee(
        mock_task_repo, make_project_repo("creator"), TaskCreate(title="t"), created_by=creator,
    )
    assert result == creator


@pytest.mark.asyncio
async def test_default_assignee_member_mode_assigns_configured_user(mock_task_repo):
    target = uuid.uuid4()
    result = await _created_assignee(
        mock_task_repo, make_project_repo("member", target),
        TaskCreate(title="t"), created_by=uuid.uuid4(),
    )
    assert result == target


@pytest.mark.asyncio
@pytest.mark.parametrize("mode,configured", [("creator", None), ("member", uuid.uuid4())])
async def test_imports_never_apply_the_default(mock_task_repo, mode, configured):
    """HW-18: an imported row with no assignee stays unassigned, whatever the project
    default — mass-assigning hundreds of imported rows to one person is surprising."""
    result = await _created_assignee(
        mock_task_repo, make_project_repo(mode, configured),
        TaskCreate(title="t"), created_by=uuid.uuid4(),
        apply_default_assignee=False,
    )
    assert result is None


@pytest.mark.asyncio
async def test_imports_still_honour_an_assignee_from_the_import_data(mock_task_repo):
    """Excluding the default must not discard an assignee the import did resolve."""
    from_import = uuid.uuid4()
    result = await _created_assignee(
        mock_task_repo, make_project_repo("member", uuid.uuid4()),
        TaskCreate(title="t", assignee_id=from_import), created_by=uuid.uuid4(),
        apply_default_assignee=False,
    )
    assert result == from_import


@pytest.mark.asyncio
async def test_explicit_assignee_always_wins(mock_task_repo):
    explicit = uuid.uuid4()
    for repo in (make_project_repo("creator"), make_project_repo("member", uuid.uuid4())):
        result = await _created_assignee(
            mock_task_repo, repo,
            TaskCreate(title="t", assignee_id=explicit), created_by=uuid.uuid4(),
        )
        assert result == explicit


@pytest.mark.asyncio
async def test_creator_mode_with_no_creator_stays_null(mock_task_repo):
    """System-driven creation with no actor can't assign a creator."""
    result = await _created_assignee(
        mock_task_repo, make_project_repo("creator"), TaskCreate(title="t"), created_by=None,
    )
    assert result is None


@pytest.mark.asyncio
async def test_member_mode_without_configured_id_stays_null(mock_task_repo):
    result = await _created_assignee(
        mock_task_repo, make_project_repo("member", None),
        TaskCreate(title="t"), created_by=uuid.uuid4(),
    )
    assert result is None


# ---------------------------------------------------------------------------
# Hierarchy validation (_validate_hierarchy)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_hierarchy_epic_no_parent_ok(task_service, mock_task_repo):
    await task_service._validate_hierarchy(IssueType.epic, None)  # must not raise


@pytest.mark.asyncio
async def test_hierarchy_task_no_parent_ok(task_service, mock_task_repo):
    await task_service._validate_hierarchy(IssueType.task, None)  # standalone task is fine


@pytest.mark.asyncio
async def test_hierarchy_story_under_epic_ok(task_service, mock_task_repo):
    epic = make_task(issue_type=IssueType.epic)
    mock_task_repo.get = AsyncMock(return_value=epic)
    await task_service._validate_hierarchy(IssueType.story, epic.id)


@pytest.mark.asyncio
async def test_hierarchy_task_under_story_ok(task_service, mock_task_repo):
    story = make_task(issue_type=IssueType.story)
    mock_task_repo.get = AsyncMock(return_value=story)
    await task_service._validate_hierarchy(IssueType.task, story.id)


@pytest.mark.asyncio
async def test_hierarchy_task_under_epic_ok(task_service, mock_task_repo):
    epic = make_task(issue_type=IssueType.epic)
    mock_task_repo.get = AsyncMock(return_value=epic)
    await task_service._validate_hierarchy(IssueType.task, epic.id)


@pytest.mark.asyncio
async def test_hierarchy_bug_under_story_ok(task_service, mock_task_repo):
    story = make_task(issue_type=IssueType.story)
    mock_task_repo.get = AsyncMock(return_value=story)
    await task_service._validate_hierarchy(IssueType.bug, story.id)


@pytest.mark.asyncio
async def test_hierarchy_epic_with_parent_raises(task_service, mock_task_repo):
    parent = make_task(issue_type=IssueType.story)
    mock_task_repo.get = AsyncMock(return_value=parent)
    with pytest.raises(AppError) as exc_info:
        await task_service._validate_hierarchy(IssueType.epic, parent.id)
    assert exc_info.value.code == "INVALID_HIERARCHY"
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_hierarchy_story_under_task_raises(task_service, mock_task_repo):
    parent = make_task(issue_type=IssueType.task)
    mock_task_repo.get = AsyncMock(return_value=parent)
    with pytest.raises(AppError) as exc_info:
        await task_service._validate_hierarchy(IssueType.story, parent.id)
    assert exc_info.value.code == "INVALID_HIERARCHY"


@pytest.mark.asyncio
async def test_hierarchy_story_under_bug_raises(task_service, mock_task_repo):
    parent = make_task(issue_type=IssueType.bug)
    mock_task_repo.get = AsyncMock(return_value=parent)
    with pytest.raises(AppError) as exc_info:
        await task_service._validate_hierarchy(IssueType.story, parent.id)
    assert exc_info.value.code == "INVALID_HIERARCHY"


@pytest.mark.asyncio
async def test_hierarchy_task_under_bug_raises(task_service, mock_task_repo):
    parent = make_task(issue_type=IssueType.bug)
    mock_task_repo.get = AsyncMock(return_value=parent)
    with pytest.raises(AppError) as exc_info:
        await task_service._validate_hierarchy(IssueType.task, parent.id)
    assert exc_info.value.code == "INVALID_HIERARCHY"


@pytest.mark.asyncio
async def test_hierarchy_parent_not_found_raises(task_service, mock_task_repo):
    mock_task_repo.get = AsyncMock(return_value=None)
    with pytest.raises(AppError) as exc_info:
        await task_service._validate_hierarchy(IssueType.task, uuid.uuid4())
    assert exc_info.value.status_code == 404
    assert exc_info.value.code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_create_task_with_bug_issue_type(task_service, mock_task_repo):
    project_id = uuid.uuid4()
    payload = TaskCreate(title="Login crashes", issue_type=IssueType.bug)
    expected = make_task(title="Login crashes", issue_type=IssueType.bug, project_id=project_id, sequence_number=1)
    mock_task_repo.create_with_sequence = AsyncMock(return_value=expected)

    result = await task_service.create_task(project_id, payload)

    assert result.issue_type == IssueType.bug
    call_data = mock_task_repo.create_with_sequence.call_args[0][1]
    assert call_data["issue_type"] == IssueType.bug


@pytest.mark.asyncio
async def test_create_task_with_epic_issue_type(task_service, mock_task_repo):
    project_id = uuid.uuid4()
    payload = TaskCreate(title="Auth overhaul", issue_type=IssueType.epic)
    expected = make_task(title="Auth overhaul", issue_type=IssueType.epic, project_id=project_id, sequence_number=1)
    mock_task_repo.create_with_sequence = AsyncMock(return_value=expected)

    result = await task_service.create_task(project_id, payload)

    assert result.issue_type == IssueType.epic
    call_data = mock_task_repo.create_with_sequence.call_args[0][1]
    assert call_data["issue_type"] == IssueType.epic


@pytest.mark.asyncio
async def test_create_task_with_story_issue_type(task_service, mock_task_repo):
    project_id = uuid.uuid4()
    payload = TaskCreate(title="User can log in", issue_type=IssueType.story)
    expected = make_task(title="User can log in", issue_type=IssueType.story, project_id=project_id, sequence_number=1)
    mock_task_repo.create_with_sequence = AsyncMock(return_value=expected)

    result = await task_service.create_task(project_id, payload)

    assert result.issue_type == IssueType.story
    call_data = mock_task_repo.create_with_sequence.call_args[0][1]
    assert call_data["issue_type"] == IssueType.story


@pytest.mark.asyncio
async def test_create_task_default_issue_type_is_task(task_service, mock_task_repo):
    project_id = uuid.uuid4()
    payload = TaskCreate(title="Fix button alignment")  # no issue_type supplied
    expected = make_task(title="Fix button alignment", project_id=project_id, sequence_number=1)
    mock_task_repo.create_with_sequence = AsyncMock(return_value=expected)

    await task_service.create_task(project_id, payload)

    call_data = mock_task_repo.create_with_sequence.call_args[0][1]
    assert call_data["issue_type"] == IssueType.task


@pytest.mark.asyncio
async def test_create_task_validates_hierarchy(task_service, mock_task_repo):
    parent = make_task(issue_type=IssueType.bug)
    epic_id = parent.id
    mock_task_repo.get = AsyncMock(return_value=parent)

    payload = TaskCreate(title="Story", issue_type=IssueType.story, parent_id=epic_id)
    with pytest.raises(AppError) as exc_info:
        await task_service.create_task(uuid.uuid4(), payload)
    assert exc_info.value.code == "INVALID_HIERARCHY"
    mock_task_repo.create.assert_not_called()


@pytest.mark.asyncio
async def test_update_task_validates_hierarchy_on_parent_change(task_service, mock_task_repo):
    task_id = uuid.uuid4()
    current = make_task(id=task_id, issue_type=IssueType.story)
    bad_parent = make_task(issue_type=IssueType.bug)

    mock_task_repo.get = AsyncMock(side_effect=[current, bad_parent])

    payload = TaskUpdate(version=1, parent_id=bad_parent.id)
    with pytest.raises(AppError) as exc_info:
        await task_service.update_task(task_id, payload)
    assert exc_info.value.code == "INVALID_HIERARCHY"
    mock_task_repo.update_with_occ.assert_not_called()


@pytest.mark.asyncio
async def test_update_task_validates_hierarchy_on_type_change(task_service, mock_task_repo):
    epic_id = uuid.uuid4()
    task_id = uuid.uuid4()
    # task currently lives under an epic; changing type to story is fine
    # but changing to epic while still having a parent is invalid
    current = make_task(id=task_id, issue_type=IssueType.task, parent_id=epic_id)
    epic = make_task(id=epic_id, issue_type=IssueType.epic)

    mock_task_repo.get = AsyncMock(side_effect=[current, epic])
    mock_task_repo.update_with_occ = AsyncMock(return_value=True)
    updated = make_task(id=task_id, issue_type=IssueType.story, parent_id=epic_id)
    mock_task_repo.get_with_children = AsyncMock(return_value=updated)

    payload = TaskUpdate(version=1, issue_type=IssueType.story)
    result = await task_service.update_task(task_id, payload)
    assert result is not None


@pytest.mark.asyncio
async def test_update_task_no_hierarchy_check_on_unrelated_fields(task_service, mock_task_repo):
    task_id = uuid.uuid4()
    updated = make_task(id=task_id, status=TaskStatus.done, version=2)

    mock_task_repo.update_with_occ = AsyncMock(return_value=True)
    mock_task_repo.get_with_children = AsyncMock(return_value=updated)

    payload = TaskUpdate(version=1, status=TaskStatus.done)
    result = await task_service.update_task(task_id, payload)

    assert result is not None
    mock_task_repo.get.assert_not_called()  # no hierarchy fetch needed


# ---------------------------------------------------------------------------
# Sequence number (REQ-SEQ02, REQ-SEQ03)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_task_uses_create_with_sequence(task_service, mock_task_repo):
    """create_task must delegate to create_with_sequence, not plain create (REQ-SEQ02)."""
    project_id = uuid.uuid4()
    payload = TaskCreate(title="Sequenced task")
    expected = make_task(title="Sequenced task", project_id=project_id, sequence_number=1)

    mock_task_repo.create_with_sequence = AsyncMock(return_value=expected)
    mock_task_repo.create = AsyncMock()  # must NOT be called

    result = await task_service.create_task(project_id, payload)

    assert result.sequence_number == 1
    mock_task_repo.create_with_sequence.assert_called_once()
    mock_task_repo.create.assert_not_called()


@pytest.mark.asyncio
async def test_create_task_sequence_number_in_payload(task_service, mock_task_repo):
    """The data dict passed to create_with_sequence must NOT contain sequence_number —
    the repo method assigns it from the locked project row (REQ-SEQ02)."""
    project_id = uuid.uuid4()
    payload = TaskCreate(title="Check payload")
    expected = make_task(project_id=project_id, sequence_number=5)

    mock_task_repo.create_with_sequence = AsyncMock(return_value=expected)

    await task_service.create_task(project_id, payload)

    call_data = mock_task_repo.create_with_sequence.call_args[0][1]
    assert "sequence_number" not in call_data  # repo assigns it, not service


@pytest.mark.asyncio
async def test_create_task_increments_per_project(task_service, mock_task_repo):
    """Two tasks in the same project must get consecutive sequence_numbers (REQ-SEQ02)."""
    project_id = uuid.uuid4()
    task1 = make_task(project_id=project_id, sequence_number=1)
    task2 = make_task(project_id=project_id, sequence_number=2)

    mock_task_repo.create_with_sequence = AsyncMock(side_effect=[task1, task2])

    r1 = await task_service.create_task(project_id, TaskCreate(title="First"))
    r2 = await task_service.create_task(project_id, TaskCreate(title="Second"))

    assert r1.sequence_number == 1
    assert r2.sequence_number == 2
    assert mock_task_repo.create_with_sequence.call_count == 2


@pytest.mark.asyncio
async def test_create_task_sequence_independent_across_projects(task_service, mock_task_repo):
    """sequence_number resets per project — different project_ids start from 1 (REQ-SEQ02)."""
    pid_a = uuid.uuid4()
    pid_b = uuid.uuid4()
    task_a = make_task(project_id=pid_a, sequence_number=1)
    task_b = make_task(project_id=pid_b, sequence_number=1)

    mock_task_repo.create_with_sequence = AsyncMock(side_effect=[task_a, task_b])

    r_a = await task_service.create_task(pid_a, TaskCreate(title="In A"))
    r_b = await task_service.create_task(pid_b, TaskCreate(title="In B"))

    assert r_a.sequence_number == 1
    assert r_b.sequence_number == 1
    first_call_pid = mock_task_repo.create_with_sequence.call_args_list[0][0][0]
    second_call_pid = mock_task_repo.create_with_sequence.call_args_list[1][0][0]
    assert first_call_pid == pid_a
    assert second_call_pid == pid_b


# ---------------------------------------------------------------------------
# Epic rollup — Open mode auto-completes Epic when all children are done
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_maybe_rollup_epic_all_done_triggers_update(task_service, mock_task_repo):
    parent_id = uuid.uuid4()
    epic = make_task(id=parent_id, issue_type=IssueType.epic, version=1, status=TaskStatus.todo)
    sibling1 = make_task(status=TaskStatus.done, parent_id=parent_id)
    sibling2 = make_task(status=TaskStatus.done, parent_id=parent_id)
    updated_epic = make_task(id=parent_id, issue_type=IssueType.epic, status=TaskStatus.done, version=2)
    child = make_task(status=TaskStatus.done, parent_id=parent_id)

    mock_task_repo.get = AsyncMock(return_value=epic)
    mock_task_repo.get_children = AsyncMock(return_value=[sibling1, sibling2, child])
    mock_task_repo.update_with_occ = AsyncMock(return_value=True)
    mock_task_repo.get_with_children = AsyncMock(return_value=updated_epic)

    result = await task_service.maybe_rollup_epic(child, TaskStatus.done, "open")

    mock_task_repo.update_with_occ.assert_called_once_with(parent_id, 1, {"status": TaskStatus.done})
    assert result is not None
    assert result.status == TaskStatus.done


@pytest.mark.asyncio
async def test_maybe_rollup_epic_not_all_done_skips(task_service, mock_task_repo):
    parent_id = uuid.uuid4()
    epic = make_task(id=parent_id, issue_type=IssueType.epic, version=1)
    done_sibling = make_task(status=TaskStatus.done, parent_id=parent_id)
    todo_sibling = make_task(status=TaskStatus.todo, parent_id=parent_id)
    child = make_task(status=TaskStatus.done, parent_id=parent_id)

    mock_task_repo.get = AsyncMock(return_value=epic)
    mock_task_repo.get_children = AsyncMock(return_value=[done_sibling, todo_sibling, child])

    result = await task_service.maybe_rollup_epic(child, TaskStatus.done, "open")

    mock_task_repo.update_with_occ.assert_not_called()
    assert result is None


@pytest.mark.asyncio
async def test_maybe_rollup_epic_non_open_mode_skips(task_service, mock_task_repo):
    child = make_task(status=TaskStatus.done, parent_id=uuid.uuid4())

    result = await task_service.maybe_rollup_epic(child, TaskStatus.done, "guided")

    mock_task_repo.get.assert_not_called()
    assert result is None


@pytest.mark.asyncio
async def test_maybe_rollup_epic_no_parent_skips(task_service, mock_task_repo):
    child = make_task(status=TaskStatus.done, parent_id=None)

    result = await task_service.maybe_rollup_epic(child, TaskStatus.done, "open")

    mock_task_repo.get.assert_not_called()
    assert result is None


@pytest.mark.asyncio
async def test_maybe_rollup_epic_parent_not_epic_skips(task_service, mock_task_repo):
    parent_id = uuid.uuid4()
    story_parent = make_task(id=parent_id, issue_type=IssueType.story, version=1)
    child = make_task(status=TaskStatus.done, parent_id=parent_id)

    mock_task_repo.get = AsyncMock(return_value=story_parent)

    result = await task_service.maybe_rollup_epic(child, TaskStatus.done, "open")

    mock_task_repo.update_with_occ.assert_not_called()
    assert result is None


@pytest.mark.asyncio
async def test_maybe_rollup_epic_already_done_skips(task_service, mock_task_repo):
    parent_id = uuid.uuid4()
    epic = make_task(id=parent_id, issue_type=IssueType.epic, status=TaskStatus.done, version=3)
    child = make_task(status=TaskStatus.done, parent_id=parent_id)

    mock_task_repo.get = AsyncMock(return_value=epic)

    result = await task_service.maybe_rollup_epic(child, TaskStatus.done, "open")

    mock_task_repo.update_with_occ.assert_not_called()
    assert result is None


@pytest.mark.asyncio
async def test_maybe_rollup_epic_status_not_done_skips(task_service, mock_task_repo):
    child = make_task(status=TaskStatus.in_progress, parent_id=uuid.uuid4())

    result = await task_service.maybe_rollup_epic(child, TaskStatus.in_progress, "open")

    mock_task_repo.get.assert_not_called()
    assert result is None


# ---------------------------------------------------------------------------
# enforce_type_gates — Enforced mode type-specific gates
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bug_severity_gate_blocks_in_progress_without_severity(task_service, mock_task_repo):
    bug = make_task(issue_type=IssueType.bug, severity=None)
    update = TaskUpdate(version=1, status=TaskStatus.in_progress)

    with pytest.raises(AppError) as exc_info:
        await task_service.enforce_type_gates(bug, update, {}, "enforced")
    assert exc_info.value.code == "SEVERITY_REQUIRED"
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_bug_severity_gate_allows_in_progress_with_existing_severity(task_service, mock_task_repo):
    bug = make_task(issue_type=IssueType.bug, severity=SeverityLevel.high)
    update = TaskUpdate(version=1, status=TaskStatus.in_progress)

    await task_service.enforce_type_gates(bug, update, {}, "enforced")  # must not raise


@pytest.mark.asyncio
async def test_bug_severity_gate_allows_when_severity_in_update(task_service, mock_task_repo):
    bug = make_task(issue_type=IssueType.bug, severity=None)
    update = TaskUpdate(version=1, status=TaskStatus.in_progress, severity=SeverityLevel.medium)

    await task_service.enforce_type_gates(bug, update, {}, "enforced")  # must not raise


@pytest.mark.asyncio
async def test_bug_severity_gate_skips_non_enforced_mode(task_service, mock_task_repo):
    bug = make_task(issue_type=IssueType.bug, severity=None)
    update = TaskUpdate(version=1, status=TaskStatus.in_progress)

    await task_service.enforce_type_gates(bug, update, {}, "open")  # must not raise
    await task_service.enforce_type_gates(bug, update, {}, "guided")  # must not raise


@pytest.mark.asyncio
async def test_bug_severity_gate_skips_todo_transition(task_service, mock_task_repo):
    bug = make_task(issue_type=IssueType.bug, severity=None, status=TaskStatus.in_progress)
    update = TaskUpdate(version=1, status=TaskStatus.todo)

    await task_service.enforce_type_gates(bug, update, {}, "enforced")  # moving back to todo is fine


@pytest.mark.asyncio
async def test_story_gate_blocks_in_progress_without_parent(task_service, mock_task_repo):
    story = make_task(issue_type=IssueType.story, parent_id=None)
    update = TaskUpdate(version=1, status=TaskStatus.in_progress)

    with pytest.raises(AppError) as exc_info:
        await task_service.enforce_type_gates(story, update, {}, "enforced")
    assert exc_info.value.code == "EPIC_REQUIRED"
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_story_gate_blocks_done_without_parent(task_service, mock_task_repo):
    story = make_task(issue_type=IssueType.story, parent_id=None)
    update = TaskUpdate(version=1, status=TaskStatus.done)

    with pytest.raises(AppError) as exc_info:
        await task_service.enforce_type_gates(story, update, {}, "enforced")
    assert exc_info.value.code == "EPIC_REQUIRED"


@pytest.mark.asyncio
async def test_story_gate_allows_when_parent_is_epic(task_service, mock_task_repo):
    parent_id = uuid.uuid4()
    epic = make_task(id=parent_id, issue_type=IssueType.epic)
    story = make_task(issue_type=IssueType.story, parent_id=parent_id)
    mock_task_repo.get = AsyncMock(return_value=epic)

    update = TaskUpdate(version=1, status=TaskStatus.in_progress)
    await task_service.enforce_type_gates(story, update, {}, "enforced")  # must not raise


@pytest.mark.asyncio
async def test_story_gate_blocks_when_parent_is_not_epic(task_service, mock_task_repo):
    parent_id = uuid.uuid4()
    story_parent = make_task(id=parent_id, issue_type=IssueType.story)
    story = make_task(issue_type=IssueType.story, parent_id=parent_id)
    mock_task_repo.get = AsyncMock(return_value=story_parent)

    update = TaskUpdate(version=1, status=TaskStatus.in_progress)
    with pytest.raises(AppError) as exc_info:
        await task_service.enforce_type_gates(story, update, {}, "enforced")
    assert exc_info.value.code == "EPIC_REQUIRED"


@pytest.mark.asyncio
async def test_story_gate_skips_non_enforced_mode(task_service, mock_task_repo):
    story = make_task(issue_type=IssueType.story, parent_id=None)
    update = TaskUpdate(version=1, status=TaskStatus.in_progress)

    await task_service.enforce_type_gates(story, update, {}, "open")  # must not raise


@pytest.mark.asyncio
async def test_type_gates_skip_when_no_status_change(task_service, mock_task_repo):
    bug = make_task(issue_type=IssueType.bug, severity=None)
    update = TaskUpdate(version=1, title="Renamed")  # no status change

    await task_service.enforce_type_gates(bug, update, {}, "enforced")  # must not raise


@pytest.mark.asyncio
async def test_bug_gate_picks_up_status_from_extra_fields(task_service, mock_task_repo):
    """When custom_status_id drives the status, it lands in extra_fields["status"]."""
    bug = make_task(issue_type=IssueType.bug, severity=None)
    update = TaskUpdate(version=1)  # no status in payload itself
    extra = {"status": TaskStatus.in_progress}

    with pytest.raises(AppError) as exc_info:
        await task_service.enforce_type_gates(bug, update, extra, "enforced")
    assert exc_info.value.code == "SEVERITY_REQUIRED"


# enforce_block_gate ─────────────────────────────────────────────────────────

def make_link_repo(active_blockers=None):
    repo = MagicMock()
    repo.get_incoming_active_blocks = AsyncMock(return_value=active_blockers or [])
    return repo


@pytest.mark.asyncio
async def test_block_gate_raises_when_enforce_on_and_done_with_active_blockers(task_service):
    task = make_task()
    update = TaskUpdate(version=1, status=TaskStatus.done)
    link_repo = make_link_repo(active_blockers=[MagicMock()])

    with pytest.raises(AppError) as exc_info:
        await task_service.enforce_block_gate(task, update, {}, "enforced", True, link_repo)
    assert exc_info.value.code == "BLOCKED"


@pytest.mark.asyncio
async def test_block_gate_allows_done_when_no_active_blockers(task_service):
    task = make_task()
    update = TaskUpdate(version=1, status=TaskStatus.done)
    link_repo = make_link_repo(active_blockers=[])

    await task_service.enforce_block_gate(task, update, {}, "enforced", True, link_repo)  # must not raise


@pytest.mark.asyncio
async def test_block_gate_skips_non_enforced_mode(task_service):
    task = make_task()
    update = TaskUpdate(version=1, status=TaskStatus.done)
    link_repo = make_link_repo(active_blockers=[MagicMock()])

    await task_service.enforce_block_gate(task, update, {}, "open", True, link_repo)  # must not raise
    await task_service.enforce_block_gate(task, update, {}, "guided", True, link_repo)  # must not raise


@pytest.mark.asyncio
async def test_block_gate_skips_when_enforce_flag_off(task_service):
    task = make_task()
    update = TaskUpdate(version=1, status=TaskStatus.done)
    link_repo = make_link_repo(active_blockers=[MagicMock()])

    await task_service.enforce_block_gate(task, update, {}, "enforced", False, link_repo)  # must not raise


@pytest.mark.asyncio
async def test_block_gate_skips_non_done_status(task_service):
    task = make_task()
    update = TaskUpdate(version=1, status=TaskStatus.in_progress)
    link_repo = make_link_repo(active_blockers=[MagicMock()])

    await task_service.enforce_block_gate(task, update, {}, "enforced", True, link_repo)  # must not raise


@pytest.mark.asyncio
async def test_block_gate_picks_up_done_from_extra_fields(task_service):
    task = make_task()
    update = TaskUpdate(version=1)
    extra = {"status": TaskStatus.done}
    link_repo = make_link_repo(active_blockers=[MagicMock()])

    with pytest.raises(AppError) as exc_info:
        await task_service.enforce_block_gate(task, update, extra, "enforced", True, link_repo)
    assert exc_info.value.code == "BLOCKED"


# ---------------------------------------------------------------------------
# bulk_update_tasks — removed with REQ-157: the repo-level silent path was
# superseded by routers/bulk_edit.py, which replays the full single-update
# pipeline per task (covered by tests/integration/test_bulk_edit_api.py).
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# HW-18 — an explicitly-sent assignee_id: null means "nobody", not "no opinion"
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.parametrize("mode,configured", [("creator", None), ("member", uuid.uuid4())])
async def test_explicit_null_assignee_beats_the_default(mock_task_repo, mode, configured):
    """The Create modal pre-fills the default and lets the creator clear it again.
    Clearing sends assignee_id: null explicitly — that has to stick, or the field
    the creator just emptied gets silently refilled behind their back."""
    payload = TaskCreate(title="t", assignee_id=None)
    assert "assignee_id" in payload.model_fields_set  # the distinction this rests on
    result = await _created_assignee(
        mock_task_repo, make_project_repo(mode, configured), payload, created_by=uuid.uuid4(),
    )
    assert result is None


@pytest.mark.asyncio
@pytest.mark.parametrize("mode,configured,expected_is_creator", [
    ("creator", None, True),
    ("member", None, False),
])
async def test_omitted_assignee_still_gets_the_default(mock_task_repo, mode, configured,
                                                       expected_is_creator):
    """The contrast case: a caller that never mentions assignee_id at all — API,
    PAT, recurring schedule — keeps receiving the project default."""
    creator = uuid.uuid4()
    target = configured or (creator if expected_is_creator else None)
    payload = TaskCreate(title="t")
    assert "assignee_id" not in payload.model_fields_set
    result = await _created_assignee(
        mock_task_repo, make_project_repo(mode, configured), payload, created_by=creator,
    )
    assert result == target
