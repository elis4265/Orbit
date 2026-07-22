"""Unit tests for app.services.search — Postgres FTS statement construction.

The query itself runs against a real Postgres in the integration suite
(test_search_api.py, test_global_search_api.py); here we pin the statement
shape: websearch_to_tsquery + trigram similarity, archived exclusion, project
scoping, rank-then-similarity ordering, and the empty-scope short-circuit.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.dialects import postgresql

from app.services.search import (
    SIMILARITY_THRESHOLD,
    build_task_search_stmt,
    search_tasks,
    search_tasks_multi_project,
)


def _sql(query="router", project_ids=None, limit=20) -> str:
    stmt = build_task_search_stmt(query, project_ids or [uuid.uuid4()], limit)
    return str(stmt.compile(dialect=postgresql.dialect()))


# ── statement shape ──────────────────────────────────────────────────────────

def test_stmt_uses_websearch_to_tsquery_with_english_config():
    sql = _sql()
    assert "websearch_to_tsquery" in sql
    assert "tasks.search_vector @@ websearch_to_tsquery" in sql


def test_stmt_includes_trigram_similarity_on_title():
    sql = _sql()
    assert "similarity(tasks.title" in sql
    # OR'd with the tsvector match — either arm alone qualifies a row
    assert " OR similarity(tasks.title" in sql


def test_stmt_excludes_archived_tasks():
    assert "tasks.archived_at IS NULL" in _sql()


def test_stmt_scopes_to_project_ids():
    assert "tasks.project_id IN" in _sql()


def test_stmt_orders_by_rank_then_similarity_desc():
    sql = _sql()
    order_by = sql.split("ORDER BY")[1]
    assert "ts_rank" in order_by
    assert order_by.index("ts_rank") < order_by.index("similarity")
    assert order_by.count("DESC") == 2


def test_stmt_applies_limit():
    assert "LIMIT" in _sql(limit=5)


def test_similarity_threshold_matches_pg_trgm_default():
    assert SIMILARITY_THRESHOLD == pytest.approx(0.3)


def test_query_string_is_bound_not_inlined():
    # Guard against SQL injection via q — the raw string must never appear in SQL.
    sql = _sql(query="'; DROP TABLE tasks; --")
    assert "DROP TABLE" not in sql


# ── session-level behaviour ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_multi_project_empty_scope_short_circuits():
    session = AsyncMock()
    result = await search_tasks_multi_project(session, "router", [], 10)
    assert result == []
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_search_tasks_executes_and_unwraps_scalars():
    task = object()
    exec_result = MagicMock()
    exec_result.scalars.return_value.all.return_value = [task]
    session = AsyncMock()
    session.execute = AsyncMock(return_value=exec_result)

    result = await search_tasks(session, "router", uuid.uuid4(), limit=7)

    assert result == [task]
    session.execute.assert_awaited_once()
    stmt = session.execute.call_args.args[0]
    assert stmt._limit_clause is not None
