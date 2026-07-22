import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.services.project import ProjectService, ProjectLimitReachedException
from app.services.project_key import generate_project_key
from app.models.project import Project


@pytest.fixture
def mock_project_repo():
    return MagicMock()


@pytest.fixture
def project_service(mock_project_repo):
    return ProjectService(project_repo=mock_project_repo)


def make_project(**kwargs):
    defaults = {
        "id": uuid.uuid4(),
        "name": "Test Project",
        "owner_id": uuid.uuid4(),
        "key": "TEST",
        "next_sequence": 1,
        "mode": "open",
    }
    defaults.update(kwargs)
    return Project(**defaults)


# ---------------------------------------------------------------------------
# generate_project_key — pure function (REQ-SEQ01)
# ---------------------------------------------------------------------------

def test_key_single_word():
    assert generate_project_key("Orbit") == "ORBI"


def test_key_single_word_short():
    assert generate_project_key("AI") == "AI"


def test_key_multi_word_initials():
    assert generate_project_key("SaaS Task Manager") == "STM"


def test_key_multi_word_capped_at_six():
    assert generate_project_key("Alpha Beta Gamma Delta Epsilon Zeta") == "ABGDEZ"


def test_key_strips_non_alpha():
    # numbers and special chars ignored
    assert generate_project_key("My 2nd Project!") == "MP"


def test_key_single_word_truncated_to_four():
    assert generate_project_key("Labyrinth") == "LABY"


def test_key_all_caps_input():
    assert generate_project_key("ORBIT") == "ORBI"


def test_key_minimum_one_char_name():
    assert generate_project_key("X") == "X"


# ---------------------------------------------------------------------------
# ProjectService.create_project — sets key and next_sequence (REQ-SEQ01)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_project_passes_key_to_repo(project_service, mock_project_repo):
    owner_id = uuid.uuid4()
    mock_project_repo.get_by_owner = AsyncMock(return_value=[])
    created = make_project(name="Orbit", key="ORBI", owner_id=owner_id)
    mock_project_repo.create = AsyncMock(return_value=created)

    result = await project_service.create_project("Orbit", owner_id)

    call_data = mock_project_repo.create.call_args[0][0]
    assert call_data["key"] == "ORBI"
    assert result.key == "ORBI"


@pytest.mark.asyncio
async def test_create_project_sets_next_sequence_to_one(project_service, mock_project_repo):
    owner_id = uuid.uuid4()
    mock_project_repo.get_by_owner = AsyncMock(return_value=[])
    created = make_project(name="Test", key="TEST", next_sequence=1, owner_id=owner_id)
    mock_project_repo.create = AsyncMock(return_value=created)

    await project_service.create_project("Test", owner_id)

    call_data = mock_project_repo.create.call_args[0][0]
    assert call_data["next_sequence"] == 1


@pytest.mark.asyncio
async def test_create_project_multi_word_key(project_service, mock_project_repo):
    owner_id = uuid.uuid4()
    mock_project_repo.get_by_owner = AsyncMock(return_value=[])
    created = make_project(name="SaaS Task Manager", key="STM", owner_id=owner_id)
    mock_project_repo.create = AsyncMock(return_value=created)

    await project_service.create_project("SaaS Task Manager", owner_id)

    call_data = mock_project_repo.create.call_args[0][0]
    assert call_data["key"] == "STM"


@pytest.mark.asyncio
async def test_create_project_limit_still_enforced(project_service, mock_project_repo):
    owner_id = uuid.uuid4()
    mock_project_repo.get_by_owner = AsyncMock(
        return_value=[make_project() for _ in range(5)]
    )

    with pytest.raises(ProjectLimitReachedException):
        await project_service.create_project("New", owner_id)

    mock_project_repo.create.assert_not_called()
