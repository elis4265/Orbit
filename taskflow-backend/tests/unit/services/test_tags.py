import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.models.tag import Tag, TagVisibility
from app.models.project_member import MemberRole


@pytest.fixture
def mock_tag_repo():
    return MagicMock()


@pytest.fixture
def mock_member_repo():
    return MagicMock()


@pytest.fixture
def tag_service(mock_tag_repo, mock_member_repo):
    from app.services.tag import TagService
    return TagService(tag_repo=mock_tag_repo, member_repo=mock_member_repo)


def _make_tag(project_id=None, owner_id=None, name="bug", color="#ef4444", visibility=TagVisibility.workspace):
    t = MagicMock(spec=Tag)
    t.id = uuid.uuid4()
    t.project_id = project_id or uuid.uuid4()
    t.owner_id = owner_id or uuid.uuid4()
    t.name = name
    t.color = color
    t.visibility = visibility
    return t


# --- create ---

@pytest.mark.asyncio
async def test_create_tag_success(tag_service, mock_tag_repo):
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    tag = _make_tag(project_id=project_id, owner_id=user_id, name="bug")
    mock_tag_repo.get_by_name = AsyncMock(return_value=None)
    mock_tag_repo.create = AsyncMock(return_value=tag)

    result = await tag_service.create_tag(project_id=project_id, owner_id=user_id, name="bug", color=None, visibility=TagVisibility.workspace)

    assert result.name == "bug"
    mock_tag_repo.create.assert_called_once()


@pytest.mark.asyncio
async def test_create_tag_assigns_default_color(tag_service, mock_tag_repo):
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    tag = _make_tag(color="#7c6af7")
    mock_tag_repo.get_by_name = AsyncMock(return_value=None)
    mock_tag_repo.create = AsyncMock(return_value=tag)

    await tag_service.create_tag(project_id=project_id, owner_id=user_id, name="feature", color=None, visibility=TagVisibility.workspace)

    _, kwargs = mock_tag_repo.create.call_args
    assert kwargs["color"] in [
        "#7c6af7", "#ef4444", "#f97316", "#eab308",
        "#22c55e", "#06b6d4", "#3b82f6", "#a855f7",
    ]


@pytest.mark.asyncio
async def test_create_tag_duplicate_name_raises(tag_service, mock_tag_repo):
    from app.core.errors import AppError
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    existing = _make_tag(project_id=project_id, name="bug")
    mock_tag_repo.get_by_name = AsyncMock(return_value=existing)

    with pytest.raises(AppError) as exc:
        await tag_service.create_tag(project_id=project_id, owner_id=user_id, name="Bug", color=None, visibility=TagVisibility.workspace)

    assert exc.value.code == "DUPLICATE_TAG"


# --- update ---

@pytest.mark.asyncio
async def test_update_tag_owner_succeeds(tag_service, mock_tag_repo):
    user_id = uuid.uuid4()
    project_id = uuid.uuid4()
    tag = _make_tag(project_id=project_id, owner_id=user_id)
    mock_tag_repo.get_by_name = AsyncMock(return_value=None)
    updated = _make_tag(project_id=project_id, owner_id=user_id, name="renamed")
    mock_tag_repo.update = AsyncMock(return_value=updated)

    result = await tag_service.update_tag(tag=tag, requester_id=user_id, is_admin=False, name="renamed", color=None, visibility=None)

    assert result.name == "renamed"


@pytest.mark.asyncio
async def test_update_tag_non_owner_admin_succeeds(tag_service, mock_tag_repo):
    owner_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    project_id = uuid.uuid4()
    tag = _make_tag(project_id=project_id, owner_id=owner_id)
    mock_tag_repo.get_by_name = AsyncMock(return_value=None)
    updated = _make_tag(project_id=project_id, owner_id=owner_id, color="#22c55e")
    mock_tag_repo.update = AsyncMock(return_value=updated)

    result = await tag_service.update_tag(tag=tag, requester_id=admin_id, is_admin=True, name=None, color="#22c55e", visibility=None)

    assert result.color == "#22c55e"


@pytest.mark.asyncio
async def test_update_tag_non_owner_non_admin_raises(tag_service, mock_tag_repo):
    from app.core.errors import AppError
    owner_id = uuid.uuid4()
    other_id = uuid.uuid4()
    project_id = uuid.uuid4()
    tag = _make_tag(project_id=project_id, owner_id=owner_id)

    with pytest.raises(AppError) as exc:
        await tag_service.update_tag(tag=tag, requester_id=other_id, is_admin=False, name="x", color=None, visibility=None)

    assert exc.value.status_code == 403


# --- delete ---

@pytest.mark.asyncio
async def test_delete_tag_owner_succeeds(tag_service, mock_tag_repo):
    user_id = uuid.uuid4()
    tag = _make_tag(owner_id=user_id)
    mock_tag_repo.delete = AsyncMock()

    await tag_service.delete_tag(tag=tag, requester_id=user_id, is_admin=False)

    mock_tag_repo.delete.assert_called_once_with(tag)


@pytest.mark.asyncio
async def test_delete_tag_admin_override(tag_service, mock_tag_repo):
    owner_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    tag = _make_tag(owner_id=owner_id)
    mock_tag_repo.delete = AsyncMock()

    await tag_service.delete_tag(tag=tag, requester_id=admin_id, is_admin=True)

    mock_tag_repo.delete.assert_called_once_with(tag)


@pytest.mark.asyncio
async def test_delete_tag_non_owner_raises(tag_service, mock_tag_repo):
    from app.core.errors import AppError
    owner_id = uuid.uuid4()
    other_id = uuid.uuid4()
    tag = _make_tag(owner_id=owner_id)

    with pytest.raises(AppError) as exc:
        await tag_service.delete_tag(tag=tag, requester_id=other_id, is_admin=False)

    assert exc.value.status_code == 403


# --- visibility filter ---

@pytest.mark.asyncio
async def test_list_tags_returns_project_and_own_private(tag_service, mock_tag_repo):
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    ws_tag = _make_tag(project_id=project_id, visibility=TagVisibility.workspace)
    private_tag = _make_tag(project_id=project_id, owner_id=user_id, visibility=TagVisibility.private)
    mock_tag_repo.get_visible = AsyncMock(return_value=[ws_tag, private_tag])

    result = await tag_service.list_tags(project_id=project_id, user_id=user_id)

    assert len(result) == 2
    mock_tag_repo.get_visible.assert_called_once_with(project_id, user_id)
