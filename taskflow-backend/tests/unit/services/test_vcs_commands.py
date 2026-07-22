"""Unit tests for smart-command parsing (pure)."""
from app.services.vcs.commands import parse_smart_commands


def test_empty_message():
    assert parse_smart_commands("") == {"comment": None, "close": False, "set_status": None}
    assert parse_smart_commands(None) == {"comment": None, "close": False, "set_status": None}


def test_set_status_command():
    assert parse_smart_commands("ORB-1 #{In Review}")["set_status"] == "In Review"
    assert parse_smart_commands("ORB-1 #{ Done }")["set_status"] == "Done"
    assert parse_smart_commands("ORB-1 no status")["set_status"] is None


def test_close_token():
    assert parse_smart_commands("ORB-1 #close")["close"] is True


def test_done_and_resolve_aliases():
    assert parse_smart_commands("ORB-1 #done")["close"] is True
    assert parse_smart_commands("ORB-1 #resolve")["close"] is True


def test_close_is_case_insensitive():
    assert parse_smart_commands("#CLOSE")["close"] is True


def test_close_not_matched_inside_word():
    assert parse_smart_commands("ORB-1 #closely related")["close"] is False


def test_comment_takes_rest_of_line():
    res = parse_smart_commands("ORB-1 #comment fixed the null deref")
    assert res["comment"] == "fixed the null deref"


def test_comment_stops_at_newline():
    msg = "ORB-1 #comment first line\nsecond line ignored"
    assert parse_smart_commands(msg)["comment"] == "first line"


def test_comment_and_close_together():
    res = parse_smart_commands("ORB-1 #comment done here #close")
    # #close lives on the same line → consumed into the comment text, but still detected
    assert res["close"] is True
    assert res["comment"] == "done here #close"


def test_empty_comment_is_none():
    assert parse_smart_commands("ORB-1 #comment   ")["comment"] is None


def test_no_commands():
    assert parse_smart_commands("just a normal commit ORB-1") == {"comment": None, "close": False, "set_status": None}
