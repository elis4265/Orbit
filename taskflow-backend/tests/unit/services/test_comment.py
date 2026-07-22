import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.models.comment import Comment, CommentHistory
from app.models.user import User
from app.services.comment import CommentService


def _user(user_id: uuid.UUID | None = None) -> User:
    u = MagicMock(spec=User)
    u.id = user_id or uuid.uuid4()
    return u


def _comment(author_id: uuid.UUID, task_id: uuid.UUID | None = None) -> Comment:
    c = MagicMock(spec=Comment)
    c.id = uuid.uuid4()
    c.task_id = task_id or uuid.uuid4()
    c.author_id = author_id
    c.content = "<p>hello</p>"
    c.edited_at = None
    return c


@pytest.fixture
def comment_repo():
    return MagicMock()


@pytest.fixture
def history_repo():
    return MagicMock()


@pytest.fixture
def svc(comment_repo, history_repo):
    return CommentService(comment_repo, history_repo)


# ─── list ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_returns_task_comments(svc, comment_repo):
    task_id = uuid.uuid4()
    comments = [_comment(uuid.uuid4(), task_id)]
    comment_repo.get_task_comments = AsyncMock(return_value=comments)

    result = await svc.list_comments(task_id)

    assert result == comments
    comment_repo.get_task_comments.assert_called_once_with(task_id)


# ─── create ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_stores_comment(svc, comment_repo):
    task_id = uuid.uuid4()
    author = _user()
    new_comment = _comment(author.id, task_id)
    comment_repo.create = AsyncMock(return_value=new_comment)

    result = await svc.create_comment(task_id, author, "<p>text</p>")

    assert result == new_comment
    comment_repo.create.assert_called_once_with({
        "task_id": task_id,
        "author_id": author.id,
        "content": "<p>text</p>",
    })


# ─── edit ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_edit_by_author_saves_history(svc, comment_repo, history_repo):
    author = _user()
    comment = _comment(author.id)
    comment_repo.get = AsyncMock(return_value=comment)
    history_repo.create = AsyncMock(return_value=MagicMock(spec=CommentHistory))
    comment_repo.update = AsyncMock(return_value=comment)

    await svc.edit_comment(comment.id, author, "<p>new</p>")

    history_repo.create.assert_called_once()
    saved = history_repo.create.call_args[0][0]
    assert saved["comment_id"] == comment.id
    assert saved["content"] == comment.content
    assert saved["edited_by"] == author.id


@pytest.mark.asyncio
async def test_edit_by_non_author_raises_403(svc, comment_repo, history_repo):
    author = _user()
    other = _user()
    comment = _comment(author.id)
    comment_repo.get = AsyncMock(return_value=comment)

    with pytest.raises(HTTPException) as exc:
        await svc.edit_comment(comment.id, other, "<p>new</p>")

    assert exc.value.status_code == 403
    history_repo.create.assert_not_called()


@pytest.mark.asyncio
async def test_edit_missing_comment_raises_404(svc, comment_repo, history_repo):
    comment_repo.get = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc:
        await svc.edit_comment(uuid.uuid4(), _user(), "<p>x</p>")

    assert exc.value.status_code == 404


# ─── delete ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_by_author_succeeds(svc, comment_repo):
    author = _user()
    workspace_owner_id = uuid.uuid4()
    comment = _comment(author.id)
    comment_repo.get = AsyncMock(return_value=comment)
    comment_repo.delete = AsyncMock()

    await svc.delete_comment(comment.id, author, workspace_owner_id, is_admin=False)

    comment_repo.delete.assert_called_once_with(comment)


@pytest.mark.asyncio
async def test_delete_by_admin_succeeds(svc, comment_repo):
    author = _user()
    admin = _user()
    comment = _comment(author.id)
    comment_repo.get = AsyncMock(return_value=comment)
    comment_repo.delete = AsyncMock()

    await svc.delete_comment(comment.id, admin, uuid.uuid4(), is_admin=True)

    comment_repo.delete.assert_called_once_with(comment)


@pytest.mark.asyncio
async def test_delete_by_non_author_non_admin_raises_403(svc, comment_repo):
    author = _user()
    stranger = _user()
    comment = _comment(author.id)
    comment_repo.get = AsyncMock(return_value=comment)

    with pytest.raises(HTTPException) as exc:
        await svc.delete_comment(comment.id, stranger, uuid.uuid4(), is_admin=False)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_delete_missing_comment_raises_404(svc, comment_repo):
    comment_repo.get = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc:
        await svc.delete_comment(uuid.uuid4(), _user(), uuid.uuid4(), is_admin=False)

    assert exc.value.status_code == 404


# ─── history ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_history_returns_entries(svc, comment_repo, history_repo):
    comment_id = uuid.uuid4()
    entries = [MagicMock(spec=CommentHistory)]
    comment_repo.get = AsyncMock(return_value=_comment(uuid.uuid4()))
    history_repo.get_comment_history = AsyncMock(return_value=entries)

    result = await svc.get_history(comment_id)

    assert result == entries
    history_repo.get_comment_history.assert_called_once_with(comment_id)


@pytest.mark.asyncio
async def test_get_history_missing_comment_raises_404(svc, comment_repo, history_repo):
    comment_repo.get = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc:
        await svc.get_history(uuid.uuid4())

    assert exc.value.status_code == 404
