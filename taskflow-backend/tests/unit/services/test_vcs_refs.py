"""Unit tests for VCS task-ref extraction (pure)."""
from app.services.vcs.refs import extract_refs


def test_extracts_single_ref():
    assert extract_refs("Fixes ORB-123 in the parser") == [("ORB", 123)]


def test_case_insensitive_key_normalized_upper():
    assert extract_refs("closes orb-7") == [("ORB", 7)]


def test_multiple_refs_first_seen_order_deduped():
    refs = extract_refs("ORB-1 and ORB-2", "again ORB-1", "ABC-9")
    assert refs == [("ORB", 1), ("ORB", 2), ("ABC", 9)]


def test_scans_across_all_texts_in_priority_order():
    # title, body, branch, commit — title's ref comes first
    refs = extract_refs("ORB-5 title", "body ORB-6", "feature/orb-7-slug", "ORB-8 commit")
    assert refs == [("ORB", 5), ("ORB", 6), ("ORB", 7), ("ORB", 8)]


def test_branch_name_ref():
    assert extract_refs("anon/orb-42-fix-the-thing") == [("ORB", 42)]


def test_ignores_empty_and_none():
    assert extract_refs("", None, "ORB-1") == [("ORB", 1)]


def test_no_match_returns_empty():
    assert extract_refs("nothing to see", "just words") == []


def test_does_not_match_inside_longer_token():
    # 'abc-123def' is not a clean ref
    assert extract_refs("abc-123def") == []


def test_key_max_six_chars():
    # 6-char key ok, 7-char rejected (Project.key is String(6))
    assert extract_refs("ABCDEF-1") == [("ABCDEF", 1)]
    assert extract_refs("ABCDEFG-1") == []


def test_permissive_false_positive_is_left_to_resolution():
    # "UTF-8" extracts as a candidate; resolution against real keys is the gate.
    assert extract_refs("encoded as UTF-8") == [("UTF", 8)]
