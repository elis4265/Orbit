"""Unit tests for ephemeral planning-poker room state."""
from app.core.poker import PokerRoom

ROOM = "proj-1"
TASK = "task-1"


def test_votes_hidden_until_reveal():
    p = PokerRoom()
    p.start(ROOM, TASK)
    p.vote(ROOM, TASK, "alice", 5)
    p.vote(ROOM, TASK, "bob", 8)
    # only voter list is exposed pre-reveal
    assert set(p.voters(ROOM, TASK)) == {"alice", "bob"}


def test_reveal_returns_all_votes():
    p = PokerRoom()
    p.start(ROOM, TASK)
    p.vote(ROOM, TASK, "alice", 5)
    p.vote(ROOM, TASK, "bob", 8)
    assert p.reveal(ROOM, TASK) == {"alice": 5, "bob": 8}


def test_vote_locked_after_reveal():
    p = PokerRoom()
    p.start(ROOM, TASK)
    p.vote(ROOM, TASK, "alice", 5)
    p.reveal(ROOM, TASK)
    p.vote(ROOM, TASK, "alice", 13)          # ignored
    assert p.reveal(ROOM, TASK) == {"alice": 5}


def test_revote_overwrites_before_reveal():
    p = PokerRoom()
    p.start(ROOM, TASK)
    p.vote(ROOM, TASK, "alice", 5)
    p.vote(ROOM, TASK, "alice", 8)
    assert p.reveal(ROOM, TASK) == {"alice": 8}


def test_reset_clears_and_unlocks():
    p = PokerRoom()
    p.start(ROOM, TASK)
    p.vote(ROOM, TASK, "alice", 5)
    p.reveal(ROOM, TASK)
    p.reset(ROOM, TASK)
    assert p.voters(ROOM, TASK) == []
    p.vote(ROOM, TASK, "alice", 3)           # unlocked again
    assert p.reveal(ROOM, TASK) == {"alice": 3}


def test_rooms_and_tasks_isolated():
    p = PokerRoom()
    p.vote(ROOM, TASK, "alice", 5)
    p.vote(ROOM, "task-2", "alice", 8)
    p.vote("proj-2", TASK, "alice", 13)
    assert p.reveal(ROOM, TASK) == {"alice": 5}
    assert p.reveal(ROOM, "task-2") == {"alice": 8}
    assert p.reveal("proj-2", TASK) == {"alice": 13}
