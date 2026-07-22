import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.services.saved_search import SavedSearchService
from app.schemas.saved_search import SavedSearchCreate, SavedSearchUpdate


@pytest.fixture
def mock_repo():
    repo = MagicMock()
    repo.get = AsyncMock()
    repo.list_for_user = AsyncMock()
    repo.create = AsyncMock()
    repo.update = AsyncMock()
    repo.delete = AsyncMock()
    return repo


@pytest.fixture
def service(mock_repo):
    return SavedSearchService(repo=mock_repo)


def make_saved_search(**kwargs):
    from app.models.saved_search import SavedSearch
    defaults = {
        "id": uuid.uuid4(),
        "project_id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "name": "My Search",
        "filters": [],
    }
    defaults.update(kwargs)
    s = MagicMock(spec=SavedSearch)
    for k, v in defaults.items():
        setattr(s, k, v)
    return s


# ── list ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_returns_repo_results(service, mock_repo):
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    expected = [make_saved_search(project_id=project_id, user_id=user_id)]
    mock_repo.list_for_user.return_value = expected

    result = await service.list(project_id, user_id)

    mock_repo.list_for_user.assert_called_once_with(project_id, user_id)
    assert result == expected


@pytest.mark.asyncio
async def test_list_returns_empty_when_none(service, mock_repo):
    mock_repo.list_for_user.return_value = []
    result = await service.list(uuid.uuid4(), uuid.uuid4())
    assert result == []


# ── create ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_calls_repo_with_correct_data(service, mock_repo):
    project_id = uuid.uuid4()
    user_id = uuid.uuid4()
    payload = SavedSearchCreate(name="Sprint bugs", filters=[{"fieldId": "type", "value": "bug"}])
    created = make_saved_search(project_id=project_id, user_id=user_id, name="Sprint bugs")
    mock_repo.create.return_value = created

    result = await service.create(project_id, user_id, payload)

    mock_repo.create.assert_called_once()
    call_kwargs = mock_repo.create.call_args[1] if mock_repo.create.call_args[1] else mock_repo.create.call_args[0][0]
    assert result == created


@pytest.mark.asyncio
async def test_create_returns_created_object(service, mock_repo):
    created = make_saved_search(name="My Search")
    mock_repo.create.return_value = created
    payload = SavedSearchCreate(name="My Search", filters=[])

    result = await service.create(uuid.uuid4(), uuid.uuid4(), payload)

    assert result == created


# ── update ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_raises_404_when_not_found(service, mock_repo):
    from app.core.errors import AppError
    mock_repo.get.return_value = None
    payload = SavedSearchUpdate(name="Renamed")

    with pytest.raises(AppError) as exc_info:
        await service.update(uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), payload)

    assert exc_info.value.status_code == 404  # AppError subclasses HTTPException


@pytest.mark.asyncio
async def test_update_raises_403_when_not_owner(service, mock_repo):
    from app.core.errors import AppError
    saved = make_saved_search(user_id=uuid.uuid4())
    mock_repo.get.return_value = saved
    payload = SavedSearchUpdate(name="Renamed")

    with pytest.raises(AppError) as exc_info:
        await service.update(uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), payload)

    assert exc_info.value.status_code == 403  # AppError subclasses HTTPException


@pytest.mark.asyncio
async def test_update_calls_repo_when_owner(service, mock_repo):
    user_id = uuid.uuid4()
    saved = make_saved_search(user_id=user_id)
    mock_repo.get.return_value = saved
    updated = make_saved_search(user_id=user_id, name="Renamed")
    mock_repo.update.return_value = updated
    payload = SavedSearchUpdate(name="Renamed")

    result = await service.update(uuid.uuid4(), uuid.uuid4(), user_id, payload)

    mock_repo.update.assert_called_once()
    assert result == updated


# ── delete ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_raises_404_when_not_found(service, mock_repo):
    from app.core.errors import AppError
    mock_repo.get.return_value = None

    with pytest.raises(AppError) as exc_info:
        await service.delete(uuid.uuid4(), uuid.uuid4(), uuid.uuid4())

    assert exc_info.value.status_code == 404  # AppError subclasses HTTPException


@pytest.mark.asyncio
async def test_delete_raises_403_when_not_owner(service, mock_repo):
    from app.core.errors import AppError
    saved = make_saved_search(user_id=uuid.uuid4())
    mock_repo.get.return_value = saved

    with pytest.raises(AppError) as exc_info:
        await service.delete(uuid.uuid4(), uuid.uuid4(), uuid.uuid4())

    assert exc_info.value.status_code == 403  # AppError subclasses HTTPException


@pytest.mark.asyncio
async def test_delete_calls_repo_when_owner(service, mock_repo):
    user_id = uuid.uuid4()
    search_id = uuid.uuid4()
    saved = make_saved_search(id=search_id, user_id=user_id)
    mock_repo.get.return_value = saved

    await service.delete(uuid.uuid4(), search_id, user_id)

    mock_repo.delete.assert_called_once_with(search_id)
