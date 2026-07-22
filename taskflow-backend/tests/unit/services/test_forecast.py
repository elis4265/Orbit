"""Unit tests for Monte Carlo delivery forecasting."""
from app.services.forecast import monte_carlo_periods


def test_uniform_throughput_is_exact():
    # 20 items at a steady 5/period → always 4 periods, regardless of randomness
    r = monte_carlo_periods([5, 5, 5], remaining=20, trials=500, seed=1)
    assert r == {"p50": 4, "p85": 4, "p95": 4}


def test_percentiles_monotonic_and_sane():
    r = monte_carlo_periods([2, 4, 6], remaining=40, trials=5000, seed=42)
    assert r is not None
    assert r["p50"] <= r["p85"] <= r["p95"]
    # avg throughput 4 → ~10 periods around the median
    assert 8 <= r["p50"] <= 12


def test_remaining_zero():
    assert monte_carlo_periods([3, 5], remaining=0) == {"p50": 0, "p85": 0, "p95": 0}


def test_all_zero_throughput_cannot_forecast():
    assert monte_carlo_periods([0, 0, 0], remaining=10) is None


def test_empty_history_cannot_forecast():
    assert monte_carlo_periods([], remaining=10) is None


def test_seed_is_deterministic():
    a = monte_carlo_periods([1, 3, 5, 7], remaining=30, trials=2000, seed=7)
    b = monte_carlo_periods([1, 3, 5, 7], remaining=30, trials=2000, seed=7)
    assert a == b
