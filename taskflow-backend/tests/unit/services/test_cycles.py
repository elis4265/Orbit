"""Unit tests for Flow-mode cycle planning (pure date logic)."""
from dataclasses import dataclass
from datetime import date

from app.services.cycles import CycleWindow, generate_cycle_windows, reconcile

ANCHOR = date(2026, 1, 5)  # Monday


def test_current_plus_upcoming_no_cooldown():
    w = generate_cycle_windows(ANCHOR, duration_weeks=2, cooldown_days=0,
                               on_date=date(2026, 1, 10), upcoming_count=2)
    assert [x.index for x in w] == [0, 1, 2]
    assert w[0].start == date(2026, 1, 5) and w[0].end == date(2026, 1, 18)
    assert w[1].start == date(2026, 1, 19) and w[1].end == date(2026, 2, 1)
    assert w[2].start == date(2026, 2, 2)


def test_current_index_advances_with_date():
    w = generate_cycle_windows(ANCHOR, 2, 0, on_date=date(2026, 1, 25), upcoming_count=1)
    assert w[0].index == 1                      # second cycle is current
    assert w[0].start == date(2026, 1, 19)


def test_cooldown_gap_makes_next_cycle_current():
    # 2-week cycles, 3-day cooldown → stride 17. First cycle 1/5–1/18, gap 1/19–1/21.
    w = generate_cycle_windows(ANCHOR, 2, 3, on_date=date(2026, 1, 20), upcoming_count=1)
    assert w[0].index == 1                      # in cooldown → next cycle is current
    assert w[0].start == date(2026, 1, 22)


def test_before_anchor_starts_at_anchor():
    w = generate_cycle_windows(ANCHOR, 2, 0, on_date=date(2025, 12, 1), upcoming_count=2)
    assert w[0].index == 0 and w[0].start == ANCHOR


def test_window_name():
    w = generate_cycle_windows(ANCHOR, 1, 0, on_date=ANCHOR, upcoming_count=0)
    assert w[0].name == "Cycle 1"


def test_duration_validation():
    try:
        generate_cycle_windows(ANCHOR, 0, 0, ANCHOR, 1)
        assert False, "expected ValueError"
    except ValueError:
        pass


@dataclass
class _Row:
    start_date: date
    end_date: date
    status: str


def test_reconcile_creates_missing_and_closes_past():
    windows = generate_cycle_windows(ANCHOR, 2, 0, on_date=date(2026, 1, 25), upcoming_count=1)
    # one existing row matching the current window, plus a stale past active one
    existing = [
        _Row(start_date=windows[0].start, end_date=windows[0].end, status="active"),
        _Row(start_date=date(2026, 1, 5), end_date=date(2026, 1, 18), status="active"),
    ]
    to_create, to_close = reconcile(windows, existing, on_date=date(2026, 1, 25))
    # windows[1] is missing → created; windows[0] already exists → not created
    assert [w.start for w in to_create] == [windows[1].start]
    # the 1/5–1/18 row ended before 1/25 → closed
    assert len(to_close) == 1 and to_close[0].start_date == date(2026, 1, 5)
