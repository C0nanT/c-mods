# Bash guards decide on parsed commands

Status: ready-for-agent

Source: tech-debt map `.scratch/tech-debt-map/bash-guards/2026-10-18.md`, rows 4, 1, 5, 2. Assumed-confirmed (user moved on to `/to-tickets` without correcting): row 5 in scope, row 8 out; one seam; deny text unchanged.

## Problem Statement

The c-mods user relies on rm-guard and git-guard to stop Claude from wiping their home directory, discarding their work tree or pushing. README promises "rm -rf (any flag spelling) … each part of a compound line is checked" and git commands blocked "even with global options before the subcommand". Neither holds:

- rm-guard splits the command its own way, so `time rm -rf /`, `{ rm -rf ~; }`, `(rm -rf ~)`, `if true; then rm -rf ~; fi`, `echo $(rm -rf ~)`, `/bin/rm -rf ~`, `\rm -rf ~` and `rm -rf "$HOME"/` run unblocked. Its curl-to-shell check misses `curl x | /bin/bash`, `curl x | sudo -E bash` and `curl x | tee f | sh`.
- git-guard matches fixed strings on the raw text, so `git clean -xdf`, `git clean -d -f`, `git clean --force`, `git reset HEAD~1 --hard`, `git reset -q --hard`, `git checkout HEAD -- .`, `git restore -s HEAD .`, `git branch --delete --force x`, `git -P push`, `git --bare push`, `"git" push` and `git p""ush` run unblocked.
- The maintainer cannot trust green CI on these guards: the Bash row tests run with all four guards on and accept any deny of the shared shape, and only git-guard's fail-closed path is really tested for Bash. A guard can fail open (a throwing handler without its catch lets the call run) with every test passing.

## Solution

rm-guard and git-guard decide on the shell's own reading of the command (the shared parser's simple commands, quotes removed, wrappers and groupings handled, program by basename), the way dotenv-guard already does. Their current string matching stays as the fallback when the parser gives up, so unparsable commands keep failing closed. Each guard's tests prove that guard, alone, denies or passes, and each guard's fail-closed path is tested on its own.

Deny messages are unchanged for the user and for Claude.

## User Stories

1. As a c-mods user, I want `rm -rf /` blocked inside `if`/`then`, so that a conditional Claude writes cannot wipe my disk.
2. As a c-mods user, I want `rm -rf ~` blocked inside `{ …; }` brace groups, so that grouping does not hide it.
3. As a c-mods user, I want `rm -rf ~` blocked inside `( … )` subshells.
4. As a c-mods user, I want `rm -rf ~` blocked inside `$( … )` and backtick substitutions.
5. As a c-mods user, I want `rm -rf /` blocked after `time`, `!` and loop keywords (`for … do`, `while … do`).
6. As a c-mods user, I want `/bin/rm -rf ~` and `\rm -rf ~` blocked, so that path-qualifying or escaping the program does not bypass the guard.
7. As a c-mods user, I want `rm -rf "$HOME"/` and other mid-word quoting blocked, so that quoting style does not matter.
8. As a c-mods user, I want `rm -rf node_modules`, `rm -rf ./dist` and other in-project relative paths to keep passing, so that the guard does not get in my way.
9. As a c-mods user, I want `chmod -R 777` checked with the same reading, so that `time chmod -R 777 .` is blocked too.
10. As a c-mods user, I want `curl … | /bin/bash`, `curl … | sudo -E bash` and `curl … | tee f | sh` blocked, so that download-and-run cannot sneak through.
11. As a c-mods user, I want `curl url | jq .` and `curl url -o file` to keep passing.
12. As a c-mods user, I want `git clean` with any spelling of force (`-f`, `-fd`, `-xdf`, `-d -f`, `--force`) blocked.
13. As a c-mods user, I want `git reset --hard` blocked wherever `--hard` sits among the arguments.
14. As a c-mods user, I want `git checkout`/`git restore` with a lone `.` pathspec blocked wherever the `.` sits (`git checkout HEAD -- .`, `git restore -s HEAD .`).
15. As a c-mods user, I want `git restore .env.example`, `git restore ./src/a.ts` and `git checkout .github/workflows/ci.yml` to keep passing.
16. As a c-mods user, I want `git branch -D x` and `git branch --delete --force x` (and `-d -f`) blocked, while `git branch -d x` keeps passing.
17. As a c-mods user, I want `git push` blocked behind any global option (`-P`, `--bare`, `--work-tree /x`, `--git-dir /r`, `-c k=v`, `-C dir`, `--no-pager`).
18. As a c-mods user, I want `"git" push` and `git p""ush` blocked, so that quoting the program or subcommand does not bypass the guard.
19. As a c-mods user, I want `git rm --cached`, `git reset --soft`, `git rebase`, `git switch`, `git worktree` and `git branch -d` to keep passing.
20. As a c-mods user, I want a command the parser cannot read to keep being denied when its whole text looks dangerous, so that the new reading never fails open.
21. As Claude, I want the deny message to stay `BLOCKED: '<command>' matches dangerous pattern '<pattern>'. …`, so that what I am told about a block does not change.
22. As the c-mods maintainer, I want each guard's Bash row tests to run with the other three guards off, so that a row passes only because the guard under test decided it.
23. As the c-mods maintainer, I want each row's deny checked against the guard's own pattern, so that git and rm denies cannot be confused.
24. As the c-mods maintainer, I want one fail-closed test per Bash guard (git, dotenv, secret, rm) that only that guard reaches, asserting its exact `c-mods: <guard> failed, command blocked.` text, so that dropping one guard's catch turns CI red.
25. As the c-mods maintainer, I want every bypass listed above to be a row in its guard's table, so that a regression is one failing row.

## Implementation Decisions

- **rm-guard** reads the parser's simple commands of the executed text and compares the program by basename. The current whitespace split and segment split remain only as the fallback when the parser returns nothing. Its public matcher keeps its signature (executed text and cwd in, pattern name or nothing out), so the wiring in `register.ts` does not change. The dangerous-target rules are unchanged.
- **rm-guard's pipe-to-shell check** reads pipelines: a `curl`/`wget` command followed later in the same pipeline by a program whose basename is a shell, possibly behind `sudo` with options. The shell list is the one `bash-text-rules` already keeps, exported from there rather than copied. The parser's flat simple-command list loses pipeline grouping, so this check needs a pipeline-level view from `bash-text-rules` (or the parser), added as pure parsing, no guard policy in the parser. The regex stays as the fallback.
- **git-guard** reads the parser's simple commands: program basename `git`, then global options skipped (those that take a value consume the next word, the same way commit-argument parsing does), then the subcommand and its arguments decide. Its public matcher keeps its signature (executed text in, pattern name or nothing out). The current regex list remains as the fallback when the parser gives up.
- **Pattern names** reported for parsed matches are the existing regex strings closest to what was matched (e.g. the `reset --hard` row's string), so deny text keeps today's form.
- The unanchored `push --force` / `reset --hard` rows and the redundant `clean -fd` row are **not** removed here (map row 6, later work), but parsed matching must not depend on them.
- `sudo -u user`, `env -i` and other wrapper options are not handled (map row 8, out of scope); this change must not make them worse than today.
- The policy stays pure: rules modules take values and return decisions; no `$` crosses into them.

## Testing Decisions

- A good test fires a Bash `tool.call` the way Claude Code would and asserts only the visible outcome: the call ran, or the deny text. No test reaches into the rules modules' internals.
- Seam: the Bash `tool.call` through `claude-code/testing` (the existing table-driven row tests), with `mock.store` switching off every guard but the one under test.
- The row tables of rm-guard and git-guard gain every bypass in the user stories as deny rows and every listed pass case as a pass row; deny rows assert the guard's own pattern name.
- Fail-closed: one test per Bash guard at the same seam. The other guards are off; a throw is forced that only the guard under test reaches; the assertion is the exact `c-mods: <guard> failed, command blocked.` text.
- The existing unparsable-shapes tests must stay green unchanged: they prove the fallback.
- Prior art: the row helper and the rm-guard/git-guard row tables, the unparsable-shapes table, the off-band and session-log tests' use of `mock.store` with toggles set.

## Out of Scope

- secret-guard on parsed words (map row 3), the secret rule table (row 7), mention over-blocking and dropping git's bare rows (row 6), wrapper options like `sudo -u` (row 8), shared helpers (row 9), the parser's inert-heredoc exception (row 10).
- Interpreter code (`node -e`, `python -c`) stays inert: accepted trade-off.
- Globs that could expand to `.env`.
- Any change to deny wording, toggles or the `/c-mods` command.

## Further Notes

- The installed plugin blocked `git log -S"'reset --hard',"` during the review: a live sample of the over-block row 6 will fix later.
- Do one guard per change so each switch can be verified on its own.
