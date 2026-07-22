import asyncio
import uuid

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import decode_token
from app.core.redis import redis_client
from app.core.ws_manager import manager
from app.core.logging import get_logger
from app.database import async_session_local
from app.repositories.project import ProjectRepository
from app.repositories.project_member import ProjectMemberRepository
from app.services.token_blacklist import is_blacklisted

router = APIRouter(tags=["WebSocket"])
logger = get_logger("ws")

_AUTH_TIMEOUT = 10.0


async def _authenticate_ws(websocket: WebSocket, project_id: uuid.UUID) -> str | None:
    """Auth handshake. Returns user_id_str on success; closes 4001 and returns None on failure."""
    try:
        msg = await asyncio.wait_for(websocket.receive_json(), timeout=_AUTH_TIMEOUT)
    except Exception:
        await websocket.close(code=4001)
        return None

    if msg.get("type") != "auth":
        await websocket.close(code=4001)
        return None

    token: str = msg.get("token", "")
    try:
        payload = decode_token(token)
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        logger.warning("ws_auth_failed", reason="invalid_token", project_id=str(project_id))
        await websocket.close(code=4001)
        return None

    if payload.get("type") != "access":
        logger.warning("ws_auth_failed", reason="wrong_token_type", project_id=str(project_id))
        await websocket.close(code=4001)
        return None

    jti = payload.get("jti")
    if jti and await is_blacklisted(redis_client, jti):
        logger.warning("ws_auth_failed", reason="blacklisted", jti=jti)
        await websocket.close(code=4001)
        return None

    user_id_str: str = payload.get("sub", "")

    async with async_session_local() as session:
        project = await ProjectRepository(session).get(project_id)
        is_member = False
        if project and str(project.owner_id) != user_id_str:
            try:
                membership = await ProjectMemberRepository(session).get_membership(
                    project_id, uuid.UUID(user_id_str)
                )
            except ValueError:
                membership = None
            is_member = membership is not None

    # Owner OR any member may join — the room carries live updates + planning poker.
    if not project or (str(project.owner_id) != user_id_str and not is_member):
        logger.warning("ws_auth_failed", reason="access_denied", user_id=user_id_str, project_id=str(project_id))
        await websocket.close(code=4001)
        return None

    return user_id_str


async def _handle_poker(room: str, user_id: str, data: dict) -> None:
    """Planning-poker messages. Votes stay hidden (only voter list broadcast)
    until reveal. Resolving the estimate is a normal task update, not a message."""
    from app.core.poker import poker

    mtype = data.get("type")
    task_id = data.get("task_id")
    if not task_id:
        return
    if mtype == "poker.start":
        poker.start(room, task_id)
        await manager.broadcast(room, {"type": "poker.started", "task_id": task_id, "by": user_id})
    elif mtype == "poker.vote":
        poker.vote(room, task_id, user_id, data.get("value"))
        await manager.broadcast(room, {"type": "poker.voted", "task_id": task_id, "voters": poker.voters(room, task_id)})
    elif mtype == "poker.reveal":
        votes = poker.reveal(room, task_id)
        await manager.broadcast(room, {"type": "poker.revealed", "task_id": task_id, "votes": votes})
    elif mtype == "poker.reset":
        poker.reset(room, task_id)
        await manager.broadcast(room, {"type": "poker.reset", "task_id": task_id})


@router.websocket("/ws/projects/{project_id}")
async def ws_project(websocket: WebSocket, project_id: uuid.UUID) -> None:
    await websocket.accept()

    user_id_str = await _authenticate_ws(websocket, project_id)
    if user_id_str is None:
        return

    await websocket.send_json({"type": "auth_ok", "user_id": user_id_str})
    logger.info("ws_connected", user_id=user_id_str, project_id=str(project_id))

    room = str(project_id)
    manager.add(room, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            mtype = data.get("type")
            if mtype == "ping":
                await websocket.send_json({"type": "pong"})
            elif mtype and mtype.startswith("poker."):
                await _handle_poker(room, user_id_str, data)
    except (WebSocketDisconnect, Exception):
        manager.remove(room, websocket)
        logger.info("ws_disconnected", user_id=user_id_str, project_id=str(project_id))
