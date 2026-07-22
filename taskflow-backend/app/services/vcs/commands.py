"""Parse Jira/YouTrack-style smart-commands from a commit message. Pure / DB-free.

Scope: `#comment <text>`, `#close`/`#done`/`#resolve`, and YouTrack-style
`#{Status Name}` to move to a named status. `#time` is deferred.
"""
import re

# Standalone close tokens (not part of a longer #word).
_CLOSE_RE = re.compile(r"(?<!\S)#(?:close|done|resolve)(?!\w)", re.IGNORECASE)
# YouTrack `#{Status Name}` — move to a named status.
_STATUS_RE = re.compile(r"#\{([^}]+)\}")
_COMMENT_TOKEN = "#comment"


def parse_smart_commands(message: str) -> dict:
    """Return {"comment": str|None, "close": bool, "set_status": str|None}."""
    if not message:
        return {"comment": None, "close": False, "set_status": None}

    close = bool(_CLOSE_RE.search(message))

    status_match = _STATUS_RE.search(message)
    set_status = status_match.group(1).strip() if status_match else None
    set_status = set_status or None

    # `#comment <text>` consumes the rest of that line (first occurrence wins).
    comment = None
    for line in message.splitlines():
        idx = line.lower().find(_COMMENT_TOKEN)
        if idx != -1:
            comment = line[idx + len(_COMMENT_TOKEN):].strip() or None
            break

    return {"comment": comment, "close": close, "set_status": set_status}
