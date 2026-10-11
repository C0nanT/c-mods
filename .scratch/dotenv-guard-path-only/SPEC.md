# dotenv-guard: block the .env file, not mentions of it

Status: ready-for-agent

## Problem Statement

`dotenv-guard` is meant to stop the agent from reading or changing a project's `.env` file. In Bash it does this by searching the whole command text for `.env` followed by anything that is not a letter. So it blocks many commands that only *mention* `.env` and never touch the file:

- `grep -rn "import.meta.env" front-end/src`
- `printf '/.env\n' >> .gitignore`
- `gh repo edit --description "guards for git, .env, secrets..."`
- `grep -n "gitignore\|\.env" SKILL.md`
- `[ -f .env ] && echo exists`, `test -e .env`

The transcript history has 82 different Bash commands blocked this way, and most of them were mentions. A one-off script written during the design session to list those commands was blocked too. The agent loses time rewording commands and sometimes gives up on a valid step. Only a handful of the blocks were real accesses, such as `cat .env | grep DATABASE_URL`, `cp .env .baseline-wt/.env` and `grep -E "^POSTGRES" .env`.

There is also a gap in the other direction: the Grep tool is not guarded, so a Grep whose `path` is `.env` shows the file's contents.

## Solution

In Bash, `dotenv-guard` reads the command the way the shell does, one word at a time, with quoted text counting as a single word. It blocks only a word that is a path to a `.env` file. Text that just mentions `.env` (patterns, descriptions, messages, code such as `process.env.X`) passes. Commands that only check whether the file exists (`test`, `[`, `ls`) pass. The Grep tool is guarded by its `path`. The deny message names the path that was blocked, in the same format the Read tool's message already uses.

`git-guard` is not changed. The original request named it by mistake.

## User Stories

1. As a developer, I want `grep -rn "import.meta.env" src` to run, so that the agent can find where environment variables are used.
2. As a developer, I want `grep "process.env.API_URL" -r .` to run, so that the agent can trace a config value through the code.
3. As a developer, I want `grep -n "\.env" SKILL.md` to run, so that the agent can find docs that talk about `.env`.
4. As a developer, I want `printf '/.env\n' >> .gitignore` to run, so that the agent can add `.env` to the ignore list.
5. As a developer, I want `gh repo edit --description "guards for git, .env, secrets"` to run, so that a description mentioning `.env` does not block a GitHub command.
6. As a developer, I want `echo "remember to copy .env.example to .env"` and similar quoted sentences to run, so that the agent can print instructions.
7. As a developer, I want `test -e .env`, `[ -f .env ]` and `ls .env*` to run, so that the agent can check whether the file exists before deciding what to do.
8. As a developer, I want `cat .env` blocked, so that secrets are not printed into the session.
9. As a developer, I want `cat ../.env`, `cat /app/.env` and `cat backend/.env.local` blocked, so that a path prefix does not get around the guard.
10. As a developer, I want `cat ".env"` and `cat '.env'` blocked, so that quoting the path does not get around the guard.
11. As a developer, I want `cat .env | grep DATABASE_URL` blocked, so that filtering the output does not get around the guard.
12. As a developer, I want `grep -E "^POSTGRES" .env` blocked, so that searching inside the file is treated as reading it.
13. As a developer, I want `cp .env .baseline-wt/.env` blocked, so that the file is not copied somewhere less protected.
14. As a developer, I want `source .env` and `. .env` blocked, so that secrets are not loaded into the agent's shell.
15. As a developer, I want `node --env-file=.env app.js` blocked, so that a `--flag=value` word that names the file still counts.
16. As a developer, I want `wc -l < .env` and `ls > .env` blocked, so that a redirect into or out of the file counts as access, even when the program itself is `ls`.
17. As a developer, I want `cat .env*` and `grep X backend/.env.*` blocked, so that a wildcard that expands to the file counts as naming it.
18. As a developer, I want `sh -c 'cat .env'` and `bash <<EOF` bodies that read `.env` blocked, so that wrapping the access in a shell does not get around the guard.
19. As a developer, I want `cat .env.example`, `.env.sample`, `.env.dist` and `.env.template` to keep working in Bash, so that the agent can read the safe templates.
20. As a developer, I want `ls .env && cat .env` blocked, so that the exemption for `ls` covers only that one command and not the whole line.
21. As a developer, I want `grep ".env" src/` to stay blocked, so that the rule stays simple and predictable. Writing `"\.env"` is the documented way around it.
22. As a developer, I want a command the guard cannot parse (an unclosed quote, a heredoc with no end) to be checked by a simple word split and blocked when any word is a `.env` path, so that the guard stays closed when in doubt.
23. As a developer, I want heredoc bodies, commit messages and inline interpreter code to stay ignored as they are today, so that text the shell does not run never blocks.
24. As a developer, I want the Grep tool blocked when its `path` is a `.env` file, so that its output cannot show the file's contents.
25. As a developer, I want the Grep tool to pass whatever its search pattern is, so that searching for `.env` across the code still works.
26. As a developer, I want Read, Edit, Write and MultiEdit to keep their current behaviour, so that editing a file that mentions `.env` keeps working and editing `.env` itself stays blocked.
27. As the agent, I want the Bash deny message to name the path that was blocked (for example `Access to ../.env is blocked — .env files may contain secrets. Read .env.example instead.`), so that I understand it was the file path, not a mention, and can change course.
28. As a developer, I want the guard to still respect the `dotenv-guard` toggle, so that turning it off with `/conan-mods` disables all of this.
29. As a developer, I want the README to describe the new rule, so that I know what is blocked and what is not.

## Implementation Decisions

- **Only `dotenv-guard` changes.** `git-guard`, `secret-guard` and `rm-guard` keep their behaviour.
- **What counts as a `.env` path.** The rule is the same for Bash words and file tools: the part after the last `/` is exactly `.env` or starts with `.env.`, unless it is one of the safe names (`.env.example`, `.env.sample`, `.env.dist`, `.env.template`). In Bash, a word whose final part starts with `.env` followed directly by a wildcard character (`*`, `?`, `[`) also counts. The current name list is unchanged: `.envrc`, `prod.env` and `config.env` stay outside the rule.
- **Bash pipeline.**
  - The command first goes through the existing step that removes inert text (heredoc bodies fed to readers, commit messages, inline interpreter code, with shell-bound text appended as its own command). The result is then read into simple commands and words.
  - The word reader already lives in the bash-text rules module. That module gains an exported function that returns the simple commands of a command string: each command's program, its arguments, and its redirect targets, with quotes removed and quoted text kept as one word. It throws or signals when the command is unparsable, matching the module's existing behaviour.
  - The dotenv rules module gets a pure function that takes those simple commands and returns the first blocked word, or nothing.
  - `register.ts` wires the pieces: executed text, then the parsed commands, then the dotenv decision, then the deny message. No `$` reaches the rules modules.
- **`--flag=value` and `VAR=value` words.** The value after the first `=` is checked as a path, so `--env-file=.env` is blocked.
- **Existence checks.** When a simple command's program is `test`, `[` or `ls`, its *arguments* are not checked. Its redirect targets are still checked. Every other simple command in the same line is checked normally.
- **Unparsable fallback.** If the word reader cannot parse the executed text, the guard splits it on whitespace and shell punctuation, as `secret-guard` does, and blocks when any resulting token is a `.env` path.
- **Grep tool.** The file-tools handler of `dotenv-guard` also covers Grep, checking only Grep's `path` input against the `.env` path rule. The `pattern` input is never checked.
- **Messages.** The Bash deny message becomes `Access to <word> is blocked — .env files may contain secrets. Read .env.example instead.`, where `<word>` is the word as the shell sees it (`../.env`, `backend/.env.local`). The fixed `BASH_BLOCKED_MESSAGE` goes away. The file-tool message is unchanged; the Grep message uses the same format with Grep's `path`.
- **Fail-closed and toggle.** Both handlers keep the existing `failClosed` wrapper and the `dotenv-guard` toggle check.

## Testing Decisions

- A good test fires an event the way Claude Code would and asserts only the visible outcome: denied with a given message, or passed through. It never asserts on parsed words, intermediate text or which helper ran.
- Agreed seams:
  - The tool call, fired with `$.tool.call` from `claude-code/testing` (Bash, Grep, Read, Edit, Write, MultiEdit), with `mock.store` for toggles.
- Modules tested: the dotenv-guard behaviour test covers the rules module, the new export of the bash-text rules module and the wiring in `register.ts` through that single seam. No new direct unit tests for the rules functions.
- Cases to add:
  - Every allowed example in User Stories 1–7, 19 and 25 goes into the must-pass lists.
  - Every blocked example in 8–18, 20–22 and 24 goes into the must-block lists, each asserting the new message with the specific word.
  - The real hits from the transcript history (`cat .env | grep DATABASE_URL`, `cp .env .baseline-wt/.env`, `grep -E "^POSTGRES" .env`) are must-block cases.
  - The commands from the history that were wrongly blocked are must-pass cases.
- Existing tests change:
  - The Bash must-block cases now expect the per-word message.
  - The test asserting that Grep is outside the guard flips: Grep with a `.env` `path` is denied, and Grep with `.env` only in `pattern` passes.
- Prior art: `dotenv-guard.test.ts` (table-driven blocks/allows through `$.tool.call`), `secret-guard.test.ts` (Bash token matching), `bash-inert-text.test.ts` (inert text through a guard), `fail-closed.test.ts`.

## Out of Scope

- Indirect reads that never name the file: `grep -r SECRET .`, `cat *`, `find . -exec cat {} \;`.
- Telling a search pattern apart from a path. `grep ".env" src/` stays blocked.
- Changing which names count as `.env` (`.envrc`, `*.env`, more safe variants).
- The Glob tool, which only lists names.
- Any change to `git-guard` or the other guards.
- Code that reads `.env` from inside interpreter code or a heredoc fed to an interpreter (`python3 -c 'open(".env")'`). That text is inert today and stays so.

## Further Notes

- `[[ -f .env ]]` was not discussed. Treating `[[` like `[` fits the intent of the existence-check decision, but it needs confirmation before it is added.
- Commit with a `fix:` prefix, which gives a patch release. The release workflow sets the version; do not edit it by hand.
- Update the `dotenv-guard` row in `README.md`: Bash blocks only words that are `.env` paths, existence checks pass, and Grep is covered by `path`.
