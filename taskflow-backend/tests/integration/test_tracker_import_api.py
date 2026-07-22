"""REQ-160 — Trello JSON + Jira CSV import with per-entity error reports."""
import json

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember, MemberRole
from app.models.task import Task, TaskStatus, IssueType
from app.models.tag import Tag
from app.models.comment import Comment


@pytest.fixture(autouse=True)
def _clear_user_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


async def _seed(db_session):
    admin = User(email="importer@taskflow.io", username="importer", hashed_password="x",
                 is_verified=True, is_active=True)
    member = User(email="member@taskflow.io", username="member", hashed_password="x",
                  is_verified=True, is_active=True)
    db_session.add_all([admin, member])
    await db_session.flush()
    project = Project(name="Immigration", owner_id=admin.id, key="IMM", next_sequence=1)
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=member.id, role=MemberRole.member))
    await db_session.commit()
    return admin, member, project


TRELLO_EXPORT = {
    "name": "Old board",
    "lists": [
        {"id": "L1", "name": "To Do"},
        {"id": "L2", "name": "Doing"},
        {"id": "L3", "name": "Done"},
    ],
    "cards": [
        {"id": "C1", "name": "Ship it", "desc": "the plan", "idList": "L2",
         "labels": [{"name": "backend", "color": "green"}], "due": "2026-08-01T00:00:00Z"},
        {"id": "C2", "name": "Old junk", "idList": "L3", "closed": True},
        {"id": "C3", "name": "", "idList": "L1"},
        {"id": "C4", "name": "Finished thing", "idList": "L3"},
    ],
    "checklists": [
        {"id": "K1", "idCard": "C1", "checkItems": [
            {"name": "step one", "state": "complete"},
            {"name": "step two", "state": "incomplete"},
        ]},
    ],
    "actions": [
        {"type": "commentCard", "data": {"card": {"id": "C1"}, "text": "lgtm"},
         "memberCreator": {"fullName": "Jane Trello"}},
    ],
}


@pytest.mark.asyncio
async def test_trello_import_maps_everything(db_session):
    admin, member, project = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: admin
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{project.id}/import/trello",
            files={"file": ("board.json", json.dumps(TRELLO_EXPORT).encode(), "application/json")},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # C1 + C4 imported; C2 archived → skipped silently; C3 nameless → error
        assert body["created"] == 2
        assert len(body["errors"]) == 1 and "card" in body["errors"][0]["entity"]

    tasks = (await db_session.execute(
        select(Task).where(Task.project_id == project.id, Task.parent_id.is_(None))
    )).scalars().all()
    by_title = {t.title: t for t in tasks}
    assert by_title["Ship it"].status == TaskStatus.in_progress   # "Doing" list
    assert by_title["Finished thing"].status == TaskStatus.done   # "Done" list
    assert by_title["Ship it"].description == "the plan"

    children = (await db_session.execute(
        select(Task).where(Task.parent_id == by_title["Ship it"].id)
    )).scalars().all()
    assert sorted(c.title for c in children) == ["step one", "step two"]
    assert {c.title: c.status for c in children}["step one"] == TaskStatus.done

    tags = (await db_session.execute(select(Tag).where(Tag.project_id == project.id))).scalars().all()
    assert [t.name for t in tags] == ["backend"]

    comments = (await db_session.execute(
        select(Comment).where(Comment.task_id == by_title["Ship it"].id)
    )).scalars().all()
    assert len(comments) == 1
    assert "Jane Trello" in comments[0].content and "lgtm" in comments[0].content
    assert comments[0].author_id == admin.id  # attributed to the importer


JIRA_CSV = (
    "Issue key,Summary,Issue Type,Status,Description,Due date,Labels,Labels\n"
    'PRJ-1,Fix the login,Bug,In Progress,broken again,2026-08-15,auth,backend\n'
    "PRJ-2,Write docs,Task,Done,,,,\n"
    "PRJ-3,,Story,To Do,no summary here,,,\n"
)


@pytest.mark.asyncio
async def test_jira_csv_import(db_session):
    admin, member, project = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: admin
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{project.id}/import/jira",
            files={"file": ("jira.csv", JIRA_CSV.encode(), "text/csv")},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["created"] == 2
        assert len(body["errors"]) == 1  # PRJ-3 has no Summary

    tasks = (await db_session.execute(
        select(Task).where(Task.project_id == project.id)
    )).scalars().all()
    by_title = {t.title: t for t in tasks}
    assert by_title["Fix the login"].issue_type == IssueType.bug
    assert by_title["Fix the login"].status == TaskStatus.in_progress
    assert by_title["Write docs"].status == TaskStatus.done

    tags = (await db_session.execute(select(Tag).where(Tag.project_id == project.id))).scalars().all()
    assert sorted(t.name for t in tags) == ["auth", "backend"]


@pytest.mark.asyncio
async def test_import_admin_only_and_bad_files_422(db_session):
    admin, member, project = await _seed(db_session)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        app.dependency_overrides[get_current_user] = lambda: member
        resp = await ac.post(
            f"/api/v1/projects/{project.id}/import/trello",
            files={"file": ("board.json", b"{}", "application/json")},
        )
        assert resp.status_code == 403

        app.dependency_overrides[get_current_user] = lambda: admin
        not_trello = await ac.post(
            f"/api/v1/projects/{project.id}/import/trello",
            files={"file": ("nope.json", b'{"foo": 1}', "application/json")},
        )
        assert not_trello.status_code == 422
        not_jira = await ac.post(
            f"/api/v1/projects/{project.id}/import/jira",
            files={"file": ("nope.csv", b"a,b\n1,2\n", "text/csv")},
        )
        assert not_jira.status_code == 422
