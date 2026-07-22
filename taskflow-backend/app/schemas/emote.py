import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, computed_field

from app.core.config import settings

EMOTE_NAME_RE = re.compile(r"^[a-z0-9_]{2,32}$")


class EmoteResponse(BaseModel):
    """Project custom emote; referenced in reactions as ':name:'."""

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    created_by: uuid.UUID | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @computed_field  # type: ignore[misc]
    @property
    def url(self) -> str:
        return f"{settings.base_url}/api/v1/projects/{self.project_id}/emotes/{self.id}/image"
