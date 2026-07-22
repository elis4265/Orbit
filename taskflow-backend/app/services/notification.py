import re
import uuid
from typing import Optional

from app.core.logging import get_logger
from app.core.ws_manager import manager
from app.models.notification import NotificationType
from app.repositories.notification import NotificationRepository
from app.repositories.notification_preferences import NotificationPreferencesRepository
from app.repositories.task_watcher import TaskWatcherRepository
from app.repositories.user import UserRepository
from app.services.email import send_notification_email

logger = get_logger("notification")

_MENTION_RE = re.compile(r"@([\w-]+)")


def _extract_mentions(html: str) -> list[str]:
    """Return all @username tokens found in comment HTML."""
    return _MENTION_RE.findall(html)


class NotificationService:
    def __init__(
        self,
        notif_repo: NotificationRepository,
        prefs_repo: NotificationPreferencesRepository,
        watcher_repo: TaskWatcherRepository,
        user_repo: UserRepository,
    ):
        self.notif_repo = notif_repo
        self.prefs_repo = prefs_repo
        self.watcher_repo = watcher_repo
        self.user_repo = user_repo

    async def _send(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        notification_type: NotificationType,
        payload: dict,
        task_id: Optional[uuid.UUID],
        email_subject: str,
        email_body: str,
        email_enabled: bool,
        recipient_email: str,
    ) -> None:
        notif = await self.notif_repo.create(
            user_id=user_id,
            project_id=project_id,
            notification_type=notification_type,
            payload=payload,
            task_id=task_id,
        )
        logger.info(
            "notification_created",
            user_id=str(user_id),
            type=notification_type.value,
            task_id=str(task_id) if task_id else None,
        )
        await manager.broadcast(
            str(project_id),
            {"type": "notification.created", "payload": {"user_id": str(user_id)}},
        )
        if email_enabled:
            await send_notification_email(recipient_email, email_subject, email_body)

    async def _notify_watchers_and_assignee(
        self,
        task_id: uuid.UUID,
        project_id: uuid.UUID,
        notification_type: NotificationType,
        prefs_field: str,
        payload: dict,
        actor_id: uuid.UUID,
        assignee_id: Optional[uuid.UUID],
        email_subject: str,
        email_body_template: str,
    ) -> None:
        watcher_ids = await self.watcher_repo.get_watcher_ids(task_id)
        candidate_ids = list({*watcher_ids, *([ assignee_id] if assignee_id else [])})
        candidate_ids = [uid for uid in candidate_ids if uid != actor_id]

        if not candidate_ids:
            return

        prefs_map = await self.prefs_repo.get_for_users(candidate_ids, project_id)

        for uid in candidate_ids:
            prefs = prefs_map[uid]
            if not getattr(prefs, prefs_field, True):
                continue
            user = await self.user_repo.get(uid)
            if not user:
                continue
            await self._send(
                user_id=uid,
                project_id=project_id,
                notification_type=notification_type,
                payload=payload,
                task_id=task_id,
                email_subject=email_subject,
                email_body=email_body_template.format(username=user.username or user.email),
                email_enabled=prefs.email_enabled,
                recipient_email=user.email,
            )

        await self.notif_repo.session.commit()

    # ── Public trigger methods ────────────────────────────────────────────────

    async def on_comment_added(
        self,
        task_id: uuid.UUID,
        project_id: uuid.UUID,
        task_title: str,
        actor_id: uuid.UUID,
        actor_name: str,
        assignee_id: Optional[uuid.UUID],
        comment_html: str,
    ) -> None:
        logger.info("notify_comment_added", task_id=str(task_id), actor=actor_name)
        payload = {"task_title": task_title, "actor": actor_name, "event": "comment_added"}

        await self._notify_watchers_and_assignee(
            task_id=task_id,
            project_id=project_id,
            notification_type=NotificationType.comment_added,
            prefs_field="on_comment",
            payload=payload,
            actor_id=actor_id,
            assignee_id=assignee_id,
            email_subject=f"New comment on \"{task_title}\"",
            email_body_template=f"Hi {{username}}, {actor_name} commented on \"{task_title}\".",
        )

        # @mention notifications — independent of watch status
        mentioned_usernames = _extract_mentions(comment_html)
        if mentioned_usernames:
            await self._notify_mentions(
                task_id=task_id,
                project_id=project_id,
                task_title=task_title,
                actor_id=actor_id,
                actor_name=actor_name,
                usernames=mentioned_usernames,
            )

    async def _notify_mentions(
        self,
        task_id: uuid.UUID,
        project_id: uuid.UUID,
        task_title: str,
        actor_id: uuid.UUID,
        actor_name: str,
        usernames: list[str],
    ) -> None:
        for username in set(usernames):
            user = await self.user_repo.get_by_username(username)
            if not user or user.id == actor_id:
                continue
            prefs = await self.prefs_repo.get_or_default(user.id, project_id)
            if not prefs.on_mention:
                continue
            logger.info("notify_mention", username=username, task_id=str(task_id))
            await self._send(
                user_id=user.id,
                project_id=project_id,
                notification_type=NotificationType.mentioned,
                payload={"task_title": task_title, "actor": actor_name, "event": "mentioned"},
                task_id=task_id,
                email_subject=f"{actor_name} mentioned you in \"{task_title}\"",
                email_body=f"Hi {user.username or user.email}, {actor_name} mentioned you in \"{task_title}\".",
                email_enabled=prefs.email_enabled,
                recipient_email=user.email,
            )
        await self.notif_repo.session.commit()

    async def on_status_changed(
        self,
        task_id: uuid.UUID,
        project_id: uuid.UUID,
        task_title: str,
        actor_id: uuid.UUID,
        actor_name: str,
        assignee_id: Optional[uuid.UUID],
        new_status: str,
    ) -> None:
        logger.info("notify_status_changed", task_id=str(task_id), new_status=new_status)
        payload = {"task_title": task_title, "actor": actor_name, "new_status": new_status, "event": "status_changed"}
        await self._notify_watchers_and_assignee(
            task_id=task_id,
            project_id=project_id,
            notification_type=NotificationType.status_changed,
            prefs_field="on_status_change",
            payload=payload,
            actor_id=actor_id,
            assignee_id=assignee_id,
            email_subject=f"\"{task_title}\" moved to {new_status}",
            email_body_template=f"Hi {{username}}, {actor_name} changed status of \"{task_title}\" to {new_status}.",
        )

    async def _notify_new_assignee(
        self, task_id, project_id, task_title, actor_id, actor_name, new_assignee_id, payload,
    ) -> None:
        if not new_assignee_id or new_assignee_id == actor_id:
            return
        user = await self.user_repo.get(new_assignee_id)
        if not user:
            return
        prefs = await self.prefs_repo.get_or_default(new_assignee_id, project_id)
        await self._send(
            user_id=new_assignee_id,
            project_id=project_id,
            notification_type=NotificationType.assignee_changed,
            payload={**payload, "you_are_assignee": True},
            task_id=task_id,
            email_subject=f"You were assigned to \"{task_title}\"",
            email_body=f"Hi {user.username or user.email}, {actor_name} assigned \"{task_title}\" to you.",
            email_enabled=prefs.email_enabled,
            recipient_email=user.email,
        )

    async def _notify_watchers_assignee_change(
        self, task_id, project_id, task_title, actor_id, new_assignee_id, payload,
    ) -> None:
        watcher_ids = await self.watcher_repo.get_watcher_ids(task_id)
        exclude = {actor_id, *([new_assignee_id] if new_assignee_id else [])}
        candidate_ids = [uid for uid in watcher_ids if uid not in exclude]
        if not candidate_ids:
            return
        prefs_map = await self.prefs_repo.get_for_users(candidate_ids, project_id)
        for uid in candidate_ids:
            prefs = prefs_map[uid]
            if not prefs.on_assignee_change:
                continue
            user = await self.user_repo.get(uid)
            if not user:
                continue
            await self._send(
                user_id=uid,
                project_id=project_id,
                notification_type=NotificationType.assignee_changed,
                payload=payload,
                task_id=task_id,
                email_subject=f"Assignee changed on \"{task_title}\"",
                email_body=f"Hi {user.username or user.email}, {payload['actor']} changed the assignee of \"{task_title}\".",
                email_enabled=prefs.email_enabled,
                recipient_email=user.email,
            )

    async def on_assignee_changed(
        self,
        task_id: uuid.UUID,
        project_id: uuid.UUID,
        task_title: str,
        actor_id: uuid.UUID,
        actor_name: str,
        new_assignee_id: Optional[uuid.UUID],
        old_assignee_id: Optional[uuid.UUID],
    ) -> None:
        logger.info("notify_assignee_changed", task_id=str(task_id), new_assignee=str(new_assignee_id))
        payload = {"task_title": task_title, "actor": actor_name, "event": "assignee_changed"}
        await self._notify_new_assignee(task_id, project_id, task_title, actor_id, actor_name, new_assignee_id, payload)
        await self._notify_watchers_assignee_change(task_id, project_id, task_title, actor_id, new_assignee_id, payload)
        await self.notif_repo.session.commit()

    async def on_priority_changed(
        self,
        task_id: uuid.UUID,
        project_id: uuid.UUID,
        task_title: str,
        actor_id: uuid.UUID,
        actor_name: str,
        assignee_id: Optional[uuid.UUID],
        new_priority,
    ) -> None:
        logger.info("notify_priority_changed", task_id=str(task_id), new_priority=str(new_priority))
        payload = {"task_title": task_title, "actor": actor_name, "new_priority": str(new_priority), "event": "priority_changed"}
        await self._notify_watchers_and_assignee(
            task_id=task_id,
            project_id=project_id,
            notification_type=NotificationType.priority_changed,
            prefs_field="on_priority_change",
            payload=payload,
            actor_id=actor_id,
            assignee_id=assignee_id,
            email_subject=f"Priority changed on \"{task_title}\"",
            email_body_template=f"Hi {{username}}, {actor_name} changed priority of \"{task_title}\" to P{new_priority}.",
        )

    async def on_task_deleted(
        self,
        task_id: uuid.UUID,
        project_id: uuid.UUID,
        task_title: str,
        actor_id: uuid.UUID,
        actor_name: str,
        assignee_id: Optional[uuid.UUID],
        watcher_ids: list[uuid.UUID],
    ) -> None:
        logger.info("notify_task_deleted", task_id=str(task_id))
        payload = {"task_title": task_title, "actor": actor_name, "event": "task_deleted"}
        candidate_ids = list({*watcher_ids, *([ assignee_id] if assignee_id else [])})
        if not candidate_ids:
            return

        prefs_map = await self.prefs_repo.get_for_users(candidate_ids, project_id)
        for uid in candidate_ids:
            prefs = prefs_map[uid]
            if not prefs.on_task_deleted:
                continue
            user = await self.user_repo.get(uid)
            if not user:
                continue
            # task_id set to None because the task no longer exists
            await self._send(
                user_id=uid,
                project_id=project_id,
                notification_type=NotificationType.task_deleted,
                payload=payload,
                task_id=None,
                email_subject=f"Task \"{task_title}\" was deleted",
                email_body=f"Hi {user.username or user.email}, {actor_name} deleted task \"{task_title}\".",
                email_enabled=prefs.email_enabled,
                recipient_email=user.email,
            )
        await self.notif_repo.session.commit()

    async def on_due_date_approaching(
        self,
        task_id: uuid.UUID,
        project_id: uuid.UUID,
        task_title: str,
        assignee_id: Optional[uuid.UUID],
        watcher_ids: list[uuid.UUID],
    ) -> None:
        logger.info("notify_due_date_approaching", task_id=str(task_id))
        payload = {"task_title": task_title, "event": "due_date_approaching"}
        candidate_ids = list({*watcher_ids, *([ assignee_id] if assignee_id else [])})
        if not candidate_ids:
            return

        prefs_map = await self.prefs_repo.get_for_users(candidate_ids, project_id)
        for uid in candidate_ids:
            prefs = prefs_map[uid]
            if not prefs.on_due_date_approaching:
                continue
            already = await self.notif_repo.due_date_already_notified(task_id, uid, within_hours=25)
            if already:
                continue
            user = await self.user_repo.get(uid)
            if not user:
                continue
            await self._send(
                user_id=uid,
                project_id=project_id,
                notification_type=NotificationType.due_date_approaching,
                payload=payload,
                task_id=task_id,
                email_subject=f"Task \"{task_title}\" is due soon",
                email_body=f"Hi {user.username or user.email}, task \"{task_title}\" is approaching its due date.",
                email_enabled=prefs.email_enabled,
                recipient_email=user.email,
            )
        await self.notif_repo.session.commit()
