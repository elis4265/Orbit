"""Pure Monte Carlo delivery forecasting for Flow method. No DB/IO → unit-testable.

Samples historical per-period throughput to estimate how many periods it takes to
finish `remaining` items, returning p50/p85/p95. The unit (week/cycle) is the
caller's choice — this only deals in counts.
"""
import random

_MAX_PERIODS = 5000  # safety cap so a low-throughput tail can't loop forever


def monte_carlo_periods(
    throughput_history: list[int],
    remaining: int,
    trials: int = 10000,
    seed: int | None = None,
) -> dict | None:
    """Returns {"p50","p85","p95"} periods-to-complete, or None if it can't be
    forecast (no history, or all-zero throughput). remaining<=0 → all zeros."""
    if remaining <= 0:
        return {"p50": 0, "p85": 0, "p95": 0}
    samples = list(throughput_history)
    if not samples or max(samples) <= 0:
        return None

    rng = random.Random(seed)
    results = []
    for _ in range(trials):
        done = periods = 0
        while done < remaining and periods < _MAX_PERIODS:
            done += rng.choice(samples)
            periods += 1
        results.append(periods)
    results.sort()
    n = len(results)

    def pct(p: float) -> int:
        return results[min(n - 1, int(n * p))]

    return {"p50": pct(0.50), "p85": pct(0.85), "p95": pct(0.95)}
