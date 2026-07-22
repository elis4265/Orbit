import uuid
from datetime import datetime, timezone
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.models.task_link import TaskLink, LinkType
from app.models.task import Task, TaskStatus
from app.services.task_link import TaskLinkService

_NOW = datetime.now(timezone.utc)


def _make_link(source_id=None, target_id=None, link_type="blocks"):
    lnk = MagicMock(spec=TaskLink)
    lnk.id = uuid.uuid4()
    lnk.source_id = source_id or uuid.uuid4()
    lnk.target_id = target_id or uuid.uuid4()
    lnk.link_type = link_type
    lnk.created_at = _NOW
    return lnk


def _make_task(title="Other Task", status=TaskStatus.todo, sequence_number=7, project_key="HW"):
    t = MagicMock(spec=Task)
    t.id = uuid.uuid4()
    t.title = title
    t.status = status
    # HW-22: LinkedTaskInfo carries the key, so the mock must look like a real row.
    t.sequence_number = sequence_number
    t.project_key = project_key
    return t


@pytest.fixture
def mock_repo():
    return AsyncMock()


@pytest.fixture
def mock_session():
    return AsyncMock()


@pytest.fixture
def service(mock_repo, mock_session):
    return TaskLinkService(mock_repo, mock_session)


# ── list_links ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_links_outbound(service, mock_repo, mock_session):
    task_id = uuid.uuid4()
    other_id = uuid.uuid4()
    link = _make_link(source_id=task_id, target_id=other_id, link_type="blocks")
    other_task = _make_task("Other")
    other_task.id = other_id

    mock_repo.get_for_task = AsyncMock(return_value=[link])
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = other_task
    mock_session.execute = AsyncMock(return_value=mock_result)

    results = await service.list_links(task_id)
    assert len(results) == 1
    assert results[0].display_type == "Is blocker of"
    assert results[0].linked_task.title == "Other"


@pytest.mark.asyncio
async def test_list_links_inbound(service, mock_repo, mock_session):
    task_id = uuid.uuid4()
    other_id = uuid.uuid4()
    link = _make_link(source_id=other_id, target_id=task_id, link_type="blocks")
    other_task = _make_task("Other")
    other_task.id = other_id

    mock_repo.get_for_task = AsyncMock(return_value=[link])
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = other_task
    mock_session.execute = AsyncMock(return_value=mock_result)

    results = await service.list_links(task_id)
    assert results[0].display_type == "Is blocked by"


@pytest.mark.asyncio
async def test_list_links_relates_to_symmetric(service, mock_repo, mock_session):
    task_id = uuid.uuid4()
    other_id = uuid.uuid4()
    link = _make_link(source_id=other_id, target_id=task_id, link_type="relates_to")
    other_task = _make_task("Other")

    mock_repo.get_for_task = AsyncMock(return_value=[link])
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = other_task
    mock_session.execute = AsyncMock(return_value=mock_result)

    results = await service.list_links(task_id)
    assert results[0].display_type == "Is related to"


@pytest.mark.asyncio
async def test_list_links_deleted_task(service, mock_repo, mock_session):
    task_id = uuid.uuid4()
    link = _make_link(source_id=task_id, link_type="duplicates")

    mock_repo.get_for_task = AsyncMock(return_value=[link])
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    results = await service.list_links(task_id)
    assert results[0].linked_task.title == "[deleted]"
    # HW-22: no row to read a key from — defaults, not an exception.
    assert results[0].linked_task.sequence_number == 0
    assert results[0].linked_task.project_key == ""


# ── HW-22: linked issues carry their key ──────────────────────────────────────

@pytest.mark.asyncio
async def test_list_links_exposes_linked_task_key(service, mock_repo, mock_session):
    task_id = uuid.uuid4()
    other_id = uuid.uuid4()
    link = _make_link(source_id=task_id, target_id=other_id, link_type="blocks")
    other_task = _make_task("Other", sequence_number=22, project_key="HW")
    other_task.id = other_id

    mock_repo.get_for_task = AsyncMock(return_value=[link])
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = other_task
    mock_session.execute = AsyncMock(return_value=mock_result)

    results = await service.list_links(task_id)
    assert results[0].linked_task.sequence_number == 22
    assert results[0].linked_task.project_key == "HW"


@pytest.mark.asyncio
async def test_add_link_response_carries_key(service, mock_repo, mock_session):
    source_id, target_id = uuid.uuid4(), uuid.uuid4()
    link = _make_link(source_id=source_id, target_id=target_id, link_type="depends_on")
    other_task = _make_task("Target Task", sequence_number=3, project_key="ORB")

    mock_repo.exists = AsyncMock(return_value=False)
    mock_repo.create = AsyncMock(return_value=link)
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = other_task
    mock_session.execute = AsyncMock(return_value=mock_result)

    result = await service.add_link(source_id, target_id, LinkType.depends_on, uuid.uuid4())
    assert result.linked_task.project_key == "ORB"
    assert result.linked_task.sequence_number == 3


# ── add_link ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_link_self_reference_raises(service):
    task_id = uuid.uuid4()
    with pytest.raises(ValueError, match="itself"):
        await service.add_link(task_id, task_id, LinkType.blocks, uuid.uuid4())


@pytest.mark.asyncio
async def test_add_link_duplicate_raises(service, mock_repo):
    mock_repo.exists = AsyncMock(side_effect=[True])
    with pytest.raises(ValueError, match="already exists"):
        await service.add_link(uuid.uuid4(), uuid.uuid4(), LinkType.blocks, uuid.uuid4())


@pytest.mark.asyncio
async def test_add_link_inverse_pair_raises(service, mock_repo):
    # A blocks B exists; attempting B blocks A must be rejected
    source_id, target_id = uuid.uuid4(), uuid.uuid4()
    mock_repo.exists = AsyncMock(side_effect=[False, True])  # forward absent, inverse present
    with pytest.raises(ValueError, match="Inverse link"):
        await service.add_link(source_id, target_id, LinkType.blocks, uuid.uuid4())


@pytest.mark.asyncio
async def test_add_link_inverse_pair_relates_to_raises(service, mock_repo):
    # A relates_to B exists; B relates_to A is the same semantic — reject
    source_id, target_id = uuid.uuid4(), uuid.uuid4()
    mock_repo.exists = AsyncMock(side_effect=[False, True])
    with pytest.raises(ValueError, match="Inverse link"):
        await service.add_link(source_id, target_id, LinkType.relates_to, uuid.uuid4())


@pytest.mark.asyncio
async def test_add_link_success(service, mock_repo, mock_session):
    source_id = uuid.uuid4()
    target_id = uuid.uuid4()
    link = _make_link(source_id=source_id, target_id=target_id, link_type="depends_on")
    other_task = _make_task("Target Task")

    mock_repo.exists = AsyncMock(return_value=False)
    mock_repo.create = AsyncMock(return_value=link)
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = other_task
    mock_session.execute = AsyncMock(return_value=mock_result)

    result = await service.add_link(source_id, target_id, LinkType.depends_on, uuid.uuid4())
    assert result.display_type == "Is dependent on"
    assert result.linked_task.title == "Target Task"


# ── remove_link ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_remove_link_success(service, mock_repo):
    link = _make_link()
    mock_repo.get = AsyncMock(return_value=link)
    mock_repo.delete = AsyncMock()
    result = await service.remove_link(link.id)
    assert result is True
    mock_repo.delete.assert_called_once_with(link)


@pytest.mark.asyncio
async def test_remove_link_not_found(service, mock_repo):
    mock_repo.get = AsyncMock(return_value=None)
    result = await service.remove_link(uuid.uuid4())
    assert result is False
