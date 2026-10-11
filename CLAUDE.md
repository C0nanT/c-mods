# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A marketplace with one Claude Code plugin, `conan-mods`: a mod whose TypeScript hooks run inside Claude Code. Users install it with `/plugin install conan-mods --marketplace C0nanT/conan-mods` and update with `claude plugin update conan-mods` + `/reload-plugins`. User-facing behaviour (the four functions, `/conan-mods`, the off band) is in `README.md`.

The repo used to be the npm CLI `@c0nant/claude-hooks`, which wrote shell hooks into `settings.json`. That CLI is deprecated, and its last version (a cleanup tool) stays on npm only. Per-PC migration lives in `MIGRATING.md`.

## Commands

```bash
git config core.hooksPath .githooks   # pre-push runs validate + test
claude plugin validate .              # manifests and hooks module
claude plugin test .                  # every hooks/*.test.ts
claude --plugin-dir .                 # run Claude Code with the plugin loaded from this folder
./reset-env.sh                        # dev reset: old npm cleanup (npx @0.4.0) + wipe ~/.agents/skills and ~/.claude/skills
```

`validate` always warns that the root `CLAUDE.md` is not loaded as plugin context. That warning is expected, so CI runs `validate` without `--strict`.

## Architecture

- `hooks/register.ts` is the only hooks module (`hooks/hooks.json`). It wires events to logic and keeps every helper that touches `$` in the same file, because validate only follows `$` into functions declared there.
- Decision logic lives in pure modules (`*-rules.ts`, `toggles.ts`) that `register.ts` calls.
- Toggles: the names are fixed in `TOGGLE_NAMES`. Each value persists per PC in `$.store`, where an absent value means on. A copy is mirrored in `$.state` (typed in `types/index.d.ts`) so the off band redraws immediately.
- Tests fire events the way Claude Code would and assert only visible outcomes: deny or pass and with which message, the sound command's argv, the caveman section, the `/conan-mods` reply, the band text.
- `.claude-plugin/types/` is generated locally and gitignored. CI runs without it.

## SOLID

Apply SOLID at the **architecture** level: module boundaries, dependency direction, and the interfaces between them. It is a way to shape seams, not a naming ritual. "Module" means whatever this codebase groups behaviour into: a class, a package, a file of functions, a service.

Where this section and *Architecture* above rule on the same question, *Architecture* wins: the `$` constraint there is a platform limit, not a style choice.

### Scope: boy scout rule

SOLID applies to:

- code written new in the current change, and
- the existing code the current flow already passes through, when a small local edit clears friction that change is hitting.

The rest of the codebase stays as it is. Keep a change's blast radius on the flow being built or fixed: a repo-wide SOLID refactor is its own piece of work, and happens only when explicitly asked for. The codebase converges one change at a time.

When applying a principle would require reshaping modules outside the current flow, leave them alone and say so in the summary of the change.

### In this repo

- **Policy**: `hooks/*-rules.ts` and `hooks/toggles.ts`. Pure functions with no imports from `claude-code` and no `$`.
- **Details**: `hooks/register.ts`: every `$.store`, `$.state`, `$.fs`, `$.env`, `$.process`, `$.ui`, `$.session` and `$.clock` call, inside the local helpers declared in that file.
- **Wiring**: `register.ts` reads through its `$` helpers, calls the rules functions with plain values, and acts on what they return: argv lists, deny messages, status segments, band text. Policy never receives `$` or an IO interface.
- **Test substitution**: two tiers. Rules modules are tested directly with plain values (`statusline-rules.test.ts`). Behaviour tests fire events through `claude-code/testing`, stub IO with `on('process.run' | 'fs.read' | 'fs.write', …)` plus `mock.store`/`mock.env`/`mock.clock`, and assert only visible outcomes.

### The principles, as architecture rules

- **SRP**: a module has one reason to change. When one flow forces edits in a module that other flows also own for unrelated reasons, that module is holding two responsibilities. Exception: `register.ts` holds the IO and wiring of every function by design (see *Architecture*); SRP applies to the helpers and handlers inside it, and to the rules modules, not to the file as a whole.
- **OCP**: new behaviour arrives as a new implementation behind an existing interface, rather than another branch in a growing conditional over kinds of thing. Here that usually means a new `*-rules.ts` module plus a new `on(...)` handler, not another branch inside an existing guard.
- **LSP**: every implementation of an interface is substitutable through that interface: same contract, same error behaviour, no "this one also needs X called first".
- **ISP**: a consumer depends on the narrow interface it actually uses. Interfaces are shaped by the caller's need, not by everything the implementation can do. A rules function takes only the values it decides on, not a bag of session state.
- **DIP**: policy does not depend on details (see *In this repo* above for both). Here DIP holds through data flow rather than injected interfaces: rules modules take values and return decisions, and `register.ts` performs the IO. Passing `$`, or a wrapper around it, into a rules module is forbidden: validate would stop following `$` (see *Architecture*).

### Applying it

- When a new flow crosses an IO boundary, put the IO in a `$` helper declared in `register.ts` and the decision in a pure function in a `*-rules.ts` (or `toggles.ts`) that takes only the values it needs.
- The only seam is `$`: the platform provides it and `claude-code/testing` substitutes it. Don't add interfaces inside rules modules; they already take plain values, which tests pass directly.

## Versioning and releases

- Branch/PR: `.github/workflows/test.yml` installs Claude Code and runs validate + test.
- `main`: every push runs `.github/workflows/release.yml`. It runs the same checks, infers the bump from commit messages since the last tag, writes the version to `.claude-plugin/plugin.json` and the `conan-mods` entry in `marketplace.json`, commits `<version> [skip ci]`, and pushes tag `v<version>`. No npm publish. **Never edit either version by hand.**
- Bump rules (full convention in `CONTRIBUTING.md`): `fix:` or no prefix → patch; `feat:` → minor; any `!:` after the type, or a `BREAKING CHANGE` footer → major. The highest bump since the last tag wins.
