"""Extract Orbit task refs (KEY-123) from VCS text. Pure / DB-free.

Permissive by design: this finds *candidates* (e.g. "UTF-8" yields ("UTF", 8)).
The service layer resolves them against real project keys, which is the real
gate — an unknown key simply resolves to nothing.
"""
import re

# A project key is 1–6 alphanumerics starting with a letter (Project.key is
# String(6)). Followed by '-' and a positive integer. Word-boundary guarded so
# we don't match inside longer tokens like "abc-123def".
_REF_RE = re.compile(r"(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{0,5})-(\d+)(?![0-9A-Za-z])")


def extract_refs(*texts: str) -> list[tuple[str, int]]:
    """Return [(KEY_UPPER, number), ...] across all texts, first-seen order, deduped."""
    seen: set[tuple[str, int]] = set()
    out: list[tuple[str, int]] = []
    for text in texts:
        if not text:
            continue
        for m in _REF_RE.finditer(text):
            ref = (m.group(1).upper(), int(m.group(2)))
            if ref not in seen:
                seen.add(ref)
                out.append(ref)
    return out
