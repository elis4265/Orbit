"""Inbound VCS webhook engine — verify, dedupe, parse, link, transition.

Pure decisioning lives in app/services/vcs/ (parsers, mapper, signatures). This
layer does the IO: signature check, idempotency, ref→task resolution, dev-link
upsert, mode-aware status transitions (Enforced respects the transition engine),
smart-command comments, and email→user attribution with a "Git" system fallback.

Works entirely off the webhook payload — no outbound API call, so it needs no
OAuth token. See docs/git-integration-requirements.md.
"""
import hashlib
import json
import uuid

from sqlalchemy import select

from app.models.comment import Comment
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.models.vcs import TaskDevLink, VcsConnection, VcsEvent
from app.services.automation_service import AutomationService
from app.services.status_apply import apply_transition
from app.services.vcs import extract_refs, map_event
from app.services.vcs.providers.github import parse_github
from app.services.vcs.providers.gitlab import parse_gitlab
from app.services.vcs.providers.bitbucket import parse_bitbucket
from app.services.vcs.signatures import verify_github, verify_gitlab, verify_bitbucket

_PARSERS = {"github": parse_github, "gitlab": parse_gitlab, "bitbucket": parse_bitbucket}

# canonical (kind, action) → automation trigger name (Enforced/Jira rules)
_VCS_TRIGGER = {
    ("pr", "opened"): "pr_opened", ("pr", "reopened"): "pr_opened",
    ("pr", "merged"): "pr_merged", ("pr", "closed"): "pr_closed",
    ("branch", "created"): "branch_created", ("commit", "pushed"): "commit_pushed",
}


class VcsWebhookService:
    def __init__(self, session):
        self.session = session

    # ── public entrypoint ────────────────────────────────────────────────────
    async def process(self, provider: str, connection_id: uuid.UUID,
                      raw_body: bytes, headers: dict) -> dict:
        """headers: dict with lowercased keys. Returns a summary dict."""
        connection = await self.session.get(VcsConnection, connection_id)
        if connection is None or connection.provider != provider:
            return {"status": "not_found"}

        if not self._verify(provider, connection.webhook_secret, raw_body, headers):
            return {"status": "invalid_signature"}

        event_type, delivery_id = self._meta(provider, headers, raw_body)

        # idempotency — duplicate delivery is a no-op
        existing = (await self.session.execute(
            select(VcsEvent).where(
                VcsEvent.connection_id == connection_id,
                VcsEvent.delivery_id == delivery_id,
            )
        )).scalars().first()
        if existing is not None:
            return {"status": "duplicate"}

        record = VcsEvent(connection_id=connection_id, provider=provider,
                          delivery_id=delivery_id, event_type=event_type, processed=False)
        self.session.add(record)

        try:
            payload = json.loads(raw_body.decode() or "{}")
        except (ValueError, UnicodeDecodeError):
            payload = {}

        parser = _PARSERS.get(provider)
        events = parser(event_type, payload) if parser else []

        project = await self.session.get(Project, connection.project_id)
        summary = {"status": "ok", "linked": 0, "transitions": 0, "comments": 0, "blocked": 0, "rules": 0}

        if project is not None:
            for event in events:
                await self._handle_event(connection, project, event, summary)

        record.processed = True
        record.note = json.dumps(summary)
        await self.session.commit()
        return summary

    # ── per-event ────────────────────────────────────────────────────────────
    async def _handle_event(self, connection, project, event, summary) -> None:
        key = (project.key or "").upper()
        nums = [num for k, num in extract_refs(*event.ref_texts) if k == key]
        if not nums:
            return

        actor_id, _ = await self._resolve_actor(event.author_email)
        outcome = map_event(event, connection.settings or {})

        for num in nums:
            task = (await self.session.execute(
                select(Task).where(Task.project_id == project.id, Task.sequence_number == num)
            )).scalars().first()
            if task is None:
                continue

            if await self._upsert_dev_link(connection.id, task.id, event):
                summary["linked"] += 1

            if outcome.comment:
                self.session.add(Comment(task_id=task.id, author_id=actor_id, content=outcome.comment))
                summary["comments"] += 1

            # Lifecycle transition (PR/branch): auto in Flow (Linear) + Guided (YouTrack);
            # Enforced (Jira) defers to the rules engine — no blind auto-transition.
            if outcome.to_category and project.mode != "enforced":
                self._tally(await self._transition(task, project, category=outcome.to_category, event=event), summary)

            # Developer commit-commands: honoured in every mode, transition still validated.
            if outcome.close:
                self._tally(await self._transition(task, project, category="done", event=event), summary)
            if outcome.set_status:
                self._tally(await self._transition(task, project, name=outcome.set_status, event=event), summary)

            # Enforced (Jira): VCS events run the automation rules engine. A rule like
            # "pr_merged + no_open_prs → set_status done" owns transitions; nothing auto.
            trigger = _VCS_TRIGGER.get((event.kind, event.action))
            if project.mode == "enforced" and trigger:
                context = {"open_prs": await self._open_pr_count(task.id)}
                summary["rules"] += await AutomationService(self.session).run(
                    project.id, trigger, task, actor_id, context,
                )

    @staticmethod
    def _tally(result, summary) -> None:
        if result == "changed":
            summary["transitions"] += 1
        elif result == "blocked":
            summary["blocked"] += 1

    # ── helpers ──────────────────────────────────────────────────────────────
    async def _upsert_dev_link(self, connection_id, task_id, event) -> bool:
        existing = (await self.session.execute(
            select(TaskDevLink).where(
                TaskDevLink.task_id == task_id,
                TaskDevLink.kind == event.kind,
                TaskDevLink.external_id == event.external_id,
            )
        )).scalars().first()
        if existing is not None:
            existing.state = event.state
            existing.title = event.title
            existing.url = event.url
            return False
        self.session.add(TaskDevLink(
            task_id=task_id, connection_id=connection_id, kind=event.kind,
            external_id=event.external_id, number=event.number, title=event.title,
            url=event.url, state=event.state, author_login=event.author_login,
        ))
        return True

    async def _transition(self, task, project, *, category=None, name=None, event=None) -> str:
        return await apply_transition(self.session, task, project, category=category, name=name)

    async def _open_pr_count(self, task_id) -> int:
        rows = (await self.session.execute(
            select(TaskDevLink).where(
                TaskDevLink.task_id == task_id,
                TaskDevLink.kind == "pr",
                TaskDevLink.state == "open",
            )
        )).scalars().all()
        return len(rows)

    async def _resolve_actor(self, email):
        if email:
            user = (await self.session.execute(
                select(User).where(User.email == email)
            )).scalars().first()
            if user is not None:
                return user.id, (user.username or user.email)
        return None, "Git"

    def _verify(self, provider, secret, body, headers) -> bool:
        if provider == "github":
            return verify_github(secret, body, headers.get("x-hub-signature-256"))
        if provider == "gitlab":
            return verify_gitlab(secret, headers.get("x-gitlab-token"))
        if provider == "bitbucket":
            return verify_bitbucket(secret, body, headers.get("x-hub-signature"))
        return False

    def _meta(self, provider, headers, body) -> tuple[str, str]:
        body_hash = hashlib.sha256(body).hexdigest()
        if provider == "github":
            return headers.get("x-github-event", ""), headers.get("x-github-delivery") or body_hash
        if provider == "gitlab":
            return headers.get("x-gitlab-event", ""), headers.get("x-gitlab-event-uuid") or body_hash
        if provider == "bitbucket":
            return headers.get("x-event-key", ""), headers.get("x-request-uuid") or body_hash
        return "", body_hash
