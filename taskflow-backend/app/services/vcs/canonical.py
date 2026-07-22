"""Canonical VCS event + the pure event→outcome mapper. DB-free.

Provider parsers normalize raw webhooks into CanonicalEvent(s). `map_event`
then decides *what should happen* (status category to move to, comment to post,
close) without touching the DB. The service layer resolves a category to an
actual status (per project mode), enforces transition rules, and persists.
"""
from dataclasses import dataclass

from app.services.vcs.commands import parse_smart_commands

# Status *categories* (not concrete statuses) the mapper targets. The service
# layer maps these to the real status per mode (Flow enum / Guided-Enforced row).
DEFAULT_MAPPING = {
    "branch_created": "in_progress",
    "pr_opened": "in_progress",
    "pr_reopened": "in_progress",
    "pr_merged": "done",
    "pr_closed": None,  # closed-unmerged → no transition by default
}


@dataclass(frozen=True)
class CanonicalEvent:
    provider: str          # github | gitlab | bitbucket
    kind: str              # branch | commit | pr
    action: str            # created | pushed | opened | reopened | merged | closed
    external_id: str
    number: int | None     # PR/MR number (None for branch/commit)
    title: str
    url: str
    state: str             # open | merged | closed
    branch: str | None = None
    author_email: str | None = None
    author_login: str | None = None
    body: str = ""
    commit_message: str = ""  # commit events only — source for smart-commands

    @property
    def ref_texts(self) -> tuple[str, ...]:
        """Texts to scan for task refs, in priority order (title→body→branch→commit)."""
        return tuple(t for t in (self.title, self.body, self.branch, self.commit_message) if t)


@dataclass
class EventOutcome:
    # Lifecycle transition (PR/branch) — auto modes (Flow/Guided) apply it; Enforced defers to rules.
    to_category: str | None = None
    # Developer commit-commands — honoured in ALL modes (transition still validated per mode).
    comment: str | None = None
    close: bool = False             # #close/#done → completed status
    set_status: str | None = None   # #{Status Name} → that named status


def map_event(event: CanonicalEvent, mapping: dict | None = None) -> EventOutcome:
    """Decide the intended outcome for one canonical event. Pure."""
    m = {**DEFAULT_MAPPING, **(mapping or {})}
    out = EventOutcome()

    if event.kind == "branch" and event.action == "created":
        out.to_category = m.get("branch_created")

    elif event.kind == "pr":
        out.to_category = {
            "opened": m.get("pr_opened"),
            "reopened": m.get("pr_reopened"),
            "merged": m.get("pr_merged"),
            "closed": m.get("pr_closed"),
        }.get(event.action)

    elif event.kind == "commit":
        cmds = parse_smart_commands(event.commit_message)
        out.comment = cmds["comment"]
        out.close = cmds["close"]
        out.set_status = cmds["set_status"]

    return out
