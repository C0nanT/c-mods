# 04: Push, release 2.0.0 e migração desta máquina

> **Difficulty:** Standard: **suggested model:** Sonnet (Claude Code) / Sonnet (Cursor). Suggestion only, use whatever model you have to hand.

**Spec:** `../SPEC.md`

**What to build:** Os commits chegam ao GitHub, o CI publica a 2.0.0, e esta máquina sai de `conan-mods@claude-hooks` para `conan-mods@conan-mods` seguindo a seção de migração do MIGRATING.md ao pé da letra. O push é do usuário (`! git push` nos dois repos): o `git-guard` bloqueia o agente e deve continuar bloqueando.

**Seams:**
- Validação do plugin (no CI)
- Instalação real nesta máquina

**Blocked by:** 02 (Renomear marketplace e textos do repo do plugin), 03 (Corrigir referências no repo skills)

Status: ready-for-agent

- [ ] Usuário fez push nos dois repos
- [ ] CI do plugin passou e criou o commit `2.0.0 [skip ci]` e a tag `v2.0.0`
- [ ] Passos do MIGRATING.md seguidos sem desvio; qualquer passo errado corrigido no próprio MIGRATING.md
- [ ] `claude plugin marketplace list` mostra `conan-mods` e não mostra `claude-hooks`
- [ ] Plugin instalado como `conan-mods@conan-mods` na 2.0.0
- [ ] `/conan-mods` abre numa sessão nova
