import uuid
from typing import Sequence
from sqlalchemy import select
from app.models.board import Board
from app.repositories.base import BaseRepository


class BoardRepository(BaseRepository[Board]):
    def __init__(self, session):
        super().__init__(Board, session)

    async def get_by_project(self, project_id: uuid.UUID) -> Sequence[Board]:
        result = await self.session.execute(
            select(Board).where(Board.project_id == project_id)
        )
        return result.scalars().all()
