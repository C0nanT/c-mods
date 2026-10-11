# 05: Renomear a pasta local

> **Difficulty:** Light: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** `../SPEC.md`

**What to build:** O clone local passa de `claude-tools/claude-hooks` para `claude-tools/conan-mods`, e o repo skills, que lista esse caminho como diretório extra no `settings.local.json`, aponta para o novo. Sessões abertas no caminho antigo precisam ser fechadas e reabertas.

**Seams:** None (mudança de disco e configuração local).

**Blocked by:** 04 (Push, release 2.0.0 e migração desta máquina)

Status: done

- [x] Pasta renomeada, sem trabalho não commitado perdido (`git status` limpo antes)
- [x] `settings.local.json` do repo skills cita o caminho novo e não o antigo
- [x] `git status` no caminho novo funciona e o remote é `C0nanT/conan-mods`
