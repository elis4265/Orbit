"""Schemas for Git-integration connections + dev-links."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class VcsConnectionCreate(BaseModel):
    provider: str  # github | gitlab | bitbucket
    repo_identifier: str
    base_url: str | None = None
    settings: dict | None = None
    # Bitbucket (no device flow) supplies a workspace/repo access token to store.
    token: str | None = None


class DevicePollRequest(BaseModel):
    device_code: str


class VcsConnectionUpdate(BaseModel):
    # event→status-category mapping overrides
    settings: dict | None = None


class VcsConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    provider: str
    repo_identifier: str
    base_url: str | None = None
    settings: dict | None = None
    webhook_url: str = ""
    connected: bool = False  # has a stored token (device flow / pasted)
    created_at: datetime


class VcsConnectionCreated(VcsConnectionResponse):
    # Returned ONCE on create so the admin can configure the provider's webhook.
    webhook_secret: str = ""


class TaskDevLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    external_id: str
    number: int | None = None
    title: str
    url: str
    state: str
    author_login: str | None = None
    created_at: datetime
    # repo context so the panel disambiguates multiple repos (joined from connection)
    provider: str = ""
    repo_identifier: str = ""
