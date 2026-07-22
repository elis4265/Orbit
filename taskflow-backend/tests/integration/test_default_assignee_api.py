"""HW-18: per-project default assignee for newly created tasks.

Covers the apply logic at the TaskService choke point (explicit wins / creator /
member / unassigned), the admin-gated configuration endpoint's validation, and
the membership-removal cleanup that stops the setting dangling.
"""
import uuid

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.models.board import Board
from app.models.project import Project
from app.models.project_member import MemberRole, ProjectMember
from app.models.user import User


@pytest.fixture(autouse=True)
def _clear_user_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


async def _mkuser(db_session, tag: str) -> User:
    user = User(
        email=f"da_{tag}_{uuid.uuid4().hex[:6]}@taskflow.io",
        hashed_password="x",
        is_verified=True,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _seed(db_session, mode="unassigned", assignee=None):
    """Owner + one plain member + a project/board in the given default-assignee mode."""
    owner = await _mkuser(db_session, "owner")
    member = await _mkuser(db_session, "member")
    project = Project(
        name="Defaults",
        owner_id=owner.id,
        key="DEF",
        next_sequence=1,
        mode="open",
        default_assignee_mode=mode,
        default_assignee_id=assignee,
    )
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=member.id, role=MemberRole.member))
    board = Board(name="Board", project_id=project.id)
    db_session.add(board)
    await db_session.commit()
    return owner, member, project, board


def _create_url(project, board):
    return f"/api/v1/projects/{project.id}/boards/{board.id}/tasks"


# ── Applying the default on create ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_unassigned_mode_leaves_assignee_null(db_session):
    owner, _member, project, board = await _seed(db_session, mode="unassigned")
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(_create_url(project, board), json={"title": "nobody's problem"})
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] is None


@pytest.mark.asyncio
async def test_creator_mode_assigns_the_creator(db_session):
    _owner, member, project, board = await _seed(db_session, mode="creator")
    # the *member* creates it — the creator is who acts, not who owns
    app.dependency_overrides[get_current_user] = lambda: member
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(_create_url(project, board), json={"title": "mine now"})
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] == str(member.id)


@pytest.mark.asyncio
async def test_member_mode_assigns_the_configured_user(db_session):
    owner, member, project, board = await _seed(db_session, mode="unassigned")
    project.default_assignee_mode = "member"
    project.default_assignee_id = member.id
    await db_session.commit()
    # owner creates, but the configured member gets it
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(_create_url(project, board), json={"title": "triage this"})
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] == str(member.id)


@pytest.mark.asyncio
async def test_explicit_assignee_beats_creator_mode(db_session):
    owner, member, project, board = await _seed(db_session, mode="creator")
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            _create_url(project, board),
            json={"title": "for you", "assignee_id": str(member.id)},
        )
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] == str(member.id)  # not the creator


@pytest.mark.asyncio
async def test_explicit_assignee_beats_member_mode(db_session):
    owner, member, project, board = await _seed(db_session, mode="member")
    project.default_assignee_id = member.id
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            _create_url(project, board),
            json={"title": "override", "assignee_id": str(owner.id)},
        )
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] == str(owner.id)


@pytest.mark.asyncio
async def test_csv_import_never_applies_the_default(db_session):
    """Imports are deliberately excluded: an imported row with no assignee stays
    unassigned whatever the project default. Silently mass-assigning a spreadsheet
    to one person is surprising and tedious to undo."""
    owner, member, project, board = await _seed(db_session, mode="member")
    project.default_assignee_id = member.id
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: owner
    csv_body = "title,description\nImported row,from a spreadsheet\n"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{project.id}/import/csv",
            files={"file": ("tasks.csv", csv_body, "text/csv")},
        )
        assert resp.status_code in (200, 201), resp.text
        tasks = await ac.get(f"/api/v1/projects/{project.id}/tasks")
    imported = [t for t in tasks.json() if t["title"] == "Imported row"]
    assert len(imported) == 1
    assert imported[0]["assignee_id"] is None


@pytest.mark.asyncio
async def test_trello_import_never_applies_default_to_cards_or_checklist_children(db_session):
    """Both Trello paths stay unassigned — the card path through create_task and the
    checklist->child path, which builds its row directly and so has to opt out itself."""
    owner, member, project, _board = await _seed(db_session, mode="member")
    project.default_assignee_id = member.id
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: owner
    board_json = {
        "lists": [{"id": "l1", "name": "To Do"}],
        "cards": [{"id": "c1", "name": "Trello card", "idList": "l1", "labels": []}],
        "checklists": [{
            "idCard": "c1",
            "checkItems": [{"name": "a checklist item", "state": "incomplete"}],
        }],
        "actions": [],
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{project.id}/import/trello",
            files={"file": ("board.json", __import__("json").dumps(board_json), "application/json")},
        )
        assert resp.status_code in (200, 201), resp.text
        tasks = (await ac.get(f"/api/v1/projects/{project.id}/tasks")).json()
    by_title = {t["title"]: t for t in tasks}
    assert by_title["Trello card"]["assignee_id"] is None
    assert by_title["a checklist item"]["assignee_id"] is None


# ── Configuring it through PATCH /projects/{id} ──────────────────────────────

@pytest.mark.asyncio
async def test_admin_sets_member_mode(db_session):
    owner, member, project, _board = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}",
            json={"default_assignee_mode": "member", "default_assignee_id": str(member.id)},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["default_assignee_mode"] == "member"
    assert body["default_assignee_id"] == str(member.id)


@pytest.mark.asyncio
async def test_owner_is_a_valid_default_assignee(db_session):
    """The owner has no project_members row but is always treated as a member."""
    owner, _member, project, _board = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}",
            json={"default_assignee_mode": "member", "default_assignee_id": str(owner.id)},
        )
    assert resp.status_code == 200
    assert resp.json()["default_assignee_id"] == str(owner.id)


@pytest.mark.asyncio
async def test_non_member_rejected(db_session):
    owner, _member, project, _board = await _seed(db_session)
    outsider = await _mkuser(db_session, "outsider")
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}",
            json={"default_assignee_mode": "member", "default_assignee_id": str(outsider.id)},
        )
    assert resp.status_code == 422
    await db_session.refresh(project)
    assert project.default_assignee_mode == "unassigned"


@pytest.mark.asyncio
async def test_member_mode_without_id_rejected(db_session):
    owner, _member, project, _board = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}",
            json={"default_assignee_mode": "member"},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_id_without_member_mode_is_normalised_away(db_session):
    """An id only means something under mode='member' — it is dropped, not rejected."""
    owner, member, project, _board = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}",
            json={"default_assignee_mode": "creator", "default_assignee_id": str(member.id)},
        )
    assert resp.status_code == 200
    assert resp.json()["default_assignee_mode"] == "creator"
    assert resp.json()["default_assignee_id"] is None


@pytest.mark.asyncio
async def test_switching_away_from_member_clears_the_id(db_session):
    owner, member, project, _board = await _seed(db_session, mode="member")
    project.default_assignee_id = member.id
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}", json={"default_assignee_mode": "unassigned"}
        )
    assert resp.status_code == 200
    assert resp.json()["default_assignee_id"] is None


@pytest.mark.asyncio
async def test_bad_mode_rejected_by_schema(db_session):
    owner, _member, project, _board = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}", json={"default_assignee_mode": "whoever"}
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_non_admin_cannot_configure(db_session):
    _owner, member, project, _board = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: member
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}",
            json={"default_assignee_mode": "creator"},
        )
    assert resp.status_code == 403


# ── Integrity on membership removal ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_removing_the_default_assignee_resets_the_setting(db_session):
    owner, member, project, _board = await _seed(db_session, mode="member")
    project.default_assignee_id = member.id
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.delete(f"/api/v1/projects/{project.id}/members/{member.id}")
    assert resp.status_code == 204
    await db_session.refresh(project)
    assert project.default_assignee_id is None
    assert project.default_assignee_mode == "unassigned"


@pytest.mark.asyncio
async def test_removing_an_unrelated_member_leaves_the_setting_alone(db_session):
    owner, member, project, _board = await _seed(db_session, mode="member")
    other = await _mkuser(db_session, "other")
    db_session.add(ProjectMember(project_id=project.id, user_id=other.id, role=MemberRole.member))
    project.default_assignee_id = member.id
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.delete(f"/api/v1/projects/{project.id}/members/{other.id}")
    assert resp.status_code == 204
    await db_session.refresh(project)
    assert project.default_assignee_id == member.id
    assert project.default_assignee_mode == "member"


# ── HW-18: "clear the pre-filled assignee" must survive the round trip ────────

@pytest.mark.asyncio
async def test_explicit_null_assignee_is_respected_in_creator_mode(db_session):
    """Creator mode, but the creator emptied the Assignee field before saving.
    The payload carries assignee_id: null — the task must come back unassigned."""
    _owner, member, project, board = await _seed(db_session, mode="creator")
    app.dependency_overrides[get_current_user] = lambda: member
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            _create_url(project, board),
            json={"title": "deliberately nobody", "assignee_id": None},
        )
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] is None


@pytest.mark.asyncio
async def test_explicit_null_assignee_is_respected_in_member_mode(db_session):
    owner, member, project, board = await _seed(db_session, mode="unassigned")
    project.default_assignee_mode = "member"
    project.default_assignee_id = member.id
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            _create_url(project, board),
            json={"title": "not for them either", "assignee_id": None},
        )
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] is None


@pytest.mark.asyncio
async def test_explicit_assignee_still_wins_over_the_default(db_session):
    """Pre-fill is a suggestion: swapping it for someone else must be honoured."""
    owner, member, project, board = await _seed(db_session, mode="creator")
    app.dependency_overrides[get_current_user] = lambda: owner
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            _create_url(project, board),
            json={"title": "reassigned before saving", "assignee_id": str(member.id)},
        )
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] == str(member.id)
