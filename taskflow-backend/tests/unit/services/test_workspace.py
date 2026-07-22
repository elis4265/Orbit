import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.services.project import ProjectService, ProjectLimitReachedException, MAX_PROJECTS_PER_USER
from app.models.project import Project

@pytest.fixture
def mock_project_repo():
    """Provides an isolated, mocked out ProjectRepository instance."""
    return MagicMock()

@pytest.fixture
def project_service(mock_project_repo):
    """Provides an instance of ProjectService injected with the mock repository."""
    return ProjectService(project_repo=mock_project_repo)


@pytest.mark.asyncio
async def test_create_workspace_success(project_service, mock_project_repo):
    """Verifies project creation completes cleanly when under the system limit."""
    user_id = uuid.uuid4()
    project_name = "Alpha Team Board"

    mock_project_repo.get_by_owner = AsyncMock(return_value=[])
    mock_project_repo.create = AsyncMock(return_value=Project(id=uuid.uuid4(), name=project_name, owner_id=user_id))

    new_p = await project_service.create_project(name=project_name, owner_id=user_id)

    assert new_p.name == project_name
    mock_project_repo.get_by_owner.assert_called_once_with(user_id)
    mock_project_repo.create.assert_called_once()


@pytest.mark.asyncio
async def test_create_workspace_raises_limit_exception(project_service, mock_project_repo):
    """Verifies that the service blocks creation when the user hits the maximum limit."""
    user_id = uuid.uuid4()

    fake_projects = [Project(id=uuid.uuid4(), name=f"P {i}", owner_id=user_id) for i in range(MAX_PROJECTS_PER_USER)]
    mock_project_repo.get_by_owner = AsyncMock(return_value=fake_projects)

    with pytest.raises(ProjectLimitReachedException) as exc_info:
        await project_service.create_project(name="Breaking-The-Limit", owner_id=user_id)

    assert f"maximum threshold of {MAX_PROJECTS_PER_USER}" in str(exc_info.value)
    mock_project_repo.create.assert_not_called()


@pytest.mark.asyncio
async def test_rename_workspace_calls_update(project_service, mock_project_repo):
    p = MagicMock(spec=Project)
    mock_project_repo.update = AsyncMock(return_value=p)
    await project_service.rename_project(p, "New Name")
    mock_project_repo.update.assert_called_once_with(p, {"name": "New Name"})


@pytest.mark.asyncio
async def test_delete_workspace_calls_delete(project_service, mock_project_repo):
    p = MagicMock(spec=Project)
    mock_project_repo.delete = AsyncMock()
    await project_service.delete_project(p)
    mock_project_repo.delete.assert_called_once_with(p)