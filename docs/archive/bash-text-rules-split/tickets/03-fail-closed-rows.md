# 03: Fail-closed rows for unparsable shapes

> **Difficulty:** Standard: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** ../SPEC.md

**What to build:** One row per shape the parser cannot read with confidence (unterminated quote, odd heredoc, nested substitution...). Each must be denied by the guards, so a parser refactor cannot open a hole unnoticed.

**Seams:** The event-level seam through `claude-code/testing`: fire a Bash tool event at the registered hooks and assert deny or pass plus the message.

**Blocked by:** 01

Status: done

- [x] A row per unparsable shape, each asserting deny
- [x] Rows cover every path where the parser returns the whole command
- [x] validate and test pass
