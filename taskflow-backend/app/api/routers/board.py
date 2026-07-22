import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.board import BoardCreate, BoardUpdate, BoardFilterUpdate, BoardResponse
from app.services.board import BoardService
from app.services.audit_log import AuditLogService
from app.api.dependencies import (
    get_board_service, get_admin_project, get_viewer_project,
    get_audit_log_service, get_current_user,
)
from app.models.user import User
from app.models.project import Project
from app.models.board import Board

router = APIRouter(prefix="/projects/{project_id}/boards", tags=["Boards"])


def _actor_name(user: User) -> str:
    return user.username or user.email


async def _get_board_or_404(board_id: uuid.UUID, project: Project, board_service: BoardService) -> Board:
    board = await board_service.board_repo.get(board_id)
    if not board or board.project_id != project.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found.")
    return board


@router.post("", response_model=BoardResponse, status_code=status.HTTP_201_CREATED)
async def create_board(
    project_id: uuid.UUID,
    payload: BoardCreate,
    board_service: BoardService = Depends(get_board_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
):
    board = await board_service.create_board(name=payload.name, project_id=project_id)
    await audit_svc.log_board_created(project_id, current_user.id, _actor_name(current_user), board.id, board.name)
    return board


@router.get("", response_model=List[BoardResponse])
async def list_boards(
    project_id: uuid.UUID,
    board_service: BoardService = Depends(get_board_service),
    project: Project = Depends(get_viewer_project),
):
    return await board_service.get_project_boards(project_id=project_id)


@router.patch("/{board_id}", response_model=BoardResponse)
async def rename_board(
    board_id: uuid.UUID,
    payload: BoardUpdate,
    board_service: BoardService = Depends(get_board_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
):
    board = await _get_board_or_404(board_id, project, board_service)
    old_name = board.name
    renamed = await board_service.rename_board(board, payload.name)
    await audit_svc.log_board_renamed(project.id, current_user.id, _actor_name(current_user), board.id, old_name, payload.name)
    return renamed


@router.patch("/{board_id}/filter", response_model=BoardResponse)
async def update_board_filter(
    board_id: uuid.UUID,
    payload: BoardFilterUpdate,
    board_service: BoardService = Depends(get_board_service),
    project: Project = Depends(get_admin_project),
):
    """Set (or clear, with null) the admin board-scope filter. Admin only."""
    board = await _get_board_or_404(board_id, project, board_service)
    return await board_service.set_filter_config(board, payload.filter_config)


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_board(
    board_id: uuid.UUID,
    board_service: BoardService = Depends(get_board_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
):
    board = await _get_board_or_404(board_id, project, board_service)
    await audit_svc.log_board_deleted(project.id, current_user.id, _actor_name(current_user), board.id, board.name)
    await board_service.delete_board(board)
