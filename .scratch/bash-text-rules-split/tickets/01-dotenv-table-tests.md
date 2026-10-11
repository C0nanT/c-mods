# 01: Table-driven tests for dotenv-guard

> **Difficulty:** Standard: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** ../SPEC.md

**What to build:** One table of `command -> expected deny|pass (+ message fragment)` drives the dotenv guard through the Bash event seam. The three recent fixes (`.` arguments, quoted wildcards, existence checks) and the mention-only cases from the old TODO are rows. Adding a regression is one row.

**Seams:** The event-level seam through `claude-code/testing`: fire a Bash tool event at the registered hooks and assert deny or pass plus the message.

**Blocked by:** None (can start immediately)

Status: ready-for-human

- [x] A dotenv table exists and runs through the event seam
- [x] Rows cover real access to the env file (denied) and mere mentions (passed)
- [x] The three recent fixes are rows
- [x] Existing dotenv tests are folded into the table where they duplicate rows
- [x] validate and test pass
