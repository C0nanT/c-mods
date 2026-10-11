# Renomear o projeto de claude-hooks para conan-mods

Status: ready-for-agent

## Problem Statement

O projeto deixou de ser um conjunto de hooks shell instalados por npm e virou um mod (plugin do Claude Code), o `conan-mods`. Mas o nome antigo continua espalhado:

- O repo no GitHub ainda é `C0nanT/claude-hooks`, com uma descrição que fala em "wires the caveman and git-guardrails skills into settings.json", coisa que o projeto não faz mais.
- O marketplace (o catálogo que o `/plugin install` lê) se chama `claude-hooks`, então o plugin instalado aparece como `conan-mods@claude-hooks`.
- O título do README, o CLAUDE.md, o MIGRATING.md e o `reset-env.sh` do plugin ainda apresentam o projeto como "claude-hooks".
- No repo skills, o README, o bloco de instalação, os guias, as skills `setup-statusline` e `reset-agent-env` e o README do bucket productivity apontam para `C0nanT/claude-hooks`.
- O `reset-env.sh` do repo skills manda reinstalar com `npx @c0nant/claude-hooks install`, um comando que não existe mais.
- A pasta local se chama `claude-tools/claude-hooks`.

Quem lê qualquer um desses pontos fica com a ideia errada do que o projeto é e de como instalá-lo.

## Solution

Um nome só, `conan-mods`, para o repo no GitHub, o marketplace, o plugin, o comando `/conan-mods` e a pasta local. Todo texto vivo passa a usar esse nome. O que é registro do passado, e o pacote npm antigo (que não pode ser renomeado), fica como está. Como a troca do marketplace quebra instalações existentes, a mudança sai como versão 2.0.0, com um passo de migração documentado.

## User Stories

1. Como usuário novo, quero instalar o plugin com `/plugin install conan-mods --marketplace C0nanT/conan-mods`, para que o nome que digito seja o mesmo do plugin.
2. Como usuário novo, quero que o repo no GitHub se chame `conan-mods`, para encontrá-lo pelo nome do plugin.
3. Como visitante do GitHub, quero uma descrição do repo que diga o que o plugin faz hoje (guards de git, `.env`, segredos e `rm`, caveman, som e status line), para não ser enganado pela descrição antiga.
4. Como visitante do GitHub, quero topics `claude-code`, `claude-code-plugin` e `mods` no repo, para achá-lo em buscas.
5. Como usuário que já instalou pelo marketplace `claude-hooks`, quero uma seção no MIGRATING.md com os comandos para sair do marketplace antigo e entrar no novo, para não ficar com o plugin quebrado ou duplicado.
6. Como usuário que já instalou, quero que a versão nova seja 2.0.0, para perceber que há uma mudança que exige ação minha.
7. Como usuário com links antigos salvos, quero que `github.com/C0nanT/claude-hooks` continue abrindo o repo, para não cair em página de erro (o GitHub redireciona após o rename).
8. Como usuário que ainda tem os hooks npm antigos, quero que o MIGRATING.md continue mandando rodar `npx @c0nant/claude-hooks@0.4.0 uninstall`, porque esse pacote ainda existe com esse nome.
9. Como leitor do README do plugin, quero que o título apresente o projeto como `conan-mods`, sem "claude-hooks →".
10. Como agente lendo o CLAUDE.md do plugin, quero o comando de instalação e o nome do marketplace corretos, para não instruir ninguém com o nome antigo.
11. Como usuário que roda o `reset-env.sh` do plugin, quero que a instrução final de reinstalação use o marketplace novo.
12. Como usuário do repo skills, quero que o README e o bloco de instalação apontem para `C0nanT/conan-mods`, para instalar o plugin certo.
13. Como usuário seguindo os guias `setup-statusline` e `reset-agent-env` (em inglês e em português), quero o comando de instalação com o marketplace novo.
14. Como usuário das skills `setup-statusline` e `reset-agent-env` (e suas traduções), quero que elas citem o comando de instalação novo.
15. Como leitor do README do bucket productivity, quero que o link do `caveman` para o plugin aponte para o repo novo.
16. Como usuário que roda o `scripts/reset-env.sh` do repo skills, quero que ele limpe com `npx @c0nant/claude-hooks@0.4.0 uninstall` (versão fixa) e mande reinstalar com `/plugin install conan-mods --marketplace C0nanT/conan-mods`, em vez de um comando que não existe.
17. Como mantenedor, quero que o histórico (specs e tickets antigos, `docs/archive/`, commits, CHANGELOG) fique intocado, para que ele continue dizendo o que aconteceu de fato.
18. Como mantenedor, quero que os comentários do `uninstall.sh` continuem citando `npx @c0nant/claude-hooks install`, porque descrevem o instalador antigo cujos restos o script limpa.
19. Como mantenedor, quero que a pasta `hooks/` e o arquivo `hooks/hooks.json` continuem com esse nome, porque ali "hook" é o mecanismo do Claude Code, não o nome do projeto.
20. Como mantenedor, quero que a versão 2.0.0 venha do CI, a partir da mensagem de commit, para respeitar a regra de nunca editar versão à mão.
21. Como mantenedor, quero a pasta local renomeada para `claude-tools/conan-mods` e o caminho atualizado no `settings.local.json` do repo skills, para que o nome no disco bata com o resto.
22. Como mantenedor, quero que o `git remote` do clone local aponte para `C0nanT/conan-mods`.
23. Como mantenedor, quero esta máquina migrada para `conan-mods@conan-mods`, para validar na prática o passo de migração documentado.

## Implementation Decisions

**Nomes**
- Repo no GitHub: `C0nanT/claude-hooks` vira `C0nanT/conan-mods`, via `gh repo rename`. Descrição nova e topics `claude-code`, `claude-code-plugin` e `mods`, via `gh repo edit`. Ambas são ações externas: o agente roda, mas só com confirmação do usuário no momento.
- Marketplace: o campo `name` do manifesto do marketplace muda de `claude-hooks` para `conan-mods`. O plugin já se chama `conan-mods`, então o identificador instalado passa a ser `conan-mods@conan-mods`.
- O pacote npm `@c0nant/claude-hooks@0.4.0` mantém o nome. Muda só o texto ao redor dele (por exemplo, "a ferramenta de limpeza antiga `claude-hooks`").

**Regra de corte**
- Renomear onde "claude-hooks" ou "hooks" é o *nome do projeto*. Manter onde é o *mecanismo* do Claude Code, o pacote npm antigo ou registro histórico.

**Repo do plugin**
- README: título e todos os comandos de instalação.
- CLAUDE.md: descrição do repo e comando de instalação.
- MIGRATING.md: comando de instalação e uma seção nova, "Vindo do marketplace `claude-hooks`", com esta sequência (comandos confirmados no `claude plugin --help`):
  1. desinstalar `conan-mods@claude-hooks`;
  2. `claude plugin marketplace remove claude-hooks`;
  3. `claude plugin marketplace add C0nanT/conan-mods`;
  4. instalar `conan-mods` no escopo user;
  5. `/reload-plugins` nas sessões abertas.
  Antes de escrever, o agente confirma a sintaxe exata de desinstalar e instalar pelo CLI (`claude plugin uninstall --help`, `claude plugin install --help`).
- `reset-env.sh`: instrução final de reinstalação com o marketplace novo.

**Repo skills**
- README, bloco de instalação (`.agents/install-block.md`), guias `setup-statusline` e `reset-agent-env` (inglês e português), skills `setup-statusline` e `reset-agent-env` e suas traduções, README do bucket productivity: trocar `C0nanT/claude-hooks` por `C0nanT/conan-mods` e "projeto claude-hooks" por "projeto conan-mods".
- O bloco de instalação é copiado literalmente pelos READMEs (regra do CLAUDE.md do repo skills): o README precisa bater com ele.
- `scripts/reset-env.sh`: limpeza com `npx @c0nant/claude-hooks@0.4.0 uninstall` e reinstalação com `/plugin install conan-mods --marketplace C0nanT/conan-mods`.
- Prosa sem travessão (regra de estilo do repo skills).

**Versão**
- 2.0.0 gerada pelo CI. Commit no repo do plugin com `!` no tipo (ex.: `refactor!: rename project and marketplace to conan-mods`) e rodapé `BREAKING CHANGE: marketplace renamed from claude-hooks to conan-mods`. Ninguém edita a versão à mão.

**Ordem**
1. Renomear o repo e editar descrição e topics no GitHub (com confirmação). Atualizar o `git remote` do clone.
2. Um commit no `main` do repo do plugin.
3. Um commit no `main` do repo skills.
4. O usuário roda `git push` nos dois repos (o `git-guard` bloqueia o push para o agente, e deve continuar assim).
5. Esperar o CI publicar a 2.0.0. Migrar esta máquina seguindo a seção nova do MIGRATING.md.
6. Renomear a pasta local para `claude-tools/conan-mods` e atualizar o caminho no `settings.local.json` do repo skills.

O GitHub precisa ter `C0nanT/conan-mods` antes que o manifesto novo seja usado, por isso o rename vem primeiro.

## Testing Decisions

Uma troca de nome não tem lógica nova, então não há teste automatizado novo. Um bom teste aqui confere o resultado visível: o nome antigo sumiu do texto vivo, o plugin valida, e uma instalação real funciona.

Pontos de teste combinados:
- **Busca pelo nome antigo**: `grep` por `claude-hooks` nos dois repos só pode achar o pacote npm `@c0nant/claude-hooks@0.4.0`, o histórico (`.scratch/`, `docs/archive/`, CHANGELOG), os comentários do `uninstall.sh` e a seção de migração nova do MIGRATING.md. Qualquer outro resultado é falha.
- **Validação do plugin**: `claude plugin validate . --strict` e `claude plugin test .` passam no repo do plugin (o CI já roda os dois no push).
- **Instalação real nesta máquina**: depois do push e do CI, seguir a seção nova do MIGRATING.md. Sai `conan-mods@claude-hooks`, entra `conan-mods@conan-mods` na 2.0.0, e o `/conan-mods` abre.

Precedente: a migração para mods (`.scratch/mods-migration/`) também validou com instalação real e limpeza conferida em disco.

## Out of Scope

- Renomear ou republicar o pacote npm `@c0nant/claude-hooks`.
- Reescrever histórico: specs e tickets em `.scratch/`, `docs/archive/` do repo skills, mensagens de commit, CHANGELOG.
- Renomear a pasta `hooks/` ou o arquivo `hooks/hooks.json`.
- Mudar os comentários do `uninstall.sh`.
- Qualquer mudança de comportamento do plugin.
- Branch ou PR: os commits vão direto no `main`.

## Further Notes

- O GitHub redireciona o nome antigo do repo para o novo, mas o manifesto do marketplace muda de nome, então instalações existentes precisam do passo de migração mesmo com o redirecionamento.
- Depois do rename da pasta local, sessões do Claude Code abertas no caminho antigo param de achar os arquivos. Fechar e abrir de novo no caminho novo.
