"""Unit tests for custom-field value validation/coercion."""
import uuid
from unittest.mock import MagicMock

import pytest

from app.services.custom_fields import validate_custom_fields


def _field(field_type, required=False, options=None, name="F", fid=None):
    f = MagicMock()
    f.id = fid or uuid.uuid4()
    f.name = name
    f.field_type = field_type
    f.options = options
    f.required = required
    return f


def test_coerces_each_type():
    txt, num, dt, sel, chk = (
        _field("text"), _field("number"), _field("date"),
        _field("select", options=["a", "b"]), _field("checkbox"),
    )
    fields = [txt, num, dt, sel, chk]
    vals = {
        str(txt.id): "hello", str(num.id): "5", str(dt.id): "2026-01-02",
        str(sel.id): "a", str(chk.id): True,
    }
    out = validate_custom_fields(vals, fields, "guided")
    assert out[str(num.id)] == 5            # numeric string → int
    assert out[str(dt.id)] == "2026-01-02"
    assert out[str(sel.id)] == "a"
    assert out[str(chk.id)] is True


def test_invalid_number_raises():
    num = _field("number", name="Points")
    with pytest.raises(Exception) as e:
        validate_custom_fields({str(num.id): "abc"}, [num], "guided")
    assert e.value.status_code == 422


def test_invalid_date_raises():
    dt = _field("date")
    with pytest.raises(Exception) as e:
        validate_custom_fields({str(dt.id): "not-a-date"}, [dt], "guided")
    assert e.value.status_code == 422


def test_select_must_be_valid_option():
    sel = _field("select", options=["red", "green"])
    with pytest.raises(Exception) as e:
        validate_custom_fields({str(sel.id): "blue"}, [sel], "guided")
    assert e.value.status_code == 422


def test_unknown_field_id_dropped():
    txt = _field("text")
    out = validate_custom_fields({str(uuid.uuid4()): "x", str(txt.id): "ok"}, [txt], "guided")
    assert list(out.keys()) == [str(txt.id)]


def test_empty_value_unset():
    txt = _field("text")
    out = validate_custom_fields({str(txt.id): ""}, [txt], "guided")
    assert out == {}


def test_required_enforced_only_in_enforced_mode():
    req = _field("text", required=True, name="Component")
    # guided: missing required is fine
    assert validate_custom_fields({}, [req], "guided") == {}
    # enforced: missing required raises
    with pytest.raises(Exception) as e:
        validate_custom_fields({}, [req], "enforced")
    assert e.value.status_code == 422
    # enforced + provided: ok
    out = validate_custom_fields({str(req.id): "api"}, [req], "enforced")
    assert out[str(req.id)] == "api"
