# `c-mods`

A Claude Code plugin (a mod: TypeScript hooks that run inside Claude Code) with
nine functions:

| Function | What it does |
|---|---|
| `caveman` | Adds the caveman skill of [c-skills](https://github.com/C0nanT/c-skills) to the session instructions. It reads the skills.sh copy (`~/.claude/skills/caveman/SKILL.md`) when there is one, else the c-skills plugin's, found through `~/.claude/plugins/installed_plugins.json` at each read (an install for the session's project before a user-wide one), so a plugin update needs nothing here. A plugin switched off in `~/.claude/settings.json` (`enabledPlugins`) counts as absent. If neither copy can be read, warns once per session with the plugin's install commands. |
| `git-guard` | Blocks destructive git commands (`push`, `reset --hard`, `clean -f`, `branch -D`, `checkout .`, `restore .`, `rm`), even with global options before the subcommand. Only a lone `.` counts for `checkout`/`restore` (`restore .env.example` passes), and `rm --cached`, `reset --soft`, `rebase`, `switch`, `worktree` and `branch -d` pass. |
| `dotenv-guard` | Blocks reading or editing `.env` / `.env.*` through Read, Edit, Write, MultiEdit and Bash, and Grep by its `path` (never its pattern). In Bash it blocks only words that are `.env` paths (`cat ../.env`, `--env-file=.env`, `< .env`, `.env*`), so text that only mentions `.env` (`"import.meta.env"`, `"\.env"`, a description) passes, and so do existence checks (`test -e .env`, `[ -f .env ]`, `ls .env*`; redirects on them are still checked). `.env.example`, `.env.sample`, `.env.dist` and `.env.template` stay allowed. |
| `secret-guard` | Blocks reading or editing credential files through Read, Edit, Write, MultiEdit and Bash: `~/.ssh/*` (except `known_hosts`, `config` and `*.pub`), `id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519`, `~/.aws/credentials`, `~/.config/gcloud/`, `~/.azure/`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `.npmrc`, `.pypirc`, `.netrc`, `.git-credentials`, `~/.docker/config.json` and `~/.config/gh/hosts.yml`. When HOME is missing or unreadable, the home-anchored rules cannot be checked, so paths starting with `~` or `$HOME` (and absolute paths under those directories) are blocked. In Bash the extension rules block only a file that exists, so code such as `row.key` passes; if the check fails, the command is blocked. |
| `rm-guard` | Blocks destructive shell commands: `rm -rf` (any flag spelling) on `/`, `/*`, `~`, `$HOME`, `..`, `../…`, a lone `*` or an absolute path outside the current directory, `chmod -R 777`, and `curl`/`wget` piped into `sh`, `bash` or `zsh`. Each part of a compound line is checked; `rm -rf node_modules` and other relative paths inside the project pass. |
| `sound` | Plays a sound when Claude finishes a task: `paplay` on Ubuntu, PowerShell beeps on WSL. No visual notification. |
| `session-log` | Appends one JSON line per finished turn to `~/.claude/log/<project>-<hash>/`. Each project (by the folder the session is open in) has its own folder, so logs never mix; the hash keeps two folders with the same name apart. A file grows to 10 MiB, then the next turn opens a new one named by the day it opened (`YYYY-MM-DD.jsonl`, `YYYY-MM-DD.2.jsonl` when the day already has one; the day follows your local zone, see the status line). Each project keeps the 2 newest files: when a third opens, the oldest is deleted, so a project holds at most about 20 MiB. A line holds `time`, `sessionId`, `turnId`, `model` (the one that answered), `effort` (left out for a model without one), `reason` (`answer`, `aborted`, `refusal` or `error`), `durationMs`, `prompt`, `commands` (the Bash commands Claude ran) and `tokens` (`input`, `output`, `cacheRead`, `cacheCreation` for the main loop's requests; left out when the turn reported none, as on an interrupt). Lines written before c-mods 4.0.0 have `isAborted` instead of `reason` and none of the other new fields, and the current file can mix both. Sub-agent turns are not logged and a failed write never disturbs the turn. Prompts and commands are stored as plain text, secrets included: switch it off with `/c-mods session-log off` when that matters. |
| `statusline` | Draws the plugin's status line under the prompt: model as name and version with the effort on its right when known (`Sonnet 5.5 - medium`; read from `~/.claude/settings.json` until the first turn reports it: `modelSettings[<model>].effortLevel`, else `effortLevel`; the turn's own value wins afterwards), `ctx:<pct>% <tokens>k`, session duration (`23m`, `1h05m`), `limit:<pct>% ↺ HH:MM` for the 5-hour rate-limit window and the git branch after the Nerd Font branch icon (` main`; without a Nerd Font it shows as a box). and `project: <folder>`, the name of the folder the session is open in, last. A field with no data is left out. Updates when the session opens and after each measurement; the duration restarts on `/clear`. Drawn in colour above the prompt while `statusline-color` is on, as plain text under it otherwise. |
| `statusline-color` | Draws the status line in colour in a band above the prompt: the model in bold (green for Haiku, orange for Sonnet, red for Opus, red with a ⚠ after the name for Fable), `ctx` green under 50%, yellow to 69%, orange to 84% and red from 85%; the rate limit green under 60%, yellow to 79%, orange to 89% and red from 90%. Off, the line goes back under the prompt as plain text (that line cannot take colour). Does nothing while `statusline` is off. |

The four Bash guards (`git-guard`, `dotenv-guard`, `secret-guard`, `rm-guard`) check only the text the shell runs: they skip heredoc bodies fed to `cat`, `tee`, an interpreter or `git commit`, commit messages (`-m`, `--message`, `-F -`), and inline interpreter code (`node -e`, `python -c`, `ruby -e`, `perl -e`), unless that text goes to a shell (`bash <<EOF`, `sh -c`, `eval`, `| bash`). A command they cannot parse is checked whole.

## Install

Inside Claude Code:

```
/plugin install c-mods --marketplace C0nanT/c-mods
```

Install it in the user (global) scope. It needs no npm, `jq` or `settings.json`
edits.

**Coming from the old npm hooks?** Run the cleanup first on that PC, or the old
hooks run twice alongside the plugin. See [MIGRATING.md](MIGRATING.md).

## Update

```bash
claude plugin update c-mods
```

Then run `/reload-plugins` inside any open session.

## `/c-mods`

Everything starts **on**. The choice persists across sessions on the same PC.

```
/c-mods                  # open the panel and list each function with on/off
/c-mods git-guard off    # switch one off, effective immediately
/c-mods git-guard on
```

With no argument, `/c-mods` opens a focused `c-mods` pane with one row per function (name, state, a
button). Pressing a button switches that function the same way the text command does, and the pane and the off band
redraw at once. Esc closes the pane and returns the prompt. The reply still carries the `name: on|off` list, for the
transcript and for places where the pane does not open.

Valid names: `caveman`, `git-guard`, `dotenv-guard`, `secret-guard`, `rm-guard`, `sound`, `session-log`, `statusline`, `statusline-color`. Anything else
prints the usage.

### The status line

The reset time is drawn in your local zone, resolved once per session in this order:
`STATUSLINE_TZ` (an IANA name such as `America/Sao_Paulo`), the host zone
(`timedatectl`, `/etc/timezone`, the `/etc/localtime` link; plain UTC is ignored),
and on WSL, when Linux still says UTC, the Windows zone read through PowerShell.
Effort comes from your `~/.claude/settings.json` (re-read every 2 s; a change there redraws the line) until a turn reports it; project/local settings and `--effort` are not read. With `statusline-color` on, the coloured line sits above the
off band when both show.

### The off band

While any function is off, a one-line band above the prompt lists what is off,
in a fixed order:

```
⚠ off: git-guard · caveman
```

It disappears when everything is back on.

## Development

### Layout

```
.claude-plugin/plugin.json        # plugin manifest (version is written by CI)
.claude-plugin/marketplace.json   # marketplace with the single c-mods entry
hooks/hooks.json                  # loads hooks/register.ts
hooks/register.ts                 # wires every event to the modules below
hooks/*-rules.ts, hooks/toggles.ts  # pure decision logic
hooks/*.test.ts                   # plugin tests
types/index.d.ts                  # types for the plugin's stored state
```

### Setup and local run

```bash
git config core.hooksPath .githooks   # pre-push validates and tests the plugin
claude --plugin-dir .                 # load the plugin from this folder
claude plugin validate .              # manifest, marketplace and hooks module
claude plugin test .                  # runs hooks/*.test.ts
```

To get `/reload-plugins` while editing, add the folder as a local marketplace:
`claude plugin marketplace add .` then `/plugin install c-mods`.

### Releasing

| Where you push | What happens |
|----------------|--------------|
| Branch or PR | CI installs Claude Code and runs `claude plugin validate` + `claude plugin test` |
| `main` | Same checks → detect bump from commits → write the version to `plugin.json` and the marketplace entry → commit `[skip ci]` → tag `v<version>` |

Nothing is published to npm. The version is never edited by hand: the bump
comes from commit prefixes (`fix:` → patch, `feat:` → minor, `feat!:` /
`BREAKING CHANGE` → major). See [CONTRIBUTING.md](CONTRIBUTING.md).

### The old npm package

`@c0nant/claude-hooks` is deprecated on npm. Its last version (`0.4.x`) is only
a cleanup tool for the old hooks, and its source was removed from this repo at
the plugin release. [MIGRATING.md](MIGRATING.md) has the per-PC steps.
