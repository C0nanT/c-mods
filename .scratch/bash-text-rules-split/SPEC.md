# bash-text-rules: split the parser from the path rules, and table-test the guards

Status: ready-for-agent

## Problem Statement

The Bash guards (dotenv, rm, git, secret) all depend on one large module that both parses shell text (words, quotes, heredocs, inert spans) and decides what the parsed commands mean. One module with two reasons to change. The last three fixes to dotenv-guard (`.` arguments, quoted wildcards, existence checks) each landed as a loose test case, so regressions are added by hand, one at a time, and there is no cheap way to see which command shapes the guards cover.

## Solution

Separate the shell-text parsing from the rules that decide on parsed commands, keeping both pure and keeping the public behaviour of every guard identical. Express guard coverage as tables of `command -> expected outcome`, so a new false positive or false negative is one added row.

## User Stories

1. As the maintainer, I want the shell parser separate from the path rules, so that a change to quote handling cannot silently change what counts as a protected path.
2. As the maintainer, I want each guard's behaviour unchanged by the split, so that no command that passed before is denied now, or the reverse.
3. As the maintainer, I want a new regression case to be one table row, so that I add it in seconds instead of writing a test body.
4. As the maintainer, I want each guard's table to list allowed and denied commands side by side, so that I can see what the guard covers at a glance.
5. As the maintainer, I want the three recent dotenv fixes present as rows, so that they stay fixed.
6. As a Claude Code user, I want commands that only mention `.env` to pass, so that the guard stops getting in my way.
7. As a Claude Code user, I want commands that touch the real `.env` file to stay denied, so that the protection holds.
8. As a Claude Code user, I want a command the parser cannot read with confidence to stay denied, so that the guards remain closed on unknown input.
9. As a contributor, I want the parser to expose a small interface (executed text, simple commands), so that I can reason about it without reading the rules.
10. As a contributor, I want the rules to take plain values only, so that they never need `$` and `claude plugin validate` keeps following the hooks module.
11. As the maintainer, I want the fail-closed behaviour covered by a table row per unparsable shape, so that a parser refactor cannot open a hole unnoticed.

## Implementation Decisions

- The current shell-text module is split into a parser (tokenizing, quote and heredoc handling, inert-span removal, simple-command extraction) and the consumers that stay in the existing rules modules.
- The parser's exported interface stays the same two functions plus the shell-command type; guards keep importing only what they use.
- Parser and rules stay pure: no `$`, no IO, no imports from `claude-code`. IO stays in the helpers declared in the hooks module.
- Unparsable input keeps returning the whole command, so guards stay closed.
- No behaviour change is intended. Any case where the split reveals a behaviour bug is recorded as a row and fixed in its own commit.
- Per the repo's boy scout rule, only the flow through the parser and the guards that use it is touched.

## Testing Decisions

- A good test fires a Bash tool event and asserts only the visible outcome (deny or pass, and the message), never internal functions.
- Agreed seam, one: the existing event-level seam through `claude-code/testing`, firing Bash events at the registered hooks. The split is internal and adds no seam.
- Guard coverage is expressed as tables (`command`, expected `deny|pass`, optional message fragment), one table per guard, run through that seam.
- Existing direct rules tests stay where they already exist.
- Prior art: the dotenv, rm, git and secret guard test files and the fail-closed test.

## Out of Scope

- Splitting `register.ts` or changing its wiring.
- New guards or new protected paths.
- Changes to CI, release, or the pre-push hook.
- Fuzzing against real shell history (possible follow-up).

## Further Notes

The table rows should be seeded from commands that were real false positives or negatives, not invented ones.
