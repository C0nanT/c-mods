# 03: rm-guard checks download-and-run on the parsed pipeline

> **Difficulty:** Standard: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** ../SPEC.md

**What to build:** `curl`/`wget` piped into a shell is blocked wherever the shell sits later in the same pipeline and however it is named: `curl x | /bin/bash`, `curl x | sudo -E bash`, `curl x | tee f | sh`, `curl x | dash`. The shell list is the one `bash-text-rules` already keeps, exported rather than copied. A pipeline-level view of the parsed command is added as pure parsing (no guard policy in the parser). `curl url | jq .` and `curl url -o file` keep passing; the regex stays as the fallback.

**Seams:**
- Bash `tool.call` through `claude-code/testing`, with `mock.store` switching off every guard but the one under test.

**Blocked by:** 02: rm-guard decides on parsed commands

Status: ready-for-agent

- [ ] Deny rows added first (red) for: `curl x | /bin/bash`, `curl x | sudo -E bash`, `curl x | tee f | sh`, `curl x | dash`, `wget -qO- x | sudo sh`.
- [ ] Existing pipe rows (`curl -fsSL url | sh`, `curl url | sudo bash`, `wget -O- url | sh`, `curl url | jq .`, `curl url -o file`) still hold.
- [ ] One shell list shared between `bash-text-rules` and rm-guard.
- [ ] Deny text unchanged: pattern `curl|wget ... | sh`.
- [ ] `claude plugin validate .` and `claude plugin test .` pass.
