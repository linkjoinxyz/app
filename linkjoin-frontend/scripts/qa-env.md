# Throwaway QA environment

For auditing routes behind `PrivateRoute` (`npm run audit:viewport` with
`QA_EMAIL` / `QA_PASSWORD`) without touching real data.

**Never point this at the Atlas cluster.** `linkjoin-backend/.env` is the
production database and `.env.test` is the same cluster isolated only by
database name. The steps below use a disposable Mongo container instead, so a
mistyped database name cannot reach production data.

```bash
# 1. Disposable Mongo (27018 so it can't collide with anything local)
docker run -d --name lj-mongo-test -p 27018:27017 mongo:7

# 2. Backend against it. Secrets (JWT_SECRET, ENCRYPT_KEY, ...) still come from
#    .env; only the database target is overridden.
cd linkjoin-backend
MONGO_URI="mongodb://localhost:27018" MONGO_DATABASE="linkjoin_localdev" ENVIRONMENT="local" \
  venv/bin/python -m uvicorn app.main:app --port 8001 --host 127.0.0.1

# 3. Frontend pointed at that backend
cd linkjoin-frontend
VITE_PROXY_TARGET=http://localhost:8001 npx vite --port 5174

# 4. Create the account. Registration sets confirmed:"false" and every data
#    route requires a confirmed user, so flip it directly.
curl -s -X POST http://localhost:8001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"qa.viewport@example.com","password":"QaViewport!2026","offset":0,"timezone":"America/Los_Angeles"}'

docker exec lj-mongo-test mongosh linkjoin_localdev --quiet --eval \
  'db.login.updateOne({username:"qa.viewport@example.com"},{$set:{confirmed:"true",onboarding_done:true}})'

# 5. Role fixtures: school org, attendance history, parent accounts.
#    All three refuse to run without an explicit MONGO_DATABASE.
cd linkjoin-backend
set -a; source .env; set +a          # secrets only; the two vars below win
for s in seed_school.py seed_attendance.py seed_parents.py; do
  MONGO_URI="mongodb://localhost:27018" MONGO_DATABASE="linkjoin_localdev" venv/bin/python $s
done

# Platform admin has no seed script; flag one by hand.
curl -s -X POST http://localhost:8001/auth/register -H "Content-Type: application/json" \
  -d '{"email":"qa.platform@example.com","password":"QaViewport!2026","offset":0,"timezone":"America/Los_Angeles"}'
docker exec lj-mongo-test mongosh linkjoin_localdev --quiet --eval \
  'db.login.updateOne({username:"qa.platform@example.com"},{$set:{confirmed:"true",admin:"true",onboarding_done:true}})'

# 6. Audit. QA_ROLES=1 adds the role-gated pages (needs step 5).
QA_EMAIL=qa.viewport@example.com QA_PASSWORD='QaViewport!2026' QA_ROLES=1 \
  node scripts/audit-viewport.mjs http://localhost:5174
```

Seeded logins (all `Test1234!`): `admin@lincoln.edu` (school_admin),
`ms.chen@lincoln.edu` (teacher), `emma.wilson@student.lincoln.edu` (student),
`david.wilson@gmail.com` (parent).

Seed at least one record with a deliberately long name and a long URL. Empty
list pages have nothing to overflow, so they pass without testing anything.

Teardown: `docker rm -f lj-mongo-test` and stop the two dev servers.
