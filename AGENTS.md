# Instruções para agentes (Codex, Claude Code e outros)

Leia este arquivo e depois [`docs/development/NEXT_STEPS.md`](docs/development/NEXT_STEPS.md) antes de qualquer mudança. O `NEXT_STEPS.md` guarda o estado atual, o backlog priorizado e as decisões pendentes.

## Como trabalhar neste projeto

- Escreva para o usuário em português.
- **A cada alteração, atualize a documentação afetada** (tabela abaixo) e o `NEXT_STEPS.md`, na mesma sessão.
- **Avise o usuário antes de commitar ou implantar.** Commite e envie somente quando ele pedir ou aprovar. Antes de commitar, rode os testes e registre a evidência na documentação.
- Ações que afetam o VPS de forma não trivial (pausar o app, mexer em SSH, firewall ou Nginx, apagar dados) exigem confirmação explícita. Mudar o SSH pode bloquear o acesso ao servidor.
- Nunca imprima, registre ou versione os valores de `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` ou `.env`. Não use `docker compose config` sem `--quiet`, `printenv`, nem `docker inspect` com a saída integral.
- O estado do mock contém texto da equipe. Em relatórios use contagens e IDs, nunca o corpo das mensagens.
- Nunca rode `docker compose down -v` no projeto `lion-whatsapp-lab`: isso apaga o volume com os mappings.

## Estrutura dos repositórios (um único repositório GitHub, dois branches)

| Onde | Branch | Conteúdo |
|---|---|---|
| raiz deste workspace | `master` | documentação, agentes Codex, `deploy/` (manifesto Slack, systemd, script de backup) |
| `upstream/WhatsAppInSlack/` | `main` | código do app (Node 22, Bolt Socket Mode, Docker Compose), licença GPL-3 |

`upstream/WhatsAppInSlack` é um submódulo, mas localmente é um clone independente (com `.git` próprio), por isso `git submodule status` mostra `-`. Uma mudança no app exige: commit e push em `main` dentro de `upstream/WhatsAppInSlack`, e depois commit em `master` com o novo ponteiro do submódulo (`git add upstream/WhatsAppInSlack`).

## Testar

```bash
cd upstream/WhatsAppInSlack/app && npm ci && npm test                     # offline, sem credenciais
cd upstream/WhatsAppInSlack && docker compose -p wa-local-test --env-file ../../.env run --build --rm --no-deps app npm test
```

O `.env` local usa o **mesmo app Slack do VPS**. Duas conexões Socket Mode dividem os eventos entre si. Para um teste com resposta humana, use um projeto Compose separado (`-p wa-local-test`, volume próprio) e pause o app do VPS com autorização do usuário. Depois religue o VPS e rode `down -v` **somente** no projeto de teste.

Ao ligar o Docker Desktop, o container antigo `whatsappinslack-app-1` (versão de 29/09) sobe sozinho por causa do `restart: unless-stopped`, conecta ao Slack e ocupa a porta 3000. Pare-o com `docker stop whatsappinslack-app-1`; o usuário ainda não decidiu se ele deve ser removido.

## Implantar e operar no VPS

O procedimento completo, o rollback, o backup e a restauração estão em [`docs/deployment/VPS_MOCK_LAB.md`](docs/deployment/VPS_MOCK_LAB.md). O acesso é `ssh root@179.198.97.107` por chave. Use `-o BatchMode=yes` para não travar num pedido de senha.

## Onde documentar cada mudança

| Mudança | Documentos |
|---|---|
| Código, testes, endpoints, variáveis | `docs/development/LOCAL_DEVELOPMENT.md` (cobertura e mapa de manutenção), `upstream/WhatsAppInSlack/README.md`, `.env.example` |
| Deploy, VPS, backup, segurança | `docs/deployment/VPS_MOCK_LAB.md` |
| Slack app, escopos, workspace | `docs/deployment/SLACK_WORKSPACE_SETUP.md`, `deploy/slack/*.yml` |
| Estado geral, roadmap | seção "Estado atual" e seção 47 de `PLANEJAMENTO_INTEGRACAO_SLACK_WHATSAPP.md` |
| Novos documentos | `README.md` (índice) e `manifest.json` |
| Sempre | `docs/development/NEXT_STEPS.md` |
