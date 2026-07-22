"""Pure VCS-integration core: provider parsers → CanonicalEvent → outcome mapper,
ref extraction, smart-commands, signature verification. All DB-free and unit-tested.
IO (OAuth token minting, persistence, transitions) lives in the service layer.
"""
from app.services.vcs.canonical import CanonicalEvent, EventOutcome, DEFAULT_MAPPING, map_event
from app.services.vcs.commands import parse_smart_commands
from app.services.vcs.refs import extract_refs
from app.services.vcs.providers.github import parse_github

__all__ = [
    "CanonicalEvent",
    "EventOutcome",
    "DEFAULT_MAPPING",
    "map_event",
    "parse_smart_commands",
    "extract_refs",
    "parse_github",
]
