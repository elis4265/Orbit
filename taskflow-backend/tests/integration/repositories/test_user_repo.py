import pytest
from app.repositories.user import UserRepository
from sqlalchemy.exc import IntegrityError

import pytest

pytestmark = pytest.mark.integration

@pytest.mark.asyncio
async def test_user_repository_create_and_get(db_session):
    repo = UserRepository(db_session)
    user = await repo.create({"email": "test@example.com", "hashed_password": "hash"})
    
    found = await repo.get_by_email("test@example.com")
    assert found.id == user.id

@pytest.mark.asyncio
async def test_unique_email_constraint(db_session):
    repo = UserRepository(db_session)
    await repo.create({"email": "dup@example.com", "hashed_password": "1"})
    
    with pytest.raises(IntegrityError):
        await repo.create({"email": "dup@example.com", "hashed_password": "2"})