"""
LinkJoin load test suite.

Usage (with explicit account list):
    cd linkjoin-backend
    LOAD_TEST_ACCOUNTS="user1@x.com:pass1,user2@x.com:pass2" \
      locust -f tests/locustfile.py --headless -u 20 -r 2 -t 90s \
      --host http://localhost:8000 --csv tests/load_results

Usage (suffix mode — requires pre-created accounts like base+0@domain):
    LOAD_TEST_EMAIL=testuser@test.com LOAD_TEST_PASSWORD=Test1234! \
      locust -f tests/locustfile.py --headless -u 50 -r 5 -t 90s \
      --host http://localhost:8000 --csv tests/load_results

Environment variables:
    LOAD_TEST_ACCOUNTS  Comma-separated email:password pairs (overrides EMAIL/PASSWORD/USERS)
    LOAD_TEST_EMAIL     Base email; user index appended as suffix (default: loadtest@example.com)
    LOAD_TEST_PASSWORD  Password for all test accounts (default: Test1234!)
    LOAD_TEST_USERS     Number of distinct test accounts to rotate across (default: 5)
"""

import os
import random
import time
from locust import HttpUser, task, between, events

_ACCOUNTS_RAW = os.getenv("LOAD_TEST_ACCOUNTS", "")
_ACCOUNT_LIST: list[tuple[str, str]] = []
if _ACCOUNTS_RAW:
    for entry in _ACCOUNTS_RAW.split(","):
        entry = entry.strip()
        if ":" in entry:
            e, p = entry.split(":", 1)
            _ACCOUNT_LIST.append((e.strip(), p.strip()))

BASE_EMAIL = os.getenv("LOAD_TEST_EMAIL", "loadtest@example.com")
PASSWORD = os.getenv("LOAD_TEST_PASSWORD", "Test1234!")
NUM_USERS = int(os.getenv("LOAD_TEST_USERS", "5"))

_pool_index = 0


def _next_credentials() -> tuple[str, str]:
    global _pool_index
    idx = _pool_index
    _pool_index += 1
    if _ACCOUNT_LIST:
        return _ACCOUNT_LIST[idx % len(_ACCOUNT_LIST)]
    local, domain = BASE_EMAIL.split("@", 1)
    email = f"{local}+{idx % NUM_USERS}@{domain}"
    return email, PASSWORD


class _AuthMixin:
    """Shared login logic — authenticates once in on_start and caches the token."""

    token: str = ""
    user_email: str = ""
    _class_id: str = ""
    _link_ids: list = []

    def on_start(self):
        import time as _t
        email, password = _next_credentials()
        self.user_email = email
        # Back off and retry once if rate-limited
        for attempt in range(2):
            with self.client.post(
                "/auth/login",
                json={"email": email, "password": password},
                catch_response=True,
            ) as resp:
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("mfa_required"):
                        resp.failure("MFA required for load test account — disable MFA on test accounts")
                        return
                    self.token = data.get("access_token", "")
                    resp.success()
                    return
                elif resp.status_code == 429 and attempt == 0:
                    resp.success()  # don't log rate limit as a failure on first attempt
                    _t.sleep(5)
                    continue
                elif resp.status_code == 401:
                    resp.failure(f"Auth failed for {email} — check test account credentials")
                    return
                else:
                    resp.failure(f"Login returned {resp.status_code}")
                    return

    def _auth_headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}


class PersonalUser(_AuthMixin, HttpUser):
    """
    Simulates a regular (non-institutional) user.
    Workload: browse links, check profile, occasionally open a link.
    Weight 60 — the most common user type.
    """
    weight = 60
    wait_time = between(1, 3)

    def on_start(self):
        super().on_start()
        if self.token:
            self._fetch_links()

    def _fetch_links(self):
        with self.client.get("/links", headers=self._auth_headers(), catch_response=True, name="/links") as r:
            if r.status_code == 200:
                links = r.json().get("links", [])
                self._link_ids = [lnk["id"] for lnk in links if "id" in lnk][:10]
                r.success()

    @task(5)
    def get_links(self):
        if not self.token: return
        self.client.get("/links", headers=self._auth_headers(), name="/links")

    @task(3)
    def get_me(self):
        if not self.token: return
        self.client.get("/users/me", headers=self._auth_headers(), name="/users/me")

    @task(1)
    def open_link(self):
        if not self.token or not self._link_ids: return
        link_id = random.choice(self._link_ids)
        self.client.post(
            f"/links/{link_id}/open",
            headers=self._auth_headers(),
            name="/links/{id}/open",
        )

    @task(2)
    def get_bookmarks(self):
        if not self.token: return
        self.client.get("/bookmarks", headers=self._auth_headers(), name="/bookmarks")


class TeacherUser(_AuthMixin, HttpUser):
    """
    Simulates a school teacher or admin.
    Workload: class management, attendance queries, audit log browsing.
    Weight 30.
    """
    weight = 30
    wait_time = between(2, 4)

    def on_start(self):
        super().on_start()
        self._fetch_classes()

    def _fetch_classes(self):
        with self.client.get("/classes", headers=self._auth_headers(), catch_response=True, name="/classes") as r:
            if r.status_code == 200:
                classes = r.json() if isinstance(r.json(), list) else []
                if classes:
                    self._class_id = classes[0].get("class_id", "")
                r.success()

    @task(4)
    def get_classes(self):
        if not self.token: return
        self.client.get("/classes", headers=self._auth_headers(), name="/classes")

    @task(3)
    def get_links(self):
        if not self.token: return
        self.client.get("/links", headers=self._auth_headers(), name="/links")

    @task(2)
    def get_attendance(self):
        if not self.token or not self._class_id: return
        self.client.get(
            f"/attendance/class/{self._class_id}",
            headers=self._auth_headers(),
            name="/attendance/class/{id}",
        )

    @task(1)
    def get_audit_logs(self):
        if not self.token: return
        self.client.get(
            "/admin/audit-logs?page=1&limit=50",
            headers=self._auth_headers(),
            name="/admin/audit-logs",
        )

    @task(2)
    def get_interventions(self):
        if not self.token: return
        self.client.get("/interventions", headers=self._auth_headers(), name="/interventions")


class PlatformAdminUser(_AuthMixin, HttpUser):
    """
    Simulates a platform-level administrator.
    Workload: org management, analytics, audit logs.
    Weight 10 — least common, most expensive queries.
    """
    weight = 10
    wait_time = between(3, 5)

    @task(3)
    def get_orgs(self):
        self.client.get("/admin/orgs", headers=self._auth_headers(), name="/admin/orgs")

    @task(2)
    def get_analytics(self):
        self.client.get("/admin/analytics", headers=self._auth_headers(), name="/admin/analytics")

    @task(1)
    def get_audit_logs(self):
        self.client.get(
            "/admin/audit-logs?page=1&limit=50",
            headers=self._auth_headers(),
            name="/admin/audit-logs",
        )

    @task(1)
    def get_health(self):
        self.client.get("/health", name="/health")

    @task(1)
    def get_health_ready(self):
        self.client.get("/health/ready", name="/health/ready")


@events.quitting.add_listener
def on_quitting(environment, **kwargs):
    """Print a brief summary to stdout for capture in CI."""
    stats = environment.runner.stats
    print("\n=== LinkJoin Load Test Summary ===")
    for name, entry in sorted(stats.entries.items()):
        if entry.num_requests == 0:
            continue
        p95 = entry.get_response_time_percentile(0.95) or 0
        p99 = entry.get_response_time_percentile(0.99) or 0
        flag = " [SLOW]" if p95 > 500 else ""
        print(
            f"  {name[1]:40s}  reqs={entry.num_requests:5d}  "
            f"fail={entry.num_failures:4d}  "
            f"med={entry.median_response_time:5.0f}ms  "
            f"p95={p95:5.0f}ms  p99={p99:5.0f}ms{flag}"
        )
    total_rps = stats.total.current_rps
    total_fail_pct = (
        stats.total.num_failures / stats.total.num_requests * 100
        if stats.total.num_requests > 0 else 0
    )
    print(f"\n  Total RPS: {total_rps:.1f}  Failure rate: {total_fail_pct:.2f}%")
    print("=================================\n")
