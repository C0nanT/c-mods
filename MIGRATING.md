# Migrating a PC to the `conan-mods` plugin

Run this on every PC that had the old `@c0nant/claude-hooks` hooks. It takes a
couple of minutes and is safe to repeat.

## Before you start

- Node ≥18 and `jq` (Ubuntu/WSL: `sudo apt-get install -y jq`).
- **Always pin `@0.4.0`.** `0.3.0` and older are the *old installer*: their
  `uninstall` ignores `--dry-run` and removes **every** `claude-hook:` hook,
  including `statusline-reset` from C0nanT/skills. `@latest` can still resolve
  to an old version through the npx cache or registry lag.
- Run the commands **one at a time**. Pasting the dry-run and the real cleanup
  together runs both before you can read the report.

### Windows + WSL

- Run every step **inside the WSL shell**, where Claude Code and its
  `~/.claude` live. Node and `jq` must be installed in WSL, not just on Windows.
- One run covers both the plain WSL terminal and Cursor connected to WSL: they
  share the same WSL `HOME`.
- The done sound plays on Windows through `powershell.exe`. Check that WSL can
  reach it before you start:

  ```bash
  powershell.exe -Command '[Console]::Beep(523, 120)'
  ```

  You should hear one beep. `command not found` means WSL interop or
  `appendWindowsPath` is off in `/etc/wsl.conf`, and the plugin's sound stays
  silent until it is on.
- Claude Code installed natively on Windows (outside WSL) is not covered.

## 1. Check you have the cleanup tool

`@c0nant/claude-hooks@0.4.0` is the old cleanup tool: the last version of the
deprecated npm package, kept only to remove the old hooks.

```bash
npx @c0nant/claude-hooks@0.4.0 --help | head -1
```

Expected: `claude-hooks — cleanup tool for the old claude-hooks settings.json hooks`.
Anything else means you got an old version: stop. An `npm warn deprecated …
Package no longer supported` line is expected: the whole package is
deprecated, and the cleanup still runs.

## 2. Preview

```bash
npx @c0nant/claude-hooks@0.4.0 uninstall --dry-run
```

Writes nothing and never calls `claude`. Check the report:

- the first line is `Dry run: nothing will be written to …/settings.json`;
- `would be removed` / `does not exist` for each of the 5 old hooks
  (`caveman`, `git-guardrails`, `protect-dotenv`, `notify-attention`,
  `notify-done`), the `hooks-lib` folders, the notification control files and
  the `claude-notification` plugin;
- if the PC uses the custom status line, `claude-hook:statusline-reset` shows up
  under **"not touched"**.

## 3. Clean up

```bash
npx @c0nant/claude-hooks@0.4.0 uninstall
```

Same report, with `removed` instead of `would be removed`. Lines like
`failed (plugin or marketplace may not exist): old plugin …` followed by
`not found` just mean `claude-notification` was never installed on this PC.

Run it a second time if you want proof: everything reads `does not exist`.

## 4. Install the plugin

Inside Claude Code:

```
/plugin install conan-mods --marketplace C0nanT/conan-mods
```

The `caveman` function reads `~/.claude/skills/caveman/SKILL.md`. If
`ls ~/.claude/skills/caveman/SKILL.md` fails, install the skills first:
`npx skills@latest add C0nanT/skills`.

## Coming from the `claude-hooks` marketplace

Skip this if you never installed the plugin through the marketplace named
`claude-hooks`. Otherwise swap it for `conan-mods`, in Claude Code:

1. `/plugin uninstall conan-mods@claude-hooks`
2. `/plugin marketplace remove claude-hooks`
3. `/plugin marketplace add C0nanT/conan-mods`
4. `/plugin install conan-mods@conan-mods` (user scope, the default)
5. `/reload-plugins`

Same from a shell: `claude plugin uninstall conan-mods@claude-hooks`,
`claude plugin marketplace remove claude-hooks`,
`claude plugin marketplace add C0nanT/conan-mods`,
`claude plugin install conan-mods@conan-mods --scope user`.

## 5. Check the plugin works

In a new Claude Code session:

- [ ] `/conan-mods` lists `caveman`, `git-guard`, `dotenv-guard` and `sound`,
      all `on`.
- [ ] **git-guard:** in any repo, ask Claude to run `git push --dry-run`. The
      call is denied with `BLOCKED: 'git push --dry-run' matches dangerous pattern …`.
- [ ] **dotenv-guard:** in a scratch folder, `echo FAKE=1 > .env` and
      `cp .env .env.example`, then ask Claude to read both. `.env` is denied
      (the message suggests `.env.example`), and `.env.example` is read.
- [ ] **caveman:** replies come back terse from the first message. No
      `caveman: skill não encontrada` toast appears.
- [ ] **sound:** the end of each answer plays the chime **once**: three beeps
      from Windows on WSL, the system "complete" sound on Ubuntu. Two sounds
      mean an old hook or the `claude-notification` plugin survived: rerun
      step 3.
- [ ] **Off band:** `/conan-mods sound off` shows `⚠ off: sound` above the
      prompt right away. `/conan-mods sound on` removes it.

Updating later: `claude plugin update conan-mods`, then `/reload-plugins` in
open sessions.

## Recovery: an old version (≤0.3.0) ran `uninstall`

Symptom: `no matching hooks found` / `removed hooks from …/settings.json`, and
`jq '.hooks' ~/.claude/settings.json` no longer shows `statusline-reset` (it may
print `null`).

1. Restore the `statusline-reset` hook (step 3 of the `setup-statusline` skill).
   Needs `~/.claude/statusline-reset-hook.sh`; if it is missing, rerun the
   `setup-statusline` skill instead.

   ```bash
   SETTINGS="$HOME/.claude/settings.json"
   HOOK_CMD='# claude-hook:statusline-reset
   f="$HOME/.claude/statusline-reset-hook.sh"; [ -f "$f" ] && exec bash "$f"; exit 0'
   jq --arg cmd "$HOOK_CMD" '
     .hooks = (.hooks // {})
     | .hooks.SessionEnd = ((.hooks.SessionEnd // []) + [{"matcher":"clear","hooks":[{"type":"command","command":$cmd}]}])
     | .hooks.SessionStart = ((.hooks.SessionStart // []) + [{"matcher":"clear","hooks":[{"type":"command","command":$cmd}]}])
   ' "$SETTINGS" > "$SETTINGS.tmp" && mv "$SETTINGS.tmp" "$SETTINGS"
   ```

   Run it once: each run appends another copy. Check with
   `jq '.hooks' ~/.claude/settings.json`: one `clear` group under `SessionEnd`
   and one under `SessionStart`.

2. Continue from step 2 above with `@0.4.0`. The old version left the
   notification control files, previous-generation scripts and the old
   `claude-notification` plugin behind; the new cleanup removes them.
