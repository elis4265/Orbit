"""Unit tests for the event→outcome mapper (pure)."""
from app.services.vcs.canonical import CanonicalEvent, map_event


def _ev(kind, action, **kw):
    base = dict(provider="github", external_id="1", number=None, title="", url="", state="open")
    base.update(kw)
    return CanonicalEvent(kind=kind, action=action, **base)


def test_branch_created_to_in_progress():
    assert map_event(_ev("branch", "created")).to_category == "in_progress"


def test_pr_opened_to_in_progress():
    assert map_event(_ev("pr", "opened")).to_category == "in_progress"


def test_pr_merged_to_done():
    assert map_event(_ev("pr", "merged")).to_category == "done"


def test_pr_closed_unmerged_no_transition_by_default():
    assert map_event(_ev("pr", "closed")).to_category is None


def test_pr_reopened_to_in_progress():
    assert map_event(_ev("pr", "reopened")).to_category == "in_progress"


def test_custom_mapping_overrides_default():
    out = map_event(_ev("pr", "merged"), mapping={"pr_merged": "in_progress"})
    assert out.to_category == "in_progress"


def test_custom_mapping_can_disable_transition():
    out = map_event(_ev("pr", "opened"), mapping={"pr_opened": None})
    assert out.to_category is None


def test_commit_comment_smart_command():
    out = map_event(_ev("commit", "pushed", commit_message="ORB-1 #comment hi there"))
    assert out.comment == "hi there"
    assert out.close is False
    assert out.to_category is None


def test_commit_close_is_a_command_not_a_lifecycle_transition():
    # #close is a developer command (applied in all modes), not a lifecycle to_category
    out = map_event(_ev("commit", "pushed", commit_message="ORB-1 #close"))
    assert out.close is True
    assert out.to_category is None


def test_commit_set_status_command():
    out = map_event(_ev("commit", "pushed", commit_message="ORB-1 #{In Review}"))
    assert out.set_status == "In Review"
    assert out.to_category is None


def test_commit_without_commands_is_noop_outcome():
    out = map_event(_ev("commit", "pushed", commit_message="just a commit ORB-1"))
    assert (out.to_category, out.comment, out.close, out.set_status) == (None, None, False, None)
