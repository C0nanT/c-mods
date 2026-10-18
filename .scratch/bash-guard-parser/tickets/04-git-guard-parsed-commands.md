# 04: git-guard decides on parsed commands

> **Difficulty:** Heavy: **suggested model:** Opus (Claude Code) / Opus or the strongest reasoning model available (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** ../SPEC.md

**What to build:** Destructive git commands are blocked however their flags are spelled or ordered, behind any global option, and with the program or subcommand quoted. git-guard reads the shared parser's simple commands: program basename `git`, global options skipped (value-taking ones consume the next word), then subcommand plus arguments decide (`push`; `reset` with `--hard` anywhere; `clean` with any force spelling; `branch` with `-D` or delete+force; `checkout`/`restore` with a lone `.` pathspec anywhere; `rm` without `--cached`). The regex list remains as the fallback for commands the parser cannot read. Deny text is unchanged; parsed matches report the existing pattern string closest to what matched.

**Seams:**
- Bash `tool.call` through `claude-code/testing`, with `mock.store` switching off every guard but the one under test.

**Blocked by:** 01: Each Bash guard's tests prove that guard alone

Status: ready-for-agent

- [ ] Deny rows added first (red) for: `git clean -xdf`, `git clean -d -f`, `git clean --force`, `git reset HEAD~1 --hard`, `git reset -q --hard`, `git checkout HEAD -- .`, `git restore -s HEAD .`, `git branch --delete --force x`, `git branch -d -f x`, `git -P push`, `git --bare push`, `git --work-tree /x push origin main`, `git --git-dir /r push`, `"git" push`, `git p""ush`.
- [ ] All existing git-guard rows (deny and pass) still hold, including `git restore .env.example`, `git checkout .github/workflows/ci.yml`, `git branch -d feature`, `git rm --cached …`, `git reset --soft HEAD~1`.
- [ ] The unparsable-shapes tests for git-guard stay green.
- [ ] git-guard's matcher keeps its signature; `register.ts` is unchanged.
- [ ] The bare `push --force` / `reset --hard` rows and `clean -fd` stay in the fallback list (removal is later work), and no parsed decision depends on them.
- [ ] `claude plugin validate .` and `claude plugin test .` pass.
