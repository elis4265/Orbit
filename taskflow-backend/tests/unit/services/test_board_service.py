import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.services.board import BoardService
from app.models.board import Board


def _make_board(project_id=None):
    b = MagicMock(spec=Board)
    b.id = uuid.uuid4()
    b.project_id = project_id or uuid.uuid4()
    b.name = "Test Board"
    return b


@pytest.fixture
def mock_repo():
    repo = AsyncMock()
    repo.get_by_project = AsyncMock(return_value=[])
    repo.create = AsyncMock(side_effect=lambda data: _make_board(data.get("project_id")))
    repo.update = AsyncMock(side_effect=lambda obj, data: obj)
    repo.delete = AsyncMock()
    return repo


@pytest.fixture
def service(mock_repo):
    return BoardService(mock_repo)


@pytest.mark.asyncio
async def test_create_board(service, mock_repo):
    project_id = uuid.uuid4()
    await service.create_board("Sprint 1", project_id)
    mock_repo.create.assert_called_once_with({"name": "Sprint 1", "project_id": project_id})


@pytest.mark.asyncio
async def test_get_project_boards(service, mock_repo):
    project_id = uuid.uuid4()
    boards = [_make_board(project_id), _make_board(project_id)]
    mock_repo.get_by_project = AsyncMock(return_value=boards)
    result = await service.get_project_boards(project_id)
    assert result == boards


@pytest.mark.asyncio
async def test_rename_board(service, mock_repo):
    board = _make_board()
    await service.rename_board(board, "New Name")
    mock_repo.update.assert_called_once_with(board, {"name": "New Name"})


@pytest.mark.asyncio
async def test_delete_board(service, mock_repo):
    board = _make_board()
    await service.delete_board(board)
    mock_repo.delete.assert_called_once_with(board)
