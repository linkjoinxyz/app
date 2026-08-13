## GBrain Configuration (configured by /setup-gbrain)
- Mode: local-stdio
- Engine: pglite
- Config file: ~/.gbrain/config.json (mode 0600)
- Setup date: 2026-07-06
- MCP registered: yes (user scope, /Users/sethraphael/.bun/bin/gbrain serve)
- Artifacts sync: off
- Current repo policy: read-write (github.com/linkjoinxyz/app)
- Code source: gstack-code-linkjoin → /Users/sethraphael/PycharmProject/linkjoin
- Pages indexed: 494 total (359 code); last code sync 2026-07-23 at commit f78f5fe on `dev`
- Sync command: ALWAYS `gbrain sync --strategy code`. A bare `gbrain sync` uses the docs strategy here and would PRUNE the code index (marks ~60 code pages "un-syncable" and deletes them). After a large sync, also run `gbrain embed --stale` and `gbrain extract --stale --source-id gstack-code-linkjoin`.
- Known issue: the v0.11.0 "Minions" migration is stuck failing (`column "event_page_id" does not exist`, prints on every command). It is unrelated to code sync (sync works despite the warning) and re-running `apply-migrations` does not fix it — escalate to gbrain, do not block on it.

## GBrain Search Guidance (configured by /sync-gbrain)
<!-- gstack-gbrain-search-guidance:start -->

GBrain is set up and synced on this machine. Prefer gbrain over Grep when
the question is semantic or when you don't know the exact identifier yet.

Prefer gbrain when:
- "Where is X handled?" / semantic intent, no exact string yet:
    `gbrain search "<terms>" --source gstack-code-linkjoin`
    or `gbrain query "<question>"`
- "Where is symbol Y defined?" / symbol-based code questions:
    `gbrain code-def <symbol>` or `gbrain code-refs <symbol>`
- "What calls Y?" / "What does Y depend on?":
    `gbrain code-callers <symbol>` / `gbrain code-callees <symbol>`
- "What did we decide last time?" / past plans, retros, learnings:
    `gbrain search "<terms>" --source brain-docs`

Grep is still right for known exact strings, regex, multiline patterns, and
file globs. Run `gbrain sync --repo /Users/sethraphael/PycharmProject/linkjoin --strategy code`
to refresh the index after significant changes.

<!-- gstack-gbrain-search-guidance:end -->

## Deployment
- Backend: `linkjoin-backend` only, built and pushed by `.github/workflows/deploy-backend.yml` (gated on Test Backend passing on `main`), then restarted manually in Azure App Service.
- Frontend: `linkjoin-frontend` on Vercel.
- The legacy root Starlette app (`app/`, `templates/`, `static/`, root `Procfile`/`Dockerfile`) was deleted 2026-08-13. It hardcoded the production database with no leader lock and no send dedup, so running it locally double-sent real reminder texts.
## Frontend Verification
- When confirming account/DB state, check for cached localStorage that may cause the frontend to show stale data, and note this to the user.
## Billing & Rate Limits
- Never modify settings.json model/billing configuration to resolve rate-limit errors; this can silently switch from subscription to API billing. Report 429 errors to the user instead of attempting billing workarounds.
## Knowledge Persistence
- Sync project knowledge and decisions to gbrain at the end of sessions.
