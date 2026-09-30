# Integração Slack ↔ WhatsApp

Este workspace contém as especificações dos agentes Codex e uma cópia de trabalho do projeto público `rtmedical/WhatsAppInSlack`.

## Organização

- `.codex/config.toml` e `.codex/agents/`: agentes de projeto carregáveis pelo Codex.
- `manifest.json`: índice do projeto que relaciona as especificações e os agentes executáveis.
- `docs/agents/`: especificações completas, protocolo compartilhado e validação documental.
- [`docs/development/LOCAL_DEVELOPMENT.md`](docs/development/LOCAL_DEVELOPMENT.md): guia da etapa local com WhatsApp mock, testes, operação e mapa de manutenção.
- `PLANEJAMENTO_INTEGRACAO_SLACK_WHATSAPP.md`: plano de arquitetura e implantação.
- [`upstream/WhatsAppInSlack/`](upstream/WhatsAppInSlack/): clone de [`rtmedical/WhatsAppInSlack`](https://github.com/rtmedical/WhatsAppInSlack), origem no commit `9ef4bbb`, com a licença GPL-3 e histórico Git preservados. As correções locais estão na branch `codex/local-compose-smoke`.

## Slack Socket Mode e Mock WhatsApp

O setup local em [`upstream/WhatsAppInSlack/`](upstream/WhatsAppInSlack/) usa Bolt Socket Mode e encaminha mensagens humanas de texto por `MessageRouter` para `MockWhatsAppAdapter`, sem abrir uma sessão real de WhatsApp. O roteador restringe o tráfego ao `SLACK_CHANNEL_ID`, evita loops de bot e resolve respostas por thread para o `conversationId` mapeado. O mock também pode simular uma mensagem de WhatsApp e publicar uma thread de teste no Slack. As credenciais são lidas somente de `SLACK_BOT_TOKEN` e `SLACK_APP_TOKEN`; seus valores não devem ser impressos, registrados ou versionados. O token de app precisa do escopo `connections:write`; para publicar no Slack, o bot precisa de `chat:write` e ser membro do canal de destino.

A partir de `upstream/WhatsAppInSlack/`, use o `.env` da raiz:

```powershell
docker compose --env-file ../../.env up --build -d
docker compose --env-file ../../.env run --build --rm --no-deps app npm test
```

Verifique `http://127.0.0.1:3000/health` e consulte as mensagens capturadas em `http://127.0.0.1:3000/mock/whatsapp/messages`. `npm test` cobre normalização, roteamento, loop de bot, restrição de canal e mapping de thread. Para o teste de Socket Mode real, publique uma thread mock com `POST http://127.0.0.1:3000/mock/whatsapp/send-test` e responda dentro da thread; nenhum envio ocorre para uma conta WhatsApp. O mapping é mantido em memória nesta etapa.

O Compose anterior, com validação de Slack Events via HTTP e MongoDB, foi substituído por este fluxo Socket Mode mais enxuto. O guia [`docs/development/LOCAL_DEVELOPMENT.md`](docs/development/LOCAL_DEVELOPMENT.md) detalha como repetir cada validação e onde corrigir cada parte; consulte também [`upstream/WhatsAppInSlack/README.md`](upstream/WhatsAppInSlack/README.md) e `docs/agents/README.md`.

Consulte `docs/agents/README.md` para o fluxo de orquestração e o protocolo comum.
