# 03: Grep tool guarded by its path

> **Difficulty:** Light: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** ../SPEC.md

**What to build:** `dotenv-guard` also covers the Grep tool. It checks only Grep's `path` input against the same `.env` path rule the file tools use, and never the `pattern`. The deny message uses the file-tool format with that path.

**Seams:**
- The tool call, fired with `$.tool.call` from `claude-code/testing`, with `mock.store`

**Blocked by:** None (can start immediately)

Status: ready-for-human

- [x] Grep with `path` `/project/.env` or `/project/.env.local` is denied with the file-tool message
- [x] Grep with `path` `/project/.env.example` passes
- [x] Grep with `pattern` `.env` and a directory `path` passes
- [x] The existing test asserting Grep is outside the guard is replaced by these cases
- [x] The `dotenv-guard` toggle off lets Grep through
- [x] README `dotenv-guard` row lists Grep (by `path`)
