# 02: rm-guard decides on parsed commands

> **Difficulty:** Heavy: **suggested model:** Opus (Claude Code) / Opus or the strongest reasoning model available (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** ../SPEC.md

**What to build:** `rm -rf` on a dangerous target and `chmod -R 777` are blocked in every shell shape Claude writes: `if`/`then`, `{ }`, `( )`, `$( )`, backticks, `time`, `!`, loops, `/bin/rm`, `\rm`, mid-word quotes such as `rm -rf "$HOME"/`. rm-guard reads the shared parser's simple commands with the program compared by basename; its current split remains only for commands the parser cannot read. In-project relative paths keep passing, and the deny text is unchanged.

**Seams:**
- Bash `tool.call` through `claude-code/testing`, with `mock.store` switching off every guard but the one under test.

**Blocked by:** 01: Each Bash guard's tests prove that guard alone

Status: ready-for-agent

- [ ] Deny rows added first (red) for: `time rm -rf /`, `if true; then rm -rf ~; fi`, `for d in x; do rm -rf ~; done`, `{ rm -rf ~; }`, `(rm -rf ~)`, `echo $(rm -rf ~)`, `` echo `rm -rf ~` ``, `! rm -rf /`, `/bin/rm -rf ~`, `\rm -rf ~`, `rm -rf "$HOME"/`, `time chmod -R 777 .`.
- [ ] All existing rm-guard rows (deny and pass) still hold.
- [ ] The unparsable-shapes tests for rm-guard stay green (fallback still fails closed).
- [ ] rm-guard's matcher keeps its signature; `register.ts` is unchanged.
- [ ] Deny text unchanged: `BLOCKED: '<command>' matches dangerous pattern 'rm -rf <dangerous target>'. …`.
- [ ] `sudo -u root rm -rf /` is no worse than today (still out of scope).
- [ ] `claude plugin validate .` and `claude plugin test .` pass.
