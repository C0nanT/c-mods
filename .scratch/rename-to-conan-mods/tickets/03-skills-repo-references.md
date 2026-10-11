# 03: Corrigir referências no repo skills

> **Difficulty:** Light: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** `../SPEC.md`

**What to build:** No repo skills, quem segue o README, o bloco de instalação, os guias `setup-statusline` e `reset-agent-env` (inglês e português), essas duas skills e suas traduções, ou o README do bucket productivity chega ao plugin pelo repo `C0nanT/conan-mods`. O `scripts/reset-env.sh` limpa com `npx @c0nant/claude-hooks@0.4.0 uninstall` e manda reinstalar com `/plugin install conan-mods --marketplace C0nanT/conan-mods`, em vez de um comando que não existe. Comentários do `uninstall.sh` e `docs/archive/` ficam como estão. Prosa sem travessão.

**Seams:**
- Busca pelo nome antigo

**Blocked by:** 01 (Renomear o repo no GitHub)

Status: ready-for-human

- [x] Todos os links e comandos citados usam `C0nanT/conan-mods`; "projeto claude-hooks" vira "projeto conan-mods"
- [x] README bate literalmente com o bloco de instalação
- [x] `scripts/reset-env.sh` usa a versão fixa `@0.4.0` na limpeza e o `/plugin install` novo na mensagem final
- [x] `grep` por `claude-hooks` fora de `docs/archive/` só acha o pacote npm (`uninstall.sh`, `scripts/reset-env.sh`) e nada mais
- [x] Nenhum travessão introduzido
- [x] Um commit no `main`; sem push
