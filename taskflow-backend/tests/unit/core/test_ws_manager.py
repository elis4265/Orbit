import pytest
from unittest.mock import AsyncMock, MagicMock

from app.core.ws_manager import ConnectionManager


def _mock_ws(fail: bool = False):
    ws = MagicMock()
    ws.send_json = AsyncMock(side_effect=Exception("dead") if fail else None)
    return ws


@pytest.mark.asyncio
async def test_add_connection_registers_websocket():
    m = ConnectionManager()
    ws = _mock_ws()
    m.add("room-1", ws)
    assert m.connection_count("room-1") == 1


@pytest.mark.asyncio
async def test_remove_connection_unregisters_websocket():
    m = ConnectionManager()
    ws = _mock_ws()
    m.add("room-1", ws)
    m.remove("room-1", ws)
    assert m.connection_count("room-1") == 0


@pytest.mark.asyncio
async def test_remove_nonexistent_is_safe():
    m = ConnectionManager()
    ws = _mock_ws()
    m.remove("no-such-room", ws)  # must not raise


@pytest.mark.asyncio
async def test_broadcast_reaches_all_connections():
    m = ConnectionManager()
    ws1 = _mock_ws()
    ws2 = _mock_ws()
    m.add("room-1", ws1)
    m.add("room-1", ws2)

    await m.broadcast("room-1", {"type": "task.created"})

    ws1.send_json.assert_called_once_with({"type": "task.created"})
    ws2.send_json.assert_called_once_with({"type": "task.created"})


@pytest.mark.asyncio
async def test_broadcast_only_targets_correct_room():
    m = ConnectionManager()
    ws_a = _mock_ws()
    ws_b = _mock_ws()
    m.add("room-A", ws_a)
    m.add("room-B", ws_b)

    await m.broadcast("room-A", {"type": "task.deleted"})

    ws_a.send_json.assert_called_once()
    ws_b.send_json.assert_not_called()


@pytest.mark.asyncio
async def test_broadcast_prunes_dead_connections():
    m = ConnectionManager()
    alive = _mock_ws()
    dead = _mock_ws(fail=True)
    m.add("room-1", alive)
    m.add("room-1", dead)

    await m.broadcast("room-1", {"type": "ping"})

    # Dead connection must be removed
    assert m.connection_count("room-1") == 1


@pytest.mark.asyncio
async def test_broadcast_empty_room_is_safe():
    m = ConnectionManager()
    await m.broadcast("no-clients", {"type": "task.updated"})  # must not raise


@pytest.mark.asyncio
async def test_connection_count_returns_zero_for_unknown_room():
    m = ConnectionManager()
    assert m.connection_count("ghost-room") == 0
