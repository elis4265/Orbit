# Alembic's env.py imports Base from database.py to autogenerate migrations.
# If models aren't imported before that happens, Alembic sees an empty metadata
# object and generates a blank migration — a silent and confusing failure.
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember, MemberRole
from app.models.project_invite import ProjectInvite
from app.models.task import Task, TaskStatus
from app.models.board import Board
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.models.task_yjs_document import TaskYjsDocument
from app.models.comment_reaction import CommentReaction
from app.models.custom_emote import CustomEmote
from app.models.share_link import ShareLink
from app.models.attachment import Attachment
from app.models.comment import Comment, CommentHistory
from app.models.task_watcher import TaskWatcher
from app.models.notification_preferences import NotificationPreferences
from app.models.notification import Notification, NotificationType
from app.models.tag import Tag, TagVisibility
from app.models.task_tag import TaskTag
from app.models.activity import Activity
from app.models.audit_log import AuditLog
from app.models.task_link import TaskLink, LinkType
from app.models.sprint import Sprint
from app.models.project_status import ProjectStatus, ProjectTransitionRule, StatusCategory
from app.models.priority import PriorityScheme, PrioritySchemeItem
from app.models.saved_search import SavedSearch
from app.models.cycle_config import CycleConfig
from app.models.custom_field import CustomField
from app.models.automation_rule import AutomationRule
from app.models.release import Release
from app.models.task_template import TaskTemplate
from app.models.vcs import VcsConnection, TaskDevLink, VcsEvent
from app.models.api_token import ApiToken
from app.models.outbound_webhook import OutboundWebhook
from app.models.work_log import WorkLog
from app.models.recurring_task import RecurringTask

__all__ = ["Base", "User", "Project", "ProjectMember", "MemberRole", "ProjectInvite", "Task", "Board", "TaskStatus", "EmailVerification", "Attachment", "Comment", "CommentHistory", "TaskWatcher", "NotificationPreferences", "Notification", "NotificationType", "Tag", "TagVisibility", "TaskTag", "Activity", "AuditLog", "TaskLink", "LinkType", "Sprint", "ProjectStatus", "ProjectTransitionRule", "StatusCategory", "PriorityScheme", "PrioritySchemeItem", "SavedSearch", "CycleConfig", "CustomField", "AutomationRule", "Release", "TaskTemplate", "VcsConnection", "TaskDevLink", "VcsEvent", "ApiToken", "OutboundWebhook", "WorkLog", "RecurringTask", "CustomEmote"]