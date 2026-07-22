"""Pure validation/coercion of custom-field values against their definitions.

DB-free → unit-testable. `fields` are objects exposing .id, .name, .field_type,
.options, .required. Values map is keyed by str(field id).
"""
import datetime as _dt

from app.core.errors import AppError

FIELD_TYPES = {"text", "number", "date", "select", "checkbox"}


def _invalid(msg: str):
    return AppError(422, code="INVALID_PAYLOAD", message=msg)


def _coerce(field, value):
    """Validate + normalize one value; None/empty → None (unset)."""
    if value is None or value == "":
        return None
    ft = field.field_type
    if ft == "text":
        return str(value)
    if ft == "number":
        try:
            f = float(value)
        except (TypeError, ValueError):
            raise _invalid(f"'{field.name}' must be a number")
        return int(f) if f.is_integer() else f
    if ft == "date":
        try:
            _dt.date.fromisoformat(str(value))
        except ValueError:
            raise _invalid(f"'{field.name}' must be a date (YYYY-MM-DD)")
        return str(value)
    if ft == "checkbox":
        return bool(value)
    if ft == "select":
        if str(value) not in (field.options or []):
            raise _invalid(f"'{value}' is not a valid option for '{field.name}'")
        return str(value)
    raise _invalid(f"Unknown field type '{ft}'")


def validate_custom_fields(values: dict | None, fields: list, mode: str) -> dict:
    """Coerce/validate provided values; enforce required fields in Enforced mode.
    Unknown field ids are dropped. Returns the cleaned value map."""
    by_id = {str(f.id): f for f in fields}
    cleaned: dict = {}
    for fid, val in (values or {}).items():
        f = by_id.get(str(fid))
        if f is None:
            continue
        coerced = _coerce(f, val)
        if coerced is not None:
            cleaned[str(fid)] = coerced

    if mode == "enforced":
        for f in fields:
            if f.required and str(f.id) not in cleaned:
                raise _invalid(f"'{f.name}' is required")
    return cleaned
