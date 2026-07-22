from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = {}

    def add(self, workspace_id: str, ws: WebSocket) -> None:
        self._rooms.setdefault(workspace_id, set()).add(ws)

    def remove(self, workspace_id: str, ws: WebSocket) -> None:
        if workspace_id in self._rooms:
            self._rooms[workspace_id].discard(ws)

    async def broadcast(self, workspace_id: str, message: dict) -> None:
        conns = self._rooms.get(workspace_id, set()).copy()
        dead: set[WebSocket] = set()
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._rooms[workspace_id].discard(ws)

    def connection_count(self, workspace_id: str) -> int:
        return len(self._rooms.get(workspace_id, set()))


manager = ConnectionManager()
