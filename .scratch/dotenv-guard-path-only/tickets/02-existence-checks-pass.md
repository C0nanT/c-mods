# 02: Existence checks on .env pass

> **Difficulty:** Standard: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** ../SPEC.md

**What to build:** when a simple command's program is `test`, `[` or `ls`, its arguments are not checked by `dotenv-guard`, so the agent can check whether `.env` exists. Redirect targets of those commands are still checked, and every other command in the same line is checked normally. `[[` is not part of this ticket (see the spec's Further Notes).

**Seams:**
- The tool call, fired with `$.tool.call` from `claude-code/testing`, with `mock.store`

**Blocked by:** 01: Bash blocks only words that are .env paths

Status: ready-for-human

- [x] Passes: `test -e .env`, `[ -f .env ] && echo exists`, `ls .env*`, `ls -la .env`
- [x] Blocks: `ls .env && cat .env`, `ls > .env`, `[ -f .env ] && source .env`
- [x] README `dotenv-guard` row mentions that existence checks pass
