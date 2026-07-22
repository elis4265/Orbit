import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository
from app.repositories.task import TaskRepository
from app.models.task import TaskStatus
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.project import Project

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_cascade_delete_user_drops_workspace(db_session):
    """Verifies that dropping a user drops all related workspaces automatically."""
    user_repo = UserRepository(db_session)
    ws_repo = ProjectRepository(db_session)
    
    # 1. Create records
    user = await user_repo.create({"email": "owner@taskflow.io", "hashed_password": "hash"})
    ws = await ws_repo.create({"key": "ENG", "name": "Engineering Board", "owner_id": user.id})
    
    target_project_id = ws.id
    
    # 2. Nuke the parent record
    await db_session.delete(user)
    await db_session.commit()
    
    # 3. CRITICAL: Clear the session completely. 
    # This empties SQLAlchemy's internal identity map entirely, 
    # forcing it to issue a raw SELECT SQL query to PostgreSQL.
    db_session.expire_all()
    db_session.expunge_all() # Completely untethers the objects from memory
    
    # 4. Run a fresh standalone select statement to check reality
    result = await db_session.execute(
        select(Project).where(Project.id == target_project_id)
    )
    check_ws = result.scalars().first()
    
    assert check_ws is None

@pytest.mark.asyncio
async def test_optimistic_concurrency_control_collision(db_session):
    """Verifies that outdated version update attempts are safely rejected."""
    user_repo = UserRepository(db_session)
    ws_repo = ProjectRepository(db_session)
    task_repo = TaskRepository(db_session)
    
    user = await user_repo.create({"email": "dev@taskflow.io", "hashed_password": "1"})
    ws = await ws_repo.create({"key": "SPR", "name": "Sprint Board", "owner_id": user.id})
    board_repo = BoardRepository(db_session)
    board = await board_repo.create({"name": "Main", "project_id": ws.id})
    task = await task_repo.create({
        "title": "Fix Middleware Bug",
        "project_id": ws.id,
        "version": 1,
    })
    
    # CRITICAL: Isolate the task ID to keep it independent of session flushes
    target_task_id = task.id
    
    # Client A updates the task successfully, incrementing the version to 2
    success_a = await task_repo.update_with_occ(target_task_id, current_version=1, update_data={"status": TaskStatus.in_progress})
    assert success_a is True
    
    # Client B attempts an update using the stale version 1
    success_b = await task_repo.update_with_occ(target_task_id, current_version=1, update_data={"status": TaskStatus.done})
    assert success_b is False  # Safely rejected!

@pytest.mark.asyncio
async def test_board_creation_and_listing_lifecycle(db_session):
    """Verifies that authenticated users can cleanly manage boards inside an active workspace."""
    
    # 1. Arrange: Seed a fresh user and an associated parent workspace record
    unique_suffix = uuid.uuid4().hex[:6]
    test_user = User(
        id=uuid.uuid4(),
        email=f"board_master_{unique_suffix}@taskflow.io",
        hashed_password="mock-secret-argon-hash-string"
    )
    db_session.add(test_user)
    await db_session.commit()

    test_workspace = Project(
        id=uuid.uuid4(),
        key="ENG",
        name="Engineering Core Cluster",
        owner_id=test_user.id
    )
    db_session.add(test_workspace)
    await db_session.commit()

    # 2. Setup dependency override for security extraction
    async def mock_get_current_user():
        return test_user
        
    app.dependency_overrides[get_current_user] = mock_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        
        # 3. Act: Post a new board payload targeting the seeded workspace context
        create_response = await ac.post(
            "/api/v1/projects/{}/boards".format(test_workspace.id),
            json={"name": "Sprint 1: Architecture Blueprint"}
        )

        # Assert creation metrics
        assert create_response.status_code == 201
        board_data = create_response.json()
        assert board_data["name"] == "Sprint 1: Architecture Blueprint"
        assert board_data["project_id"] == str(test_workspace.id)
        assert "id" in board_data

        # 4. Act: Retrieve the list of boards for this workspace
        list_response = await ac.get(
            "/api/v1/projects/{}/boards".format(test_workspace.id)
        )
        
        # Assert retrieval metrics
        assert list_response.status_code == 200
        boards_list = list_response.json()
        assert len(boards_list) == 1
        assert boards_list[0]["name"] == "Sprint 1: Architecture Blueprint"

    # 5. Teardown: Clear application overrides cleanly
    app.dependency_overrides.clear()