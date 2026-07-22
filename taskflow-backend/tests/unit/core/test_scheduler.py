"""Unit tests for core/scheduler.py — start/stop lifecycle."""
from unittest.mock import MagicMock, patch

import app.core.scheduler as sched_module


def test_start_scheduler_adds_jobs_and_starts():
    mock_sched = MagicMock()
    with patch.object(sched_module, 'scheduler', mock_sched):
        sched_module.start_scheduler()
    # Two jobs: due-date reminders + Flow cycle reconciliation.
    assert mock_sched.add_job.call_count == 4
    mock_sched.start.assert_called_once()


def test_start_scheduler_registers_expected_job_ids():
    mock_sched = MagicMock()
    with patch.object(sched_module, 'scheduler', mock_sched):
        sched_module.start_scheduler()
    job_ids = {c.kwargs.get("id") for c in mock_sched.add_job.call_args_list}
    assert job_ids == {"due_date_check", "cycle_reconciliation", "recurring_tasks", "auto_archive"}


def test_stop_scheduler_calls_shutdown():
    mock_sched = MagicMock()
    with patch.object(sched_module, 'scheduler', mock_sched):
        sched_module.stop_scheduler()
    mock_sched.shutdown.assert_called_once_with(wait=False)
