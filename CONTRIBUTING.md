# Contributing

## Commit message convention

The release pipeline (`.github/workflows/release.yml`) reads commit messages on
`main` since the last tag to decide the version bump automatically. Prefix
your commit subject accordingly:

| Prefix | Bump | Example |
|---|---|---|
| `fix:`, or no prefix at all | **patch** | `fix: allow .env.template in dotenv-guard` |
| `feat:` | **minor** | `feat: add dotenv-guard function` |
| `feat!:`, `fix!:`, any `!:` after the type, or a `BREAKING CHANGE` footer | **major** | `feat!: drop support for Node < 18` |

Only the commit **subject line** (and body, for `BREAKING CHANGE` footers) is
scanned — scopes are optional and ignored for bump purposes, e.g. both
`feat:` and `feat(hooks):` count as minor.

If more than one commit landed since the last release, the **highest** bump
wins (a `fix:` and a `feat:` together produce a minor release).

### Why this matters

Once you push to `main`, CI writes the new version to
`.claude-plugin/plugin.json` and the marketplace entry, commits it and tags it,
with **no manual step**. Getting the prefix right is what decides whether your
change ships as a patch, minor, or major release.

### Examples

```
fix: block "git rm" pattern with word boundary
feat: add sound toggle to /c-mods
feat(git-guard): cover git switch --discard-changes
feat!: rename the /c-mods command

BREAKING CHANGE: muscle memory and docs must use the new command name
```
