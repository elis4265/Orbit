"""Pure planning logic for Flow-mode automated cycles.

Kept free of DB/IO so the date math is unit-testable in isolation. The scheduler
(app/core/scheduler.py) reconciles these windows against `sprints` rows.
"""
from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class CycleWindow:
    index: int   # 0-based offset from the anchor
    start: date
    end: date    # inclusive last day of the cycle

    @property
    def name(self) -> str:
        return f"Cycle {self.index + 1}"


def generate_cycle_windows(
    start_anchor: date,
    duration_weeks: int,
    cooldown_days: int,
    on_date: date,
    upcoming_count: int,
) -> list[CycleWindow]:
    """Cycle currently covering `on_date`, plus `upcoming_count` future cycles.

    Cycles span `duration_weeks` and are separated by `cooldown_days`. If
    `on_date` is before the anchor, planning starts at the anchor. If `on_date`
    falls inside a cooldown gap, the "current" cycle is the next upcoming one.
    """
    if duration_weeks < 1:
        raise ValueError("duration_weeks must be >= 1")
    span = duration_weeks * 7
    stride = span + max(0, cooldown_days)

    if on_date < start_anchor:
        current_idx = 0
    else:
        days = (on_date - start_anchor).days
        current_idx = days // stride
        if days % stride >= span:  # inside a cooldown gap → next cycle is current
            current_idx += 1

    windows: list[CycleWindow] = []
    for i in range(current_idx, current_idx + upcoming_count + 1):
        start = start_anchor + timedelta(days=i * stride)
        end = start + timedelta(days=span - 1)
        windows.append(CycleWindow(index=i, start=start, end=end))
    return windows


def reconcile(windows, existing, on_date: date):
    """Diff desired `windows` against `existing` auto-cycle rows.

    Returns (to_create, to_close):
      - to_create: CycleWindow list whose start_date has no existing row
      - to_close:  existing rows that are not closed and whose end_date < on_date
    `existing` rows expose .start_date, .end_date, .status.
    """
    existing_starts = {e.start_date for e in existing}
    to_create = [w for w in windows if w.start not in existing_starts]
    to_close = [e for e in existing if e.status != "closed" and e.end_date < on_date]
    return to_create, to_close
