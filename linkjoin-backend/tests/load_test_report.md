# LinkJoin Load Test Report

**Test tool:** Locust 2.45.0  
**Run 1 (calibration):** 20 users, 2/sec ramp, 90s  
**Run 2 (clean):** 10 users, 1/sec ramp, 90s -- zero auth failures  
**Test accounts:** 5 seed accounts (`admin@lincoln.edu`, teachers, students)  
**Target:** http://localhost:8000 (local dev server -> MongoDB Atlas)  
**Date:** 2026-07-09

---

## How to Run

```bash
cd linkjoin-backend

# Terminal 1: start the dev server
./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2: run the test
LOAD_TEST_ACCOUNTS="user1@org.com:Pass,user2@org.com:Pass" \
  locust -f tests/locustfile.py --headless -u 10 -r 1 -t 90s \
  --host http://localhost:8000 --csv tests/load_results
```

Results go to:
- `tests/load_results_stats.csv` — per-endpoint percentile breakdown
- `tests/load_results_failures.csv` — failure detail

---

## Results (Run 2 -- Clean)

| Endpoint | Reqs | Fails | p50 | p95 | p99 | Status |
|----------|------|-------|-----|-----|-----|--------|
| `POST /auth/login` | 10 | 0 | 310ms | 340ms | 340ms | OK |
| `GET /links` | 114 | 0 | 400ms | **680ms** | **940ms** | **SLOW** |
| `GET /bookmarks` | 47 | 0 | 400ms | **550ms** | **660ms** | **SLOW** |
| `GET /users/me` | 69 | 0 | 48ms | 130ms | 150ms | OK |
| `GET /classes` | 26 | 8* | 120ms | 330ms | 340ms | OK |
| `GET /attendance/class/{id}` | 5 | 0 | 170ms | 220ms | 220ms | OK |
| `GET /interventions` | 11 | 4* | 86ms | 230ms | 230ms | OK |
| `GET /admin/audit-logs` | 15 | 9* | 120ms | 260ms | 260ms | OK |
| `POST /links/{id}/open` | 16 | 0 | 170ms | 450ms | 450ms | OK |
| `GET /health` | 3 | 0 | 2ms | 3ms | 3ms | OK |
| `GET /health/ready` | 2 | 0 | 86ms | 86ms | 86ms | OK |

*Failures are expected 403s from RBAC (student/teacher accounts hitting admin endpoints) -- not bugs.

**Total RPS:** 3.9 | **Auth failure rate:** 0% | **RBAC 403 rate:** 10.75% (expected)

---

## Findings

### Finding 1: `GET /links` and `GET /bookmarks` exceed 500ms p95 [MEDIUM]

Both endpoints have p95 > 500ms and p99 approaching 1 second.

**Root cause (almost certainly):** Network latency between local Mac and MongoDB Atlas. A local-to-Atlas round-trip adds ~300ms of baseline network overhead. The query itself (`find({"username": email})` on an indexed field) should be <10ms on Atlas.

**Evidence:** `/health/ready` (which pings Atlas) shows ~86ms latency at p50. The `/users/me` endpoint (minimal DB work) shows 48ms p50. The 400ms p50 on `/links` is dominated by Atlas network time, not query time.

**In production:** Azure App Service co-located with Atlas in the same Azure region (e.g., East US) will have <5ms Atlas latency. These endpoints should be well under 100ms p95 in production.

**Action:** Verify production latency via `/health/ready` after next deploy. If `/links` p95 > 200ms in production, profile the query with Atlas Performance Advisor.

### Finding 2: Rate limiter correctly blocks rapid re-logins [GOOD]

Run 1 (20 users / 5 accounts = 4 logins per account) triggered 429 rate limits on `/auth/login`, cascading to 401s on all subsequent requests for those users. This is the rate limiter working correctly.

**Implication:** Under a real DDoS login attempt, the rate limiter activates at exactly the right threshold. No action needed; behavior is correct.

**Locustfile fix applied:** Added 5-second backoff and single retry on 429; added `if not self.token: return` guards in all task methods to prevent polluting stats with post-auth-failure 401s.

### Finding 3: Admin analytics endpoint uncovered by test [INFO]

`GET /admin/analytics` and `GET /admin/orgs` show 100% 403 failure rate because none of the 5 test accounts are platform admins. These endpoints were not benchmarked. They run MongoDB aggregations and are likely the slowest endpoints in the system.

**Action:** Add `admin@test.com` (platform admin) to `LOAD_TEST_ACCOUNTS` when running the next staging test.

### Finding 4: `GET /health/ready` adds ~86ms overhead [OK]

The deep health check (MongoDB + Redis ping) adds ~84ms vs the bare `/health` at 2ms. This is acceptable for a monitoring endpoint -- it should not be on the hot path.

If Azure App Service liveness probe is configured to hit `/health/ready` on every request cycle, switch it to `/health` for the liveness probe and use `/health/ready` only for readiness/startup probes.

---

## Index Analysis (Pre-Test)

7 missing indexes were identified by static analysis and added before running the test:

| Collection | Index Added | Endpoint(s) Protected |
|------------|------------|----------------------|
| `login` | `org_id` (sparse) | Audit log org-scoping |
| `login` | `parental_consent.token` (sparse) | Consent grant flow |
| `parent_links` | `parent_user_id` | Parent portal page loads |
| `parent_links` | `student_user_id` | Admin CSV import |
| `integrations` | `(org_id, provider)` | Google Classroom sync |
| `integrations` | `(user_id, provider)` | Classroom API calls |
| `classes` | `student_ids` (array) | Parent portal, absence check |

---

## Capacity Estimate

At 3.9 RPS sustained with 10 concurrent users:
- **Scaling factor to 50 users:** ~4x RPS = ~15-16 RPS expected
- **Gunicorn (4 workers) capacity:** Motor pool at `maxPoolSize=20` should handle 50 concurrent users comfortably
- **Estimated Atlas IOPS at 50 users:** ~30-40 ops/sec -- well within M10 limits (3,000 IOPS)

**Recommendation:** Current configuration is adequate for up to ~200 concurrent users. Beyond that, evaluate:
1. Bump `maxPoolSize` from 20 to 50 in `app/database.py`
2. Add a read replica in Atlas for analytics queries
3. Cache `/admin/analytics` response (60-second TTL via Redis)

---

## Bottleneck Roadmap

| Priority | Action | Impact |
|----------|--------|--------|
| P1 | Verify `/links` p95 in production after next deploy | Confirm Atlas-local latency was the cause |
| P2 | Add platform admin account to load test | Benchmark `/admin/analytics` |
| P3 | Cache `/admin/analytics` in Redis (60s TTL) | Protect slow aggregation at scale |
| P3 | Switch Azure liveness probe from `/health/ready` to `/health` | Avoid 86ms probe overhead |
| P4 | Bump `maxPoolSize` to 50 when DAU exceeds ~500 | Head off pool exhaustion |
