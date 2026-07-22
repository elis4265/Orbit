"""REQ-148 — next-occurrence date math for recurring tasks."""
from datetime import date

from app.services.recurrence import next_occurrence


def test_daily_is_tomorrow():
    assert next_occurrence("daily", date(2026, 7, 2)) == date(2026, 7, 3)


def test_weekly_next_weekday():
    # 2026-07-02 is a Thursday (weekday 3); next Monday (0) is 2026-07-06
    assert next_occurrence("weekly", date(2026, 7, 2), weekday=0) == date(2026, 7, 6)


def test_weekly_same_day_goes_to_next_week():
    # Thursday asking for Thursday → strictly next week
    assert next_occurrence("weekly", date(2026, 7, 2), weekday=3) == date(2026, 7, 9)


def test_monthly_later_this_month():
    assert next_occurrence("monthly", date(2026, 7, 2), day_of_month=15) == date(2026, 7, 15)


def test_monthly_already_passed_rolls_to_next_month():
    assert next_occurrence("monthly", date(2026, 7, 20), day_of_month=15) == date(2026, 8, 15)


def test_monthly_clamps_to_month_end():
    # 31st in a 30-day month → 30th; February → 28th (2027 not a leap year)
    assert next_occurrence("monthly", date(2026, 9, 1), day_of_month=31) == date(2026, 9, 30)
    assert next_occurrence("monthly", date(2027, 2, 1), day_of_month=31) == date(2027, 2, 28)


def test_monthly_december_wraps_year():
    assert next_occurrence("monthly", date(2026, 12, 20), day_of_month=15) == date(2027, 1, 15)
