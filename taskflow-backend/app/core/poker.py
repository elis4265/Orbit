"""Ephemeral planning-poker state — in-memory only, per project room.

Votes stay hidden (only the voter list is exposed) until reveal. Nothing is
persisted; the resolved estimate is written via the normal task update. A room
key is the project_id string (same key the WS ConnectionManager uses).
"""


class PokerRoom:
    def __init__(self) -> None:
        # room -> task_id -> {"revealed": bool, "votes": {user_id: value}}
        self._sessions: dict[str, dict[str, dict]] = {}

    def _session(self, room: str, task_id: str) -> dict:
        return self._sessions.setdefault(room, {}).setdefault(
            task_id, {"revealed": False, "votes": {}}
        )

    def start(self, room: str, task_id: str) -> None:
        """(Re)start a clean session for a task."""
        self._sessions.setdefault(room, {})[task_id] = {"revealed": False, "votes": {}}

    def vote(self, room: str, task_id: str, user_id: str, value: int) -> None:
        s = self._session(room, task_id)
        if s["revealed"]:
            return  # locked after reveal until reset/start
        s["votes"][user_id] = value

    def reveal(self, room: str, task_id: str) -> dict:
        s = self._session(room, task_id)
        s["revealed"] = True
        return dict(s["votes"])

    def reset(self, room: str, task_id: str) -> None:
        self.start(room, task_id)

    def voters(self, room: str, task_id: str) -> list[str]:
        return list(self._session(room, task_id)["votes"].keys())


poker = PokerRoom()
