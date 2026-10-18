# 02: Table-driven tests for rm, git and secret guards

> **Difficulty:** Standard: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** ../SPEC.md

**What to build:** The same table shape for the rm, git and secret guards, so every Bash guard has its coverage visible as allowed and denied commands side by side.

**Seams:** The event-level seam through `claude-code/testing`: fire a Bash tool event at the registered hooks and assert deny or pass plus the message.

**Blocked by:** 01

Status: done

- [x] One table per guard, same row shape as the dotenv table
- [x] Allowed and denied rows sit together per guard
- [x] Existing cases are migrated, none lost
- [x] validate and test pass
