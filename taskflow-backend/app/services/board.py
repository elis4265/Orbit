import uuid
from typing import Sequence
from app.models.board import Board
from app.repositories.board import BoardRepository


class BoardService:
    def __init__(self, board_repo: BoardRepository):
        self.board_repo = board_repo

    async def get_project_boards(self, project_id: uuid.UUID) -> Sequence[Board]:
        return await self.board_repo.get_by_project(project_id)

    async def create_board(self, name: str, project_id: uuid.UUID) -> Board:
        return await self.board_repo.create({"name": name, "project_id": project_id})

    async def rename_board(self, board: Board, name: str) -> Board:
        return await self.board_repo.update(board, {"name": name})

    async def set_filter_config(self, board: Board, filter_config: dict | None) -> Board:
        return await self.board_repo.update(board, {"filter_config": filter_config})

    async def delete_board(self, board: Board) -> None:
        await self.board_repo.delete(board)
