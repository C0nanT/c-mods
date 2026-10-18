# 04: Split the shell parser from the path rules

> **Difficulty:** Heavy: **suggested model:** Opus (Claude Code) / Opus (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** ../SPEC.md

**What to build:** Separate the shell-text parsing (tokenizing, quotes, heredocs, inert spans, simple-command extraction) from what guards decide on the parsed commands. Pure on both sides, no `$`, same exported interface for consumers, zero behaviour change. The tables from 01 to 03 are the safety net. Any bug found is a new row and a separate fix commit.

**Seams:** The event-level seam through `claude-code/testing`: fire a Bash tool event at the registered hooks and assert deny or pass plus the message.

**Blocked by:** 01, 02, 03

Status: done

- [x] Parser and rules live in separate modules with no `claude-code` imports and no `$`
- [x] Guards import only what they use
- [x] All tables from 01 to 03 pass unchanged
- [x] `claude plugin validate .` and `claude plugin test .` pass
- [x] No behaviour change in the diff of test expectations
