# 01: Each Bash guard's tests prove that guard alone

> **Difficulty:** Standard: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** ../SPEC.md

**What to build:** The maintainer can trust a green run: rm-guard's and git-guard's Bash row tests run with the other three guards switched off and check the deny against the guard's own pattern, and each of the four Bash guards has a fail-closed test that only it reaches. Removing any one guard's fail-closed catch makes CI red. Prefactor for tickets 02-04; no production behaviour changes.

**Seams:**
- Bash `tool.call` through `claude-code/testing`, with `mock.store` switching off every guard but the one under test.

**Blocked by:** None (can start immediately)

Status: ready-for-human

- [x] rm-guard row tests run with git, dotenv and secret guards off; deny rows assert rm-guard's pattern name.
- [x] git-guard row tests run with dotenv, secret and rm guards off; deny rows assert git-guard's pattern.
- [x] One fail-closed Bash test per guard (git, dotenv, secret, rm), each asserting the exact `c-mods: <guard> failed, command blocked.` text.
- [x] Temporarily removing each Bash handler's fail-closed catch fails that guard's test (checked by hand, not committed).
- [x] The existing rows and the unparsable-shapes tests stay green.
- [x] `claude plugin validate .` and `claude plugin test .` pass.
