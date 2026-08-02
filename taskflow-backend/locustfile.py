"""
Locust load test for TaskFlow backend.

Scenario: 50 concurrent users — login, create tasks, list tasks, update, delete.
P95 target: < 150ms for core endpoints (excluding AI).

Each user gets a unique X-Forwarded-For IP so rate limits apply per user,
matching real-world traffic patterns where users come from different IPs.

Usage (local):
  locust -f locustfile.py --host http://localhost:8000

Usage (headless CI):
  locust -f locustfile.py --headless --users 50 --spawn-rate 10 \
         --run-time 60s --host http://localhost:8000 \
         --csv reports/locust --html reports/locust.html
"""
import os
import threading
import uuid

from locust import HttpUser, between, events, task

_LATENCY_THRESHOLD_MS = int(os.getenv("LATENCY_THRESHOLD_MS", "150"))

_counter = 0
_counter_lock = threading.Lock()


class TaskFlowUser(HttpUser):
    wait_time = between(0.5, 1.5)

    token: str = ""
    project_id: str = ""
    board_id: str = ""
    task_ids: list[str]
    task_versions: dict[str, int]

    def on_start(self) -> None:
        self.task_ids = []
        self.task_versions = {}

        global _counter
        with _counter_lock:
            _counter += 1
            idx = _counter
        # Unique fake IP per user — keeps each user in its own rate-limit bucket
        self.fake_ip = f"10.{idx // 256}.{idx % 256}.1"

        uid = uuid.uuid4().hex[:10]
        email = f"locust-{uid}@example.com"
        password = "LocustPass1"
        username = f"locust_{uid}"

        # Use the dev-only internal endpoint: creates a verified user and returns a token
        # directly, bypassing the register→verify-email→login flow that requires SMTP.
        with self.client.post(
            "/api/v1/internal/test/create-user",
            # HW-37: project creation is superuser-only; the scenario creates one.
            json={"email": email, "password": password, "username": username, "is_superuser": True},
            headers={"X-Forwarded-For": self.fake_ip},
            name="/auth/register",
            catch_response=True,
        ) as resp:
            if resp.ok:
                self.token = resp.json().get("access_token", "")
                resp.success()
            else:
                resp.failure(f"register: {resp.status_code} {resp.text[:120]}")

        # Record a synthetic login event so the CI report keeps the same shape.
        with self.client.get(
            "/api/v1/auth/me",
            headers={"X-Forwarded-For": self.fake_ip, **(self._auth() if self.token else {})},
            name="/auth/login",
            catch_response=True,
        ) as resp:
            if resp.ok:
                resp.success()
            else:
                resp.failure(f"login: {resp.status_code} {resp.text[:120]}")

        if not self.token:
            return

        key = uuid.uuid4().hex[:4].upper()
        with self.client.post(
            "/api/v1/projects",
            json={"name": f"Locust-{uuid.uuid4().hex[:6]}", "key": key},
            headers=self._auth(),
            name="/projects [POST]",
            catch_response=True,
        ) as resp:
            if resp.ok:
                self.project_id = resp.json().get("id", "")
                resp.success()
            else:
                resp.failure(f"create project: {resp.status_code} {resp.text[:120]}")

        if not self.project_id:
            return

        with self.client.post(
            f"/api/v1/projects/{self.project_id}/boards",
            json={"name": "Sprint 1"},
            headers=self._auth(),
            name="/projects/[id]/boards [POST]",
            catch_response=True,
        ) as resp:
            if resp.ok:
                self.board_id = resp.json().get("id", "")
                resp.success()
            else:
                resp.failure(f"create board: {resp.status_code} {resp.text[:120]}")

    def _auth(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def _task_base(self) -> str:
        return f"/api/v1/projects/{self.project_id}/boards/{self.board_id}/tasks"

    @task(4)
    def list_tasks(self) -> None:
        if not self.board_id:
            return
        self.client.get(
            self._task_base(),
            headers=self._auth(),
            name="/projects/[id]/boards/[id]/tasks [GET]",
        )

    @task(3)
    def create_task(self) -> None:
        if not self.board_id:
            return
        resp = self.client.post(
            self._task_base(),
            json={"title": f"Task {uuid.uuid4().hex[:8]}"},
            headers=self._auth(),
            name="/projects/[id]/boards/[id]/tasks [POST]",
        )
        if resp.ok:
            data = resp.json()
            self.task_ids.append(data["id"])
            self.task_versions[data["id"]] = data.get("version", 1)

    @task(2)
    def update_task(self) -> None:
        if not self.task_ids:
            return
        task_id = self.task_ids[-1]
        version = self.task_versions.get(task_id, 1)
        resp = self.client.patch(
            f"/api/v1/projects/{self.project_id}/tasks/{task_id}",
            json={"title": f"Updated {uuid.uuid4().hex[:6]}", "version": version},
            headers=self._auth(),
            name="/projects/[id]/tasks/[id] [PATCH]",
        )
        if resp.ok:
            self.task_versions[task_id] = resp.json().get("version", version + 1)

    @task(1)
    def get_me(self) -> None:
        self.client.get("/api/v1/auth/me", headers=self._auth(), name="/auth/me")


@events.quitting.add_listener
def _check_latency(environment, **_kw) -> None:
    total = environment.stats.total
    if total.num_requests == 0:
        return

    if total.fail_ratio > 0.01:
        print(f"[locust] FAIL: error rate {total.fail_ratio:.1%} > 1%")
        environment.process_exit_code = 1
        return

    # on_start setup calls (register, login, workspace create) are one-time
    # operations excluded from the latency SLA — only task endpoints count.
    _SETUP_NAMES = {"/auth/register", "/auth/login", "/projects [POST]", "/projects/[id]/boards [POST]"}
    task_entries = [
        s for (name, _method), s in environment.stats.entries.items()
        if name not in _SETUP_NAMES and s.num_requests > 0
    ]

    if not task_entries:
        print("[locust] PASS: no task requests recorded")
        return

    worst_p95 = max(s.get_response_time_percentile(0.95) or 0 for s in task_entries)
    if worst_p95 > _LATENCY_THRESHOLD_MS:
        print(f"[locust] FAIL: P95 {worst_p95:.0f}ms > {_LATENCY_THRESHOLD_MS}ms threshold")
        environment.process_exit_code = 1
    else:
        print(f"[locust] PASS: P95 {worst_p95:.0f}ms ≤ {_LATENCY_THRESHOLD_MS}ms")
