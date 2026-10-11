# 04: Push, release 2.0.0 e migração desta máquina

> **Difficulty:** Standard: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** `../SPEC.md`

**What to build:** Os commits chegam ao GitHub, o CI publica a 2.0.0, e esta máquina sai de `conan-mods@claude-hooks` para `conan-mods@conan-mods` seguindo a seção de migração do MIGRATING.md ao pé da letra. O push é do usuário (`! git push` nos dois repos): o `git-guard` bloqueia o agente e deve continuar bloqueando.

**Seams:**
- Validação do plugin (no CI)
- Instalação real nesta máquina

**Blocked by:** 02 (Renomear marketplace e textos do repo do plugin), 03 (Corrigir referências no repo skills)

Status: done

- [x] Usuário fez push nos dois repos
- [x] CI do plugin passou e criou o commit `3.0.1 [skip ci]` e a tag `v3.0.1` (a 2.0.0 já existia; o rename saiu como major 3.0.0)
- [x] Passos do MIGRATING.md seguidos sem desvio; nenhum passo errado
- [x] `claude plugin marketplace list` mostra `conan-mods` e não mostra `claude-hooks`
- [x] Plugin instalado como `conan-mods@conan-mods` na 3.0.1
- [x] `/conan-mods` abre numa sessão nova
