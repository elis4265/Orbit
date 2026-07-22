"""
Named-priorities unit tests.

Requirements covered:
  REQ-PRI-01  get_effective_items returns global scheme items when project is not forked
  REQ-PRI-02  get_effective_items returns project-local scheme items after forking
  REQ-PRI-03  fork_scheme creates a private scheme copying all items from current scheme
  REQ-PRI-04  fork_scheme is idempotent — calling it twice on the same project is a no-op
  REQ-PRI-05  create_item auto-forks a global scheme before adding the new item
  REQ-PRI-06  update_item auto-forks a global scheme before updating the item
  REQ-PRI-07  delete_item raises 400 CANNOT_DELETE_LAST_PRIORITY when only one item remains
  REQ-PRI-08  delete_item auto-forks a global scheme before deleting
  REQ-PRI-09  reorder_items auto-forks a global scheme before reordering
  REQ-PRI-10  assign_scheme swaps the project's scheme to a different global scheme (not forked)
  REQ-PRI-11  assign_scheme raises 409 SCHEME_FORKED when project already has a custom scheme
"""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.core.errors import AppError
from app.services.priority import PriorityService
from app.schemas.priority import PriorityItemCreate, PriorityItemUpdate


# ─── helpers ────────────────────────────────────────────────────────────────

def make_scheme(project_id=None, is_default=False):
    s = MagicMock()
    s.id = uuid.uuid4()
    s.name = "Orbit Default" if is_default else "Custom"
    s.is_default = is_default
    s.project_id = project_id
    return s


def make_item(scheme_id, position=0, name="Major"):
    i = MagicMock()
    i.id = uuid.uuid4()
    i.scheme_id = scheme_id
    i.name = name
    i.color = "#888888"
    i.position = position
    return i


def make_project(scheme_id):
    p = MagicMock()
    p.id = uuid.uuid4()
    p.priority_scheme_id = scheme_id
    return p


# ─── fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def scheme_repo():
    return MagicMock()


@pytest.fixture
def svc(scheme_repo):
    return PriorityService(scheme_repo=scheme_repo)


# ─── REQ-PRI-01 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_effective_items_returns_global_scheme_items(svc, scheme_repo):
    global_scheme = make_scheme(project_id=None, is_default=True)
    project = make_project(scheme_id=global_scheme.id)
    items = [make_item(global_scheme.id, 0), make_item(global_scheme.id, 1)]

    scheme_repo.get_scheme = AsyncMock(return_value=global_scheme)
    scheme_repo.list_items = AsyncMock(return_value=items)

    result = await svc.get_effective_items(project)

    scheme_repo.get_scheme.assert_called_once_with(project.priority_scheme_id)
    scheme_repo.list_items.assert_called_once_with(global_scheme.id)
    assert result == items


# ─── REQ-PRI-02 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_effective_items_returns_forked_items(svc, scheme_repo):
    project = make_project(scheme_id=uuid.uuid4())
    forked_scheme = make_scheme(project_id=project.id)
    forked_scheme.id = project.priority_scheme_id
    items = [make_item(forked_scheme.id)]

    scheme_repo.get_scheme = AsyncMock(return_value=forked_scheme)
    scheme_repo.list_items = AsyncMock(return_value=items)

    result = await svc.get_effective_items(project)

    assert result == items


# ─── REQ-PRI-03 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fork_scheme_creates_private_scheme_and_copies_items(svc, scheme_repo):
    global_scheme = make_scheme(project_id=None, is_default=True)
    project = make_project(scheme_id=global_scheme.id)
    original_items = [
        make_item(global_scheme.id, 0, "Show-stopper"),
        make_item(global_scheme.id, 1, "Critical"),
    ]
    new_scheme = make_scheme(project_id=project.id)

    scheme_repo.get_scheme = AsyncMock(return_value=global_scheme)
    scheme_repo.list_items = AsyncMock(return_value=original_items)
    scheme_repo.create_scheme = AsyncMock(return_value=new_scheme)
    scheme_repo.create_item = AsyncMock(side_effect=lambda data: make_item(new_scheme.id))
    scheme_repo.update_project_scheme = AsyncMock()

    result = await svc.fork_scheme(project)

    scheme_repo.create_scheme.assert_called_once()
    assert scheme_repo.create_item.call_count == len(original_items)
    scheme_repo.update_project_scheme.assert_called_once_with(project, new_scheme.id)
    assert result is new_scheme


# ─── REQ-PRI-04 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fork_scheme_is_idempotent_when_already_forked(svc, scheme_repo):
    project = make_project(scheme_id=uuid.uuid4())
    already_forked = make_scheme(project_id=project.id)
    already_forked.id = project.priority_scheme_id

    scheme_repo.get_scheme = AsyncMock(return_value=already_forked)

    result = await svc.fork_scheme(project)

    scheme_repo.create_scheme.assert_not_called() if hasattr(scheme_repo, 'create_scheme') else None
    assert result is already_forked


# ─── REQ-PRI-05 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_item_forks_global_scheme_first(svc, scheme_repo):
    global_scheme = make_scheme(project_id=None)
    project = make_project(scheme_id=global_scheme.id)
    forked_scheme = make_scheme(project_id=project.id)
    existing_items = [make_item(forked_scheme.id, 0)]
    new_item = make_item(forked_scheme.id, 1, "Custom")
    data = PriorityItemCreate(name="Custom", color="#ff0000")

    scheme_repo.get_scheme = AsyncMock(side_effect=[global_scheme, forked_scheme])
    scheme_repo.list_items = AsyncMock(return_value=existing_items)
    scheme_repo.create_scheme = AsyncMock(return_value=forked_scheme)
    scheme_repo.create_item = AsyncMock(return_value=new_item)
    scheme_repo.update_project_scheme = AsyncMock()

    result = await svc.create_item(project, data)

    assert result is new_item
    # fork happened: create_scheme was called
    scheme_repo.create_scheme.assert_called_once()


# ─── REQ-PRI-06 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_item_forks_global_scheme_first(svc, scheme_repo):
    global_scheme = make_scheme(project_id=None)
    project = make_project(scheme_id=global_scheme.id)
    forked_scheme = make_scheme(project_id=project.id)
    existing_items = [make_item(forked_scheme.id, 0, "Critical")]
    existing_items[0].scheme_id = forked_scheme.id
    data = PriorityItemUpdate(name="Critical-renamed")

    scheme_repo.get_scheme = AsyncMock(side_effect=[global_scheme, forked_scheme])
    scheme_repo.list_items = AsyncMock(return_value=existing_items)
    scheme_repo.create_scheme = AsyncMock(return_value=forked_scheme)
    scheme_repo.create_item = AsyncMock(side_effect=lambda d: make_item(forked_scheme.id))
    scheme_repo.update_project_scheme = AsyncMock()
    scheme_repo.get_item = AsyncMock(return_value=existing_items[0])
    scheme_repo.update_item = AsyncMock(return_value=existing_items[0])

    result = await svc.update_item(project, existing_items[0].id, data)

    scheme_repo.create_scheme.assert_called_once()
    scheme_repo.update_item.assert_called_once()
    assert result is existing_items[0]


# ─── REQ-PRI-07 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_item_raises_when_only_one_item_remains(svc, scheme_repo):
    project = make_project(scheme_id=uuid.uuid4())
    forked_scheme = make_scheme(project_id=project.id)
    forked_scheme.id = project.priority_scheme_id
    lone_item = make_item(forked_scheme.id, 0)

    scheme_repo.get_scheme = AsyncMock(return_value=forked_scheme)
    scheme_repo.list_items = AsyncMock(return_value=[lone_item])

    with pytest.raises(AppError) as exc:
        await svc.delete_item(project, lone_item.id)

    assert exc.value.code == "CANNOT_DELETE_LAST_PRIORITY"


# ─── REQ-PRI-08 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_item_forks_global_scheme_first(svc, scheme_repo):
    global_scheme = make_scheme(project_id=None)
    project = make_project(scheme_id=global_scheme.id)
    forked_scheme = make_scheme(project_id=project.id)
    items = [make_item(forked_scheme.id, 0, "A"), make_item(forked_scheme.id, 1, "B")]
    items[0].scheme_id = forked_scheme.id
    items[1].scheme_id = forked_scheme.id
    target_id = items[0].id

    scheme_repo.get_scheme = AsyncMock(side_effect=[global_scheme, forked_scheme])
    scheme_repo.list_items = AsyncMock(return_value=items)
    scheme_repo.create_scheme = AsyncMock(return_value=forked_scheme)
    scheme_repo.create_item = AsyncMock(side_effect=lambda d: make_item(forked_scheme.id))
    scheme_repo.update_project_scheme = AsyncMock()
    scheme_repo.get_item = AsyncMock(return_value=items[0])
    scheme_repo.delete_item = AsyncMock()

    await svc.delete_item(project, target_id)

    scheme_repo.create_scheme.assert_called_once()
    scheme_repo.delete_item.assert_called_once()


# ─── REQ-PRI-09 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reorder_items_forks_global_scheme_first(svc, scheme_repo):
    global_scheme = make_scheme(project_id=None)
    project = make_project(scheme_id=global_scheme.id)
    forked_scheme = make_scheme(project_id=project.id)
    items = [make_item(forked_scheme.id, 0, "A"), make_item(forked_scheme.id, 1, "B")]

    scheme_repo.get_scheme = AsyncMock(side_effect=[global_scheme, forked_scheme])
    scheme_repo.list_items = AsyncMock(return_value=items)
    scheme_repo.create_scheme = AsyncMock(return_value=forked_scheme)
    scheme_repo.create_item = AsyncMock(side_effect=lambda d: make_item(forked_scheme.id))
    scheme_repo.update_project_scheme = AsyncMock()
    scheme_repo.get_item = AsyncMock(side_effect=lambda iid: next((i for i in items if i.id == iid), None))
    scheme_repo.update_item = AsyncMock(side_effect=lambda obj, d: obj)

    ordered_ids = [items[1].id, items[0].id]
    result = await svc.reorder_items(project, ordered_ids)

    scheme_repo.create_scheme.assert_called_once()
    assert scheme_repo.update_item.call_count == 2


# ─── REQ-PRI-10 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_assign_scheme_swaps_to_global_scheme(svc, scheme_repo):
    global_scheme = make_scheme(project_id=None)
    project = make_project(scheme_id=global_scheme.id)
    new_global = make_scheme(project_id=None)
    new_items = [make_item(new_global.id, 0)]

    scheme_repo.get_scheme = AsyncMock(return_value=global_scheme)
    scheme_repo.get_global_scheme = AsyncMock(return_value=new_global)
    scheme_repo.list_items = AsyncMock(return_value=new_items)
    scheme_repo.update_project_scheme = AsyncMock()

    result = await svc.assign_scheme(project, new_global.id)

    scheme_repo.update_project_scheme.assert_called_once_with(project, new_global.id)
    assert result == new_items


# ─── REQ-PRI-11 ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_assign_scheme_raises_when_project_is_forked(svc, scheme_repo):
    project = make_project(scheme_id=uuid.uuid4())
    forked_scheme = make_scheme(project_id=project.id)
    forked_scheme.id = project.priority_scheme_id
    new_global = make_scheme(project_id=None)

    scheme_repo.get_scheme = AsyncMock(return_value=forked_scheme)

    with pytest.raises(AppError) as exc:
        await svc.assign_scheme(project, new_global.id)

    assert exc.value.code == "SCHEME_FORKED"
