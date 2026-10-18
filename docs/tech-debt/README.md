# Tech debt index

One row per module. The partition is proposed (the repo declares no modules) and was confirmed on 2026-10-18; later reviews measure against these names and globs. Reports live in `.scratch/tech-debt-map/` and are not committed; the ledger below is.

| Module | Paths | Origin | Last review | Report | Open |
| ------ | ----- | ------ | ----------- | ------ | ---- |
| Bash guards | `hooks/bash-*.ts`, `hooks/*-guard*.ts`, `hooks/fail-closed.test.ts` | proposed | 2026-10-18 | `.scratch/tech-debt-map/bash-guards/2026-10-18.md` | 10 |
| Wiring | `hooks/register.ts`, `hooks/toggles*.ts`, `hooks/hooks.json`, `hooks/panel.test.ts`, `hooks/off-band.test.ts`, `types/**` | proposed | never | | |
| Status line | `hooks/statusline*.ts` | proposed | never | | |
| Sound + caveman | `hooks/sound*.ts`, `hooks/caveman.test.ts` | proposed | never | | |
| Session log | `hooks/session-log*.ts` | proposed | never | | |
| Release/CI | `.github/**`, `.githooks/**`, `.claude-plugin/**` | proposed | never | | |

## Findings ledger

### Bash guards

| # | Finding | First seen | Status |
| - | ------- | ---------- | ------ |
| 1 | rm-guard tokenizes on its own; compound shapes, wrappers and `/bin/rm` bypass it | 2026-10-18 | open |
| 2 | git-guard regexes raw text; flag order, spelling and quoting bypass it | 2026-10-18 | open |
| 3 | secret-guard splits on quotes; `"$HOME"/.aws/credentials` passes | 2026-10-18 | open |
| 4 | Fail-closed and row tests cannot tell which guard denied | 2026-10-18 | open |
| 5 | pipe-to-shell check knows 3 shells and stops at the first pipe | 2026-10-18 | open |
| 6 | Unanchored git patterns deny commands that only mention the words | 2026-10-18 | open |
| 7 | secret-guard home-anchored rules written twice; dead `root` branches | 2026-10-18 | open |
| 8 | `programIndex` skips wrappers but not their options (`sudo -u root rm`) | 2026-10-18 | open |
| 9 | Fallback tokenizer, path fold and deny template copied across guards | 2026-10-18 | open |
| 10 | Inert-text rule (`$(cat <<'EOF')`) lives inside the parser | 2026-10-18 | open |

## Guardrails

- Every Bash guard decides on `simpleCommands` words and keeps its own tokenizer only as the fallback when parsing fails. Wrapper, shell and tokenizer lists live once, in `bash-text-rules.ts`. (Bash guards, 2026-10-18)
- A guard change ships with rows for the shared shell shapes: `time`, `{ }`, `( )`, `if/then`, `$(…)`, path-qualified program, `\prog`, mid-word quotes, `sudo -u x`. (Bash guards, 2026-10-18)
- Each guard has its own fail-closed test that reaches only that guard and asserts the exact `c-mods: <guard> failed, …` text, and its deny message names the guard. (Bash guards, 2026-10-18)
- A command that only mentions a protected word or path passes in every guard; guards decide on the words the shell executes. (Bash guards, 2026-10-18)
