import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.errors import AppError
from app.services.project_status import ProjectStatusService


def _make_repo(**kwargs):
    repo = MagicMock()
    for k, v in kwargs.items():
        setattr(repo, k, AsyncMock(return_value=v))
    return repo


def _status(name, category, project_id=None, sid=None, position=0):
    s = MagicMock()
    s.id = sid or uuid.uuid4()
    s.name = name
    s.category = category
    s.project_id = project_id or uuid.uuid4()
    s.position = position
    return s


PID = uuid.uuid4()


class TestSeedDefaults:
    @pytest.mark.asyncio
    async def test_creates_three_statuses(self):
        repo = _make_repo(create=MagicMock())
        repo.create = AsyncMock(side_effect=lambda d: MagicMock(id=uuid.uuid4()))
        svc = ProjectStatusService(repo)
        await svc.seed_defaults(PID)
        assert repo.create.call_count == 3

    @pytest.mark.asyncio
    async def test_seeds_correct_categories(self):
        created = []
        repo = MagicMock()
        repo.create = AsyncMock(side_effect=lambda d: created.append(d) or MagicMock())
        svc = ProjectStatusService(repo)
        await svc.seed_defaults(PID)
        cats = [d["category"] for d in created]
        assert cats == ["unstarted", "started", "completed"]


class TestCreateStatus:
    @pytest.mark.asyncio
    async def test_raises_on_duplicate_name(self):
        existing = [_status("To Do", "unstarted", project_id=PID)]
        repo = _make_repo(list_for_project=existing, create=MagicMock())
        svc = ProjectStatusService(repo)
        with pytest.raises(AppError) as exc:
            from app.schemas.project_status import ProjectStatusCreate
            await svc.create_status(PID, ProjectStatusCreate(name="To Do", category="started"))
        assert exc.value.code == "DUPLICATE_STATUS"

    @pytest.mark.asyncio
    async def test_case_insensitive_dup_check(self):
        existing = [_status("To Do", "unstarted", project_id=PID)]
        repo = _make_repo(list_for_project=existing, create=MagicMock())
        svc = ProjectStatusService(repo)
        with pytest.raises(AppError):
            from app.schemas.project_status import ProjectStatusCreate
            await svc.create_status(PID, ProjectStatusCreate(name="to do", category="started"))

    @pytest.mark.asyncio
    async def test_sets_position_as_len_existing(self):
        captured = []
        existing = [_status("To Do", "unstarted", project_id=PID)]
        repo = MagicMock()
        repo.list_for_project = AsyncMock(return_value=existing)
        repo.create = AsyncMock(side_effect=lambda d: captured.append(d) or MagicMock())
        svc = ProjectStatusService(repo)
        from app.schemas.project_status import ProjectStatusCreate
        await svc.create_status(PID, ProjectStatusCreate(name="Review", category="started"))
        assert captured[0]["position"] == 1


class TestDeleteStatus:
    @pytest.mark.asyncio
    async def test_blocks_deleting_last_status(self):
        sid = uuid.uuid4()
        existing = [_status("Only", "unstarted", project_id=PID, sid=sid)]
        repo = _make_repo(list_for_project=existing, get=existing[0])
        svc = ProjectStatusService(repo)
        with pytest.raises(AppError) as exc:
            await svc.delete_status(PID, sid)
        assert exc.value.code == "CANNOT_DELETE_LAST_STATUS"

    @pytest.mark.asyncio
    async def test_raises_404_when_status_not_in_project(self):
        sid = uuid.uuid4()
        existing = [_status("A", "unstarted", project_id=PID), _status("B", "started", project_id=PID)]
        other_project_status = _status("Other", "unstarted")  # different project_id
        repo = _make_repo(list_for_project=existing, get=other_project_status)
        svc = ProjectStatusService(repo)
        with pytest.raises(AppError) as exc:
            await svc.delete_status(PID, sid)
        assert exc.value.code == "STATUS_NOT_FOUND"


class TestListStatuses:
    @pytest.mark.asyncio
    async def test_delegates_to_repo(self):
        statuses = [_status("A", "unstarted", project_id=PID)]
        repo = _make_repo(list_for_project=statuses)
        svc = ProjectStatusService(repo)
        result = await svc.list_statuses(PID)
        assert result == statuses
        repo.list_for_project.assert_awaited_once_with(PID)


class TestUpdateStatus:
    @pytest.mark.asyncio
    async def test_updates_without_name_change(self):
        sid = uuid.uuid4()
        obj = _status("To Do", "unstarted", project_id=PID, sid=sid)
        repo = MagicMock()
        repo.get = AsyncMock(return_value=obj)
        repo.update = AsyncMock(return_value=obj)
        svc = ProjectStatusService(repo)
        from app.schemas.project_status import ProjectStatusUpdate
        await svc.update_status(PID, sid, ProjectStatusUpdate(color="#ff0000"))
        repo.list_for_project.assert_not_called()
        repo.update.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        repo = _make_repo(get=None)
        svc = ProjectStatusService(repo)
        from app.schemas.project_status import ProjectStatusUpdate
        with pytest.raises(AppError) as exc:
            await svc.update_status(PID, uuid.uuid4(), ProjectStatusUpdate(name="X"))
        assert exc.value.code == "STATUS_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_raises_dup_when_new_name_clashes(self):
        sid = uuid.uuid4()
        obj = _status("To Do", "unstarted", project_id=PID, sid=sid)
        other = _status("In Progress", "started", project_id=PID)
        repo = MagicMock()
        repo.get = AsyncMock(return_value=obj)
        repo.list_for_project = AsyncMock(return_value=[obj, other])
        svc = ProjectStatusService(repo)
        from app.schemas.project_status import ProjectStatusUpdate
        with pytest.raises(AppError) as exc:
            await svc.update_status(PID, sid, ProjectStatusUpdate(name="In Progress"))
        assert exc.value.code == "DUPLICATE_STATUS"


class TestDeleteStatusHappyPath:
    @pytest.mark.asyncio
    async def test_deletes_when_multiple_statuses(self):
        sid = uuid.uuid4()
        s1 = _status("To Do", "unstarted", project_id=PID, sid=sid)
        s2 = _status("Done", "completed", project_id=PID)
        repo = MagicMock()
        repo.list_for_project = AsyncMock(return_value=[s1, s2])
        repo.get = AsyncMock(return_value=s1)
        repo.delete = AsyncMock()
        svc = ProjectStatusService(repo)
        await svc.delete_status(PID, sid)
        repo.delete.assert_awaited_once_with(s1)


class TestReorderStatuses:
    @pytest.mark.asyncio
    async def test_sets_positions_in_order(self):
        ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
        statuses = [_status(f"S{i}", "unstarted", project_id=PID, sid=ids[i]) for i in range(3)]
        updated_positions = []
        repo = MagicMock()
        repo.get = AsyncMock(side_effect=lambda sid: next((s for s in statuses if s.id == sid), None))
        repo.update = AsyncMock(side_effect=lambda obj, data: updated_positions.append(data["position"]) or obj)
        repo.list_for_project = AsyncMock(return_value=statuses)
        svc = ProjectStatusService(repo)
        await svc.reorder_statuses(PID, ids)
        assert updated_positions == [0, 1, 2]


class TestTransitionCRUD:
    @pytest.mark.asyncio
    async def test_list_transitions(self):
        rules = [MagicMock()]
        repo = _make_repo(list_transitions=rules)
        svc = ProjectStatusService(repo)
        result = await svc.list_transitions(PID)
        assert result == rules

    @pytest.mark.asyncio
    async def test_create_transition_raises_when_from_not_found(self):
        repo = _make_repo(get=None)
        svc = ProjectStatusService(repo)
        with pytest.raises(AppError) as exc:
            await svc.create_transition(PID, uuid.uuid4(), uuid.uuid4(), None)
        assert exc.value.code == "STATUS_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_create_transition_raises_when_to_not_found(self):
        from_s = _status("A", "unstarted", project_id=PID)
        repo = MagicMock()
        repo.get = AsyncMock(side_effect=[from_s, None])
        svc = ProjectStatusService(repo)
        with pytest.raises(AppError) as exc:
            await svc.create_transition(PID, from_s.id, uuid.uuid4(), None)
        assert exc.value.code == "STATUS_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_create_transition_success(self):
        from_s = _status("A", "unstarted", project_id=PID)
        to_s = _status("B", "started", project_id=PID)
        rule = MagicMock()
        repo = MagicMock()
        repo.get = AsyncMock(side_effect=[from_s, to_s])
        repo.get_transition_by_pair = AsyncMock(return_value=None)
        repo.create_transition = AsyncMock(return_value=rule)
        svc = ProjectStatusService(repo)
        result = await svc.create_transition(PID, from_s.id, to_s.id, None)
        assert result is rule

    @pytest.mark.asyncio
    async def test_delete_transition_raises_when_not_found(self):
        repo = _make_repo(get_transition=None)
        svc = ProjectStatusService(repo)
        with pytest.raises(AppError) as exc:
            await svc.delete_transition(PID, uuid.uuid4())
        assert exc.value.code == "RULE_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_delete_transition_success(self):
        rule = MagicMock()
        rule.project_id = PID
        repo = MagicMock()
        repo.get_transition = AsyncMock(return_value=rule)
        repo.delete_transition = AsyncMock()
        svc = ProjectStatusService(repo)
        await svc.delete_transition(PID, uuid.uuid4())
        repo.delete_transition.assert_awaited_once_with(rule)


class TestSeedEnforcedTransitions:
    def _statuses(self, specs):
        """specs: list of (name, category) in position order."""
        result = []
        for i, (name, cat) in enumerate(specs):
            s = _status(name, cat, project_id=PID, position=i)
            result.append(s)
        return result

    @pytest.mark.asyncio
    async def test_no_op_when_rules_already_exist(self):
        repo = MagicMock()
        repo.list_transitions = AsyncMock(return_value=[MagicMock()])
        repo.create_transition = AsyncMock()
        svc = ProjectStatusService(repo)
        await svc.seed_enforced_transitions(PID)
        repo.create_transition.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_op_when_fewer_than_two_statuses(self):
        repo = MagicMock()
        repo.list_transitions = AsyncMock(return_value=[])
        repo.list_for_project = AsyncMock(return_value=self._statuses([("Only", "unstarted")]))
        repo.create_transition = AsyncMock()
        svc = ProjectStatusService(repo)
        await svc.seed_enforced_transitions(PID)
        repo.create_transition.assert_not_called()

    @pytest.mark.asyncio
    async def test_seeds_linear_chain(self):
        statuses = self._statuses([
            ("To Do", "unstarted"),
            ("In Progress", "started"),
            ("Done", "completed"),
        ])
        created = []
        repo = MagicMock()
        repo.list_transitions = AsyncMock(return_value=[])
        repo.list_for_project = AsyncMock(return_value=statuses)
        repo.create_transition = AsyncMock(side_effect=lambda d: created.append(d) or MagicMock())
        svc = ProjectStatusService(repo)
        await svc.seed_enforced_transitions(PID)
        pairs = [(d["from_status_id"], d["to_status_id"]) for d in created]
        # Linear chain: 0→1, 1→2
        assert (statuses[0].id, statuses[1].id) in pairs
        assert (statuses[1].id, statuses[2].id) in pairs

    @pytest.mark.asyncio
    async def test_seeds_reopen_rule(self):
        statuses = self._statuses([
            ("To Do", "unstarted"),
            ("In Progress", "started"),
            ("Done", "completed"),
        ])
        created = []
        repo = MagicMock()
        repo.list_transitions = AsyncMock(return_value=[])
        repo.list_for_project = AsyncMock(return_value=statuses)
        repo.create_transition = AsyncMock(side_effect=lambda d: created.append(d) or MagicMock())
        svc = ProjectStatusService(repo)
        await svc.seed_enforced_transitions(PID)
        pairs = [(d["from_status_id"], d["to_status_id"]) for d in created]
        # Re-open: Done→In Progress
        assert (statuses[2].id, statuses[1].id) in pairs

    @pytest.mark.asyncio
    async def test_no_reopen_when_no_started_status(self):
        statuses = self._statuses([
            ("To Do", "unstarted"),
            ("Done", "completed"),
        ])
        created = []
        repo = MagicMock()
        repo.list_transitions = AsyncMock(return_value=[])
        repo.list_for_project = AsyncMock(return_value=statuses)
        repo.create_transition = AsyncMock(side_effect=lambda d: created.append(d) or MagicMock())
        svc = ProjectStatusService(repo)
        await svc.seed_enforced_transitions(PID)
        # Only linear chain, no re-open
        assert len(created) == 1
        assert created[0]["from_status_id"] == statuses[0].id
        assert created[0]["to_status_id"] == statuses[1].id


class TestValidateTransition:
    @pytest.mark.asyncio
    async def test_no_op_when_mode_is_open(self):
        repo = _make_repo(allowed_transitions_from=[])
        svc = ProjectStatusService(repo)
        # Should not raise
        await svc.validate_transition(PID, "open", uuid.uuid4(), uuid.uuid4())
        repo.allowed_transitions_from.assert_not_called()

    def _initial_and_other(self):
        initial = _status("To Do", "unstarted", project_id=PID, position=0)
        initial.is_default = True
        other = _status("Done", "completed", project_id=PID, position=1)
        other.is_default = False
        return initial, other

    @pytest.mark.asyncio
    async def test_no_from_status_may_enter_at_initial(self):
        """A task with no custom status (imported / pre-switch) may take the
        workflow's entry point without a rule."""
        initial, other = self._initial_and_other()
        repo = _make_repo(allowed_transitions_from=[], list_for_project=[initial, other])
        svc = ProjectStatusService(repo)
        await svc.validate_transition(PID, "enforced", None, initial.id)
        repo.allowed_transitions_from.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_from_status_cannot_teleport(self):
        """P0 regression: from=None used to skip validation entirely — any
        target was reachable. Now it validates as from-the-initial-status."""
        initial, other = self._initial_and_other()
        repo = _make_repo(allowed_transitions_from=[], list_for_project=[initial, other])
        svc = ProjectStatusService(repo)
        with pytest.raises(AppError) as exc:
            await svc.validate_transition(PID, "enforced", None, other.id)
        assert exc.value.code == "TRANSITION_NOT_ALLOWED"
        repo.allowed_transitions_from.assert_called_once()

    @pytest.mark.asyncio
    async def test_blocks_when_rules_empty(self):
        """Zero rules in Enforced mode = all transitions blocked (restrictive-by-default)."""
        from_id, to_id = uuid.uuid4(), uuid.uuid4()
        repo = _make_repo(allowed_transitions_from=[])
        svc = ProjectStatusService(repo)
        with pytest.raises(AppError) as exc:
            await svc.validate_transition(PID, "enforced", from_id, to_id)
        assert exc.value.code == "TRANSITION_NOT_ALLOWED"

    @pytest.mark.asyncio
    async def test_allows_valid_transition(self):
        from_id, to_id = uuid.uuid4(), uuid.uuid4()
        repo = _make_repo(allowed_transitions_from=[to_id])
        svc = ProjectStatusService(repo)
        await svc.validate_transition(PID, "enforced", from_id, to_id)

    @pytest.mark.asyncio
    async def test_blocks_invalid_transition(self):
        from_id, to_id = uuid.uuid4(), uuid.uuid4()
        other_id = uuid.uuid4()
        repo = _make_repo(allowed_transitions_from=[other_id])
        svc = ProjectStatusService(repo)
        with pytest.raises(AppError) as exc:
            await svc.validate_transition(PID, "enforced", from_id, to_id)
        assert exc.value.code == "TRANSITION_NOT_ALLOWED"
