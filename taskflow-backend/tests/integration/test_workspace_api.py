import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_current_user
from app.models.user import User


@pytest.mark.asyncio
async def test_create_workspace_api_endpoint(db_session):
    """Verifies the HTTP POST endpoint processes payloads and returns strict schema definitions."""
    
    # 1. Generate a completely unique user for this specific test run
    unique_suffix = uuid.uuid4().hex[:6]
    test_user_id = uuid.uuid4()
    
    local_fake_user = User(
        id=test_user_id,
        email=f"tester_{unique_suffix}@taskflow.io",
        hashed_password="mock-secret-argon-hash-string",
        is_superuser=True,  # HW-37: project creation is superuser-only
    )
    
    # 2. Seed the database safely
    db_session.add(local_fake_user)
    await db_session.commit()
    
    # 3. Create a dynamic override function that yields our newly generated user
    async def mock_get_current_user():
        return local_fake_user
        
    app.dependency_overrides[get_current_user] = mock_get_current_user
    
    # 4. Fire the request
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/projects",
            json={"name": "SaaS Platform Launch"}
        )
        
        # 5. Assertions
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "SaaS Platform Launch"
        assert "id" in data
        assert data["owner_id"] == str(test_user_id)

    # 6. Clean up the application overrides tracking map
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_create_workspace_requires_superuser(db_session):
    """HW-37 (REQ-169-3): a regular authenticated user cannot create projects."""
    regular_user = User(
        id=uuid.uuid4(),
        email=f"regular_{uuid.uuid4().hex[:6]}@taskflow.io",
        hashed_password="mock-secret-argon-hash-string",
    )
    db_session.add(regular_user)
    await db_session.commit()

    async def mock_get_current_user():
        return regular_user

    app.dependency_overrides[get_current_user] = mock_get_current_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/api/v1/projects", json={"name": "Should Not Exist"})

    app.dependency_overrides.clear()
    assert response.status_code == 403
    # app/main.py wraps HTTPException as {"error": {code, message, detail}}
    assert "Superuser" in response.json()["error"]["message"]
