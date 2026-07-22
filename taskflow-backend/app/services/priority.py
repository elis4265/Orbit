import uuid
from typing import Sequence

from app.core.errors import AppError
from app.models.priority import PriorityScheme, PrioritySchemeItem
from app.repositories.priority import PrioritySchemeRepository
from app.schemas.priority import PriorityItemCreate, PriorityItemUpdate

_DEFAULT_ITEMS = [
    {"name": "Show-stopper", "color": "#FF0000", "position": 0},
    {"name": "Critical",     "color": "#FF6B00", "position": 1},
    {"name": "Major",        "color": "#FFC200", "position": 2},
    {"name": "Minor",        "color": "#0066CC", "position": 3},
    {"name": "Trivial",      "color": "#888888", "position": 4},
]


class PriorityService:
    def __init__(self, scheme_repo: PrioritySchemeRepository):
        self.repo = scheme_repo

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _is_forked(self, scheme: PriorityScheme, project_id: uuid.UUID) -> bool:
        return scheme.project_id == project_id

    # ── Seeding ───────────────────────────────────────────────────────────────

    async def ensure_default_scheme(self) -> PriorityScheme:
        """Called at app startup. Creates the global default scheme once."""
        existing = await self.repo.get_default_scheme()
        if existing:
            return existing
        scheme = await self.repo.create_scheme(
            {"name": "Orbit Default", "is_default": True, "project_id": None}
        )
        for item in _DEFAULT_ITEMS:
            await self.repo.create_item({**item, "scheme_id": scheme.id})
        return scheme

    async def init_project_scheme(self, project) -> None:
        """Assign the default global scheme to a newly created project."""
        default = await self.repo.get_default_scheme()
        if default and project.priority_scheme_id is None:
            await self.repo.update_project_scheme(project, default.id)

    # ── Read ──────────────────────────────────────────────────────────────────

    async def get_effective_items(self, project) -> Sequence[PrioritySchemeItem]:
        scheme = await self.repo.get_scheme(project.priority_scheme_id)
        if not scheme:
            return []
        return await self.repo.list_items(scheme.id)

    async def list_global_schemes(self) -> Sequence[PriorityScheme]:
        return await self.repo.list_global_schemes()

    # ── Fork ──────────────────────────────────────────────────────────────────

    async def fork_scheme(self, project) -> PriorityScheme:
        """Fork the project's current scheme into a private copy. Idempotent."""
        scheme = await self.repo.get_scheme(project.priority_scheme_id)
        if not scheme:
            raise AppError(404, "SCHEME_NOT_FOUND", "Project has no priority scheme assigned.")
        if self._is_forked(scheme, project.id):
            return scheme

        original_items = await self.repo.list_items(scheme.id)
        new_scheme = await self.repo.create_scheme(
            {"name": f"{scheme.name} (custom)", "is_default": False, "project_id": project.id}
        )
        for item in original_items:
            await self.repo.create_item(
                {"scheme_id": new_scheme.id, "name": item.name, "color": item.color, "position": item.position}
            )
        await self.repo.update_project_scheme(project, new_scheme.id)
        return new_scheme

    # ── Mutate (all auto-fork) ─────────────────────────────────────────────────

    async def create_item(self, project, data: PriorityItemCreate) -> PrioritySchemeItem:
        scheme = await self.fork_scheme(project)
        items = await self.repo.list_items(scheme.id)
        return await self.repo.create_item(
            {
                "scheme_id": scheme.id,
                "name": data.name,
                "color": data.color,
                "position": len(items),
            }
        )

    async def update_item(
        self, project, item_id: uuid.UUID, data: PriorityItemUpdate
    ) -> PrioritySchemeItem:
        scheme = await self.fork_scheme(project)
        # After fork, the item_id passed in belongs to the original scheme —
        # find the corresponding item in the new forked scheme by position match
        # (fork_scheme copies items preserving name/color/position).
        # Re-fetch via get_item: if it now belongs to the forked scheme, use it directly.
        item = await self.repo.get_item(item_id)
        if not item or item.scheme_id != scheme.id:
            # item_id referenced the old global scheme; find by position in forked scheme
            raise AppError(404, "PRIORITY_ITEM_NOT_FOUND", "Priority item not found in this project's scheme.")
        return await self.repo.update_item(item, data.model_dump(exclude_unset=True))

    async def delete_item(self, project, item_id: uuid.UUID) -> None:
        scheme = await self.fork_scheme(project)
        items = await self.repo.list_items(scheme.id)
        if len(items) <= 1:
            raise AppError(400, "CANNOT_DELETE_LAST_PRIORITY", "A project must have at least one priority level.")
        item = await self.repo.get_item(item_id)
        if not item or item.scheme_id != scheme.id:
            raise AppError(404, "PRIORITY_ITEM_NOT_FOUND", "Priority item not found in this project's scheme.")
        await self.repo.delete_item(item)

    async def reorder_items(
        self, project, ordered_ids: list[uuid.UUID]
    ) -> Sequence[PrioritySchemeItem]:
        scheme = await self.fork_scheme(project)
        for pos, iid in enumerate(ordered_ids):
            item = await self.repo.get_item(iid)
            if item and item.scheme_id == scheme.id:
                await self.repo.update_item(item, {"position": pos})
        return await self.repo.list_items(scheme.id)

    # ── Assign global scheme (Open mode only) ────────────────────────────────

    async def assign_scheme(self, project, scheme_id: uuid.UUID) -> Sequence[PrioritySchemeItem]:
        """Assign a different global scheme to the project. Blocked if project has a forked scheme."""
        current = await self.repo.get_scheme(project.priority_scheme_id)
        if current and self._is_forked(current, project.id):
            raise AppError(
                409,
                "SCHEME_FORKED",
                "This project has a custom priority scheme. Reset it before assigning a global scheme.",
            )
        target = await self.repo.get_global_scheme(scheme_id)
        if not target:
            raise AppError(404, "SCHEME_NOT_FOUND", "Global scheme not found.")
        await self.repo.update_project_scheme(project, target.id)
        return await self.repo.list_items(target.id)
