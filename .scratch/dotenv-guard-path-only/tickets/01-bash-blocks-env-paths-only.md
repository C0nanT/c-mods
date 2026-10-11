# 01: Bash blocks only words that are .env paths

> **Difficulty:** Heavy: **suggested model:** Opus (Claude Code) / Opus or the strongest reasoning model available (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** ../SPEC.md

**What to build:** `dotenv-guard` in Bash stops searching the command text for `.env` and reads the command the way the shell does, word by word, after inert text is removed, with quoted text counting as one word. It blocks only a word that is a `.env` path: the part after the last `/` is `.env` or starts with `.env.`, except the safe names, or starts with `.env` followed by a wildcard. The value of `--flag=value` and `VAR=value` words is checked too. Redirect targets count. Text sent to a shell (`sh -c '...'`, `bash <<EOF`) is checked as its own command. When the command cannot be parsed, the guard splits it on whitespace and shell punctuation, as `secret-guard` does, and blocks on any `.env` token. The deny message names the word: `Access to <word> is blocked — .env files may contain secrets. Read .env.example instead.`

Prefactor first: the bash-text rules module exposes its shell-word reader as a function returning simple commands (program, arguments, redirect targets, quotes removed). No behaviour change on its own; the existing guard tests stay green.

**Seams:**
- The tool call, fired with `$.tool.call` from `claude-code/testing`, with `mock.store`

**Blocked by:** None (can start immediately)

Status: ready-for-human

- [x] Passes: `grep -rn "import.meta.env" src`, `grep "process.env.API_URL" -r .`, `grep -n "\.env" SKILL.md`, `printf '/.env\n' >> .gitignore`, `gh repo edit --description "guards for git, .env, secrets"`, `echo "copy .env.example to .env"`, `cat .env.example` (and the other safe names)
- [x] Blocks with the per-word message: `cat .env`, `cat ../.env`, `cat /app/.env`, `cat backend/.env.local`, `cat ".env"`, `cat '.env'`, `cat .env | grep DATABASE_URL`, `grep -E "^POSTGRES" .env`, `cp .env .baseline-wt/.env`, `source .env`, `. .env`, `node --env-file=.env app.js`, `wc -l < .env`, `cat .env*`, `grep X backend/.env.*`, `sh -c 'cat .env'`, `grep ".env" src/`
- [x] An unparsable command naming `.env` (unclosed quote) is blocked; one that does not name it passes
- [x] Heredoc bodies, commit messages and inline interpreter code that mention `.env` still pass
- [x] The `dotenv-guard` toggle off lets every case through; the fail-closed behaviour is unchanged
- [x] The commands that were wrongly blocked in the transcript history are must-pass cases; the real hits are must-block cases
- [x] The rules module stays pure (no `$`); `register.ts` does the wiring
- [x] README `dotenv-guard` row says Bash blocks only words that are `.env` paths
