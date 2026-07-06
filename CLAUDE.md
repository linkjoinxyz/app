## GBrain Configuration (configured by /setup-gbrain)
- Mode: local-stdio
- Engine: pglite
- Config file: ~/.gbrain/config.json (mode 0600)
- Setup date: 2026-07-06
- MCP registered: yes (user scope, /Users/sethraphael/.bun/bin/gbrain serve)
- Artifacts sync: off
- Current repo policy: read-write (github.com/linkjoinxyz/app)
- Code source: gstack-code-linkjoin → /Users/sethraphael/PycharmProject/linkjoin
- Pages indexed: 226 (linkjoin-frontend + linkjoin-backend)

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
