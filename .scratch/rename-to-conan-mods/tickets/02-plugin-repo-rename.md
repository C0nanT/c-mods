# 02: Renomear marketplace e textos do repo do plugin

> **Difficulty:** Standard: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** `../SPEC.md`

**What to build:** No repo do plugin, o marketplace passa a se chamar `conan-mods`, e todo texto vivo apresenta o projeto como `conan-mods` e instala com `--marketplace C0nanT/conan-mods`. Quem já instalou pelo marketplace `claude-hooks` encontra no MIGRATING.md uma seção curta com a troca. Referências ao pacote npm `@c0nant/claude-hooks@0.4.0`, a pasta `hooks/` e o histórico em `.scratch/` ficam como estão. Tudo sai em um commit no `main` que gera a 2.0.0 no CI.

**Seams:**
- Busca pelo nome antigo
- Validação do plugin

**Blocked by:** 01 (Renomear o repo no GitHub)

Status: ready-for-human

- [x] Nome do marketplace no manifesto é `conan-mods`; versões não foram tocadas à mão
- [x] Título do README sem "claude-hooks →"; comandos de instalação com `C0nanT/conan-mods`
- [x] CLAUDE.md e `reset-env.sh` com o comando de instalação novo
- [x] MIGRATING.md: comando de instalação novo e seção "Vindo do marketplace `claude-hooks`" (desinstalar `conan-mods@claude-hooks`, remover marketplace `claude-hooks`, adicionar `C0nanT/conan-mods`, instalar `conan-mods` no escopo user, `/reload-plugins`), com sintaxe conferida em `claude plugin uninstall --help`, `claude plugin install --help` e `claude plugin marketplace --help`
- [x] Texto ao redor de `@c0nant/claude-hooks@0.4.0` o descreve como a ferramenta de limpeza antiga
- [x] `grep` por `claude-hooks` fora de `.scratch/` e CHANGELOG só acha o pacote npm e a seção de migração
- [x] `claude plugin validate .` e `claude plugin test .` passam
- [x] Um commit no `main` tipo `refactor!: rename project and marketplace to conan-mods` com rodapé `BREAKING CHANGE: marketplace renamed from claude-hooks to conan-mods`; sem push
