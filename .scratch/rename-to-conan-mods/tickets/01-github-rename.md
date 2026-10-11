# 01: Renomear o repo no GitHub

> **Difficulty:** Heavy: **suggested model:** Opus (Claude Code) / Opus or the strongest reasoning model available (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** `../SPEC.md`

**What to build:** O repo `C0nanT/claude-hooks` passa a ser `C0nanT/conan-mods` no GitHub, com descrição que diz o que o plugin faz hoje e topics para busca. O clone local aponta para o endereço novo. São ações externas: o agente roda `gh repo rename` e `gh repo edit` só depois de o usuário confirmar no momento.

**Seams:** None (ação no GitHub, conferida por `gh repo view`).

**Blocked by:** None (can start immediately)

Status: ready-for-human

- [x] Usuário confirmou o rename e a edição antes de rodar
- [x] `gh repo view C0nanT/conan-mods` mostra o repo
- [x] Descrição nova cita guards (git, `.env`, segredos, `rm`), caveman, som e status line, sem falar em `settings.json`
- [x] Topics `claude-code`, `claude-code-plugin` e `mods` presentes
- [x] `git remote -v` do clone aponta para `C0nanT/conan-mods`
- [x] `github.com/C0nanT/claude-hooks` redireciona para o repo novo
