# LinkJoin Disaster Recovery Runbook

## Targets

| Metric | Target | Notes |
|--------|--------|-------|
| RTO    | 2 hours | Atlas restore + redeploy |
| RPO    | 24 hours | Atlas daily snapshots (M10+) |
| RPO (enhanced) | 1 hour | Enable Atlas Continuous Cloud Backup on M10+ |

---

## Architecture Summary

| Layer | Service | State |
|-------|---------|-------|
| API   | Azure App Service (Docker) | Stateless - redeploy from image |
| DB    | MongoDB Atlas | Point-in-time backup, managed |
| Cache | Azure Cache for Redis | Ephemeral (rate limits + JTI revocation) |
| Frontend | Vercel/GitHub Pages | Static, re-deploy from git |

---

## Scenario 1: MongoDB Atlas Cluster Unavailable

### Detection
- `GET /health/ready` returns 503
- Azure App Service health check fails; traffic stops routing
- Alert fires from uptime monitor (configure on Atlas / external)

### Recovery Steps

1. **Assess** -- log in to MongoDB Atlas. Check cluster health, event log, ongoing incidents at `status.mongodb.com`.

2. **If Atlas is managing a restore** -- wait. Atlas M10+ handles automatic failover to a secondary within ~30 seconds for replica set failures.

3. **If data restore is needed** (collection drop, accidental deletion):
   ```
   Atlas Console > Cluster > ... > Restore > Point in Time Restore
   ```
   - Choose the timestamp just before the incident.
   - Restore to the **same cluster** (overwrite) or a new cluster.
   - If restoring to a new cluster, update the env var (step 4).

4. **If cluster URI changes** (new cluster):
   ```
   Azure Portal > App Service > Configuration > Application settings
   Set MONGO_URI = <new Atlas connection string>
   Save & Restart
   ```

5. **Verify**:
   ```bash
   curl https://api.linkjoin.xyz/health/ready
   # Expect: {"status":"ok","mongo_ms":<number>,"redis_ms":<number>}
   ```

6. **Run backup check script** to confirm collection counts are sane:
   ```bash
   MONGO_URI=<uri> python scripts/check_backup.py
   ```

**Expected RTO**: 15-60 min for failover, up to 2 h for full restore + redeploy.

---

## Scenario 2: Azure App Service Outage

### Detection
- Frontend shows "Failed to fetch" errors
- Azure Portal shows App Service in "Stopped" or "Degraded" state

### Recovery Steps

1. **Check Azure status** at `status.azure.com`. If regional outage, initiate cross-region failover.

2. **Redeploy from Docker image** (CI pushes to registry on every merge to main):
   ```
   Azure Portal > App Service > Deployment Center > Redeploy latest
   ```
   Or via CLI:
   ```bash
   az webapp restart --name linkjoin-api --resource-group linkjoin-rg
   ```

3. **If container registry is unreachable**, pull image locally and push to alternative registry, then update App Service image source.

4. **Verify** via `/health/ready` and smoke-test login.

**Expected RTO**: 10-30 minutes.

---

## Scenario 3: Redis Cache Unavailable

Redis only stores:
- Rate limit counters (per-IP, per-user)
- JTI token revocation entries

**Impact of Redis loss**: Rate limits reset (briefly permissive), revoked tokens become valid until natural expiry (max 15 minutes).

### Recovery Steps

1. Azure Cache for Redis has automatic geo-replication on Premium tier. For Basic/Standard, failover is manual.

2. Force all active sessions to re-authenticate (clears revocation exposure window):
   ```bash
   # Update JWT secret to invalidate all existing tokens
   Azure Portal > App Service > Configuration
   Set JWT_SECRET = <new random 64-char hex>
   Save & Restart
   ```
   Note: this logs out all users. Use only if revocation integrity is critical.

3. Redis auto-reconnects once the cache service is restored -- no code change needed.

**Expected RTO**: ~5 minutes (cache auto-reconnects or Azure restores within SLA).

---

## Scenario 4: Accidental Data Deletion

### Student/user records deleted

1. Identify the deletion timestamp from audit_logs:
   ```
   db.audit_logs.find({action: /delete/}).sort({ts: -1}).limit(20)
   ```

2. Use Atlas Point-in-Time Restore to restore the `login` collection to a time before the deletion.
   - Restore to a **staging cluster** first.
   - Export the affected documents with `mongoexport`.
   - Import into production with `mongoimport --mode=upsert`.

### Links collection corrupted

Same process using the `links` collection. Links are user-owned and non-PII, so the restoration window is more flexible.

---

## Weekly Backup Health Check

An APScheduler job (`backup-health-check`) runs every Sunday at 02:00 UTC and:
- Pings MongoDB (measures latency)
- Counts documents in all core collections
- Writes a `backup.health_check` audit event with the result

Review via the Audit Log tab in the Platform Admin dashboard.

Manual run:
```bash
cd linkjoin-backend
MONGO_URI=<uri> python scripts/check_backup.py
```

---

## Post-Incident Actions

1. Write a timeline entry in the incident record (Platform Admin > Incidents tab).
2. Resolve the incident when service is fully restored.
3. File a blameless post-mortem within 48 hours covering: timeline, root cause, remediation, and follow-up action items.
4. If RPO/RTO targets were missed, open a ticket to evaluate Atlas Continuous Cloud Backup upgrade.
