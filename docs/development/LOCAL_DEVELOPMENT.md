# Parte 1 — Desenvolvimento local com WhatsApp mock

## Objetivo e limite desta etapa

Esta etapa valida o lado Slack da integração e o roteamento da aplicação sem conectar, autenticar ou enviar mensagens para uma conta WhatsApp. O adapter usado é `MockWhatsAppAdapter`, executado no processo local/contêiner.

Há dois tipos de validação:

1. **Testes offline:** exercitam handlers, router, mock e mapeamento de threads sem Slack, rede ou credenciais.
2. **Teste de integração local com Slack:** o container conecta ao Slack real via Socket Mode e publica/recebe mensagens de teste no canal configurado. O WhatsApp continua sendo somente mock.

O estado do mock é salvo em `/data/mock-state.json` dentro do volume Docker `mock_state`. Ele inclui os vínculos de thread e o texto das últimas 500 mensagens capturadas. Trate esse volume como dado privado da equipe e faça backup antes de removê-lo.

```mermaid
flowchart LR
  H[Pessoa responde em uma thread Slack] --> S[Bolt Socket Mode]
  S --> N[slackMessageHandler normaliza o evento]
  N --> R[MessageRouter valida canal e conversa]
  R --> M[MockWhatsAppAdapter.sendMessage]
  W[MockWhatsAppAdapter.receiveMessage] --> P[slackMessagePublisher]
  P -->|cria mensagem raiz| S2[Slack chat.postMessage]
  P --> C[ConversationRegistry: thread → conversationId]
  C --> R
```

## Preparação

Requisitos:

- Docker Compose para a integração local;
- Node.js 20 ou superior para rodar os testes offline diretamente;
- app Slack com Socket Mode habilitado;
- `SLACK_BOT_TOKEN` (Bot User OAuth Token), `SLACK_APP_TOKEN` (App-Level Token) e `SLACK_CHANNEL_ID` no `.env` da raiz.

Os valores dos tokens são secretos: não os inclua em documentação, comandos, screenshots, commits ou logs. O app token precisa de `connections:write`. Para receber mensagens de canal, assine `message.channels` e conceda `channels:history`; para canal privado, use `message.groups` e `groups:history`. Para publicar mensagens de teste, o bot precisa de `chat:write` e precisa ser membro do canal. Consulte a documentação Slack para [Socket Mode](https://docs.slack.dev/tools/bolt-js/concepts/socket-mode/), [eventos de mensagem](https://docs.slack.dev/tools/bolt-js/creating-an-app/#subscribing-to-events) e [`chat.postMessage`](https://docs.slack.dev/reference/methods/chat.postMessage/).

O serviço atual é configurável para **um workspace por execução** através dessas variáveis. Para preparar a instalação no workspace corporativo, use o manifesto em `deploy/slack/lion-whatsapp-lab-manifest.yml` e siga [`docs/deployment/SLACK_WORKSPACE_SETUP.md`](../deployment/SLACK_WORKSPACE_SETUP.md). Instalação simultânea em múltiplos workspaces exige OAuth e armazenamento de instalações, ainda fora do escopo.

## Rodar os testes offline

Na pasta `upstream/WhatsAppInSlack/app`, execute:

```powershell
npm test
```

São testes unitários do Node (`node:test`). Eles não iniciam Bolt, não leem o `.env`, não acessam Slack e não iniciam WhatsApp.

Na pasta `upstream/WhatsAppInSlack`, os mesmos testes também podem ser executados na imagem Compose:

```powershell
docker compose --env-file ../../.env run --build --rm --no-deps app npm test
```

Esse comando substitui o comando de inicialização do app pelo runner de testes; não abre conexão Socket Mode. O Compose ainda carrega as variáveis exigidas pelo serviço.

## Rodar a integração local com Slack

Na pasta `upstream/WhatsAppInSlack`:

```powershell
docker compose --env-file ../../.env up --build -d
Invoke-RestMethod http://127.0.0.1:3000/health
```

O health esperado é HTTP 200 com `status: ok`, `slack: connected` e `whatsappAdapter: mock`. Se a conexão Socket Mode cair, o endpoint responde HTTP 503 com `status: degraded` e o estado atual (`reconnecting`, `disconnected` etc.), e o healthcheck do Compose marca o container como `unhealthy`. O serviço é exposto somente em `127.0.0.1:3000`.

### Validar uma resposta humana Slack → mock

O router só encaminha respostas a threads que estejam mapeadas para uma conversa. Crie uma mensagem raiz de teste via endpoint local:

```powershell
$testThread = Invoke-RestMethod -Method Post `
  http://127.0.0.1:3000/mock/whatsapp/send-test
$testThread | Select-Object status, conversationId, threadTs
```

Isso simula uma mensagem recebida do WhatsApp e publica uma mensagem identificada como mock no canal Slack configurado. É um **envio real ao Slack**, não um envio ao WhatsApp. Repita a chamada para criar outras conversas mock; cada thread criada fica mapeada de forma persistente.

Para simular uma segunda mensagem do mesmo contato, envie o `conversationId` retornado. Ela deve aparecer **dentro da thread existente** (`createdThread: false`), e não como nova mensagem raiz:

```powershell
Invoke-RestMethod -Method Post -ContentType 'application/json' `
  -Body (@{ conversationId = $testThread.conversationId } | ConvertTo-Json) `
  http://127.0.0.1:3000/mock/whatsapp/send-test
```

No Slack, responda **dentro da thread** recém-criada. A resposta humana percorre Bolt → handler → router → mock. Uma mensagem nova no canal, fora de uma thread mapeada, chega ao router, mas é rejeitada com `conversation-not-found` para não ser enviada a uma conversa indeterminada.

Consulte localmente o inbox e os contadores:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/mock/whatsapp/messages
Invoke-RestMethod http://127.0.0.1:3000/debug/router
```

O inbox contém o texto da mensagem humana, portanto mantenha o endpoint local e não copie a resposta para logs ou relatórios sem necessidade.

O endpoint pode criar várias conversas mock por execução. Cada thread e cada mensagem capturada são persistidas; após reiniciar o container, respostas nas threads já registradas continuam associadas à conversa mock correta.

Para encerrar:

```powershell
docker compose --env-file ../../.env down
```

## Cobertura validada até aqui

| Cenário | Evidência |
|---|---|
| Evento humano normalizado e entregue ao `MessageRouter` | Teste offline; também observado via Socket Mode |
| Resposta Slack encaminhada ao mock com texto original | Teste offline e comparação da resposta real no Slack com o inbox mock |
| Resolução do `conversationId` pelo `thread_ts` da thread raiz | Teste offline e thread Slack real |
| Mensagem de bot não retorna ao mock | Teste offline; publicação mock no Slack não gerou entrega ao inbox |
| Canal diferente do `SLACK_CHANNEL_ID` | Teste offline do `MessageRouter` |
| Thread sem mapeamento | Teste offline; mensagem humana fora da thread foi rejeitada em execução real |
| Slack rejeita publicação | Teste offline; nenhum mapeamento é registrado nessa falha |
| Nova mensagem da mesma conversa entra na thread existente, inclusive após reinício | Teste offline; Slack real em 22/10/2026 (1 raiz + respostas do bot na mesma thread, conferido por `conversations.replies`) |
| Evento Slack ou mensagem WhatsApp reentregue não é processado duas vezes, inclusive após reinício | Teste offline |
| Falha temporária no envio ao WhatsApp é repetida (3 tentativas); falha definitiva gera aviso na thread sem repetir o texto | Teste offline (o mock não simula falha em execução real) |
| Falha ao publicar no Slack não marca a mensagem WhatsApp como processada, permitindo a reentrega do provider | Teste offline |
| Anexo enviado em thread mapeada não é entregue e gera aviso; edições e exclusões continuam ignoradas | Teste offline; anexo humano real em 22/10/2026 gerou `unsupported-media` e o aviso na thread |
| `/health` reflete a conexão Socket Mode | Container local em 22/10/2026: rede desconectada → `reconnecting`/503/`unhealthy`; reconectada → `connected`/200/`healthy` |

Os testes ficam em `upstream/WhatsAppInSlack/app/test/`. São 31 testes offline: sete cenários de roteamento Slack/mock, seis de persistência JSON, quinze de confiabilidade (thread por conversa, deduplicação, retry, aviso de falha, anexos, compatibilidade do estado antigo e seleção de adapter) e três de erros HTTP genéricos, sem eco do corpo nem stack trace. A suíte inclui reload do estado, atualização de mapping, limite de 500 mensagens, gravações concorrentes e rejeição de JSON/schema inválidos. Eles rodam sem Slack, rede ou credenciais e também podem ser executados na própria VPS dentro do container Compose.

Validação da versão com deduplicação em 22/10/2026, em container local (Node 22) com volume separado e o app do VPS pausado durante o teste humano: 28 testes no container; startup recusou `WHATSAPP_ADAPTER=meta`; limites de recursos e rotação de log aplicados; thread única por conversa mantida após reinício; resposta humana encaminhada ao mock (`forwarded: 1`); anexo recusado com aviso; estado com chaves de deduplicação e modo `600`; nenhum conteúdo em log.

O laboratório no VPS `179.198.97.107` iniciou saudável. Uma pessoa respondeu à thread publicada pelo VPS; o router registrou `received: 1`, `forwarded: 1`, sem rejeições, e a resposta foi capturada no volume. O container foi reiniciado antes da resposta, validando a recuperação do mapping. A verificação do inbox deve mostrar somente contagens/IDs, sem imprimir o texto da mensagem em relatórios.

O endpoint `/health` reflete o estado da conexão Socket Mode, mas não prova que eventos e permissões estão corretos. Para confirmar Slack ponta a ponta, use uma resposta humana em thread de laboratório. A configuração atual mantém `/health`, `/mock/whatsapp/messages`, `/debug/router` e `/mock/whatsapp/send-test` acessíveis apenas no loopback do VPS; os três últimos não possuem autenticação, e o inbox contém conteúdo da equipe.

O procedimento, a configuração efetiva do VPS, os testes de implantação e os pontos operacionais estão em [`docs/deployment/VPS_MOCK_LAB.md`](../deployment/VPS_MOCK_LAB.md).

## Mapa de manutenção: onde corrigir

| Sintoma ou regra a alterar | Arquivo responsável |
|---|---|
| Socket Mode, startup, endpoints locais ou assinatura `app.message()` | `upstream/WhatsAppInSlack/app/app.js` |
| Ignorar bot/subtypes e converter o evento Slack para campos normalizados | `upstream/WhatsAppInSlack/app/slackMessageHandler.js` |
| Canal permitido, conteúdo válido, resolução da conversa, deduplicação, retry e chamada a `sendMessage()`/publicação no Slack | `upstream/WhatsAppInSlack/app/application/MessageRouter.js` |
| Chave que associa canal + thread raiz a `conversationId` | `upstream/WhatsAppInSlack/app/adapters/slack/ConversationRegistry.js` e `app/persistence/JsonStateStore.js` |
| Mensagens capturadas e eventos simulados pelo WhatsApp mock | `upstream/WhatsAppInSlack/app/adapters/MockWhatsAppAdapter.js` |
| Formato de publicação no Slack, reaproveitamento da thread da conversa e registro da thread após sucesso | `upstream/WhatsAppInSlack/app/slackMessagePublisher.js` |
| Chaves de eventos já processados (deduplicação, últimas 5000) | `upstream/WhatsAppInSlack/app/application/EventDeduplicator.js` e `app/persistence/JsonStateStore.js` |
| Avisos fixos na thread para falha de entrega e anexos | `upstream/WhatsAppInSlack/app/slackFailureNotifier.js` |
| Escolha do adapter por `WHATSAPP_ADAPTER` (hoje só `mock`) | `upstream/WhatsAppInSlack/app/adapters/createWhatsAppAdapter.js` |
| Respostas de erro HTTP (JSON malformado, corpo grande, erro interno) | `upstream/WhatsAppInSlack/app/httpErrorHandler.js` e `app/test/httpErrorHandler.test.js` |
| Cenários de roteamento, loop, canal e threads | `upstream/WhatsAppInSlack/app/test/messageRouting.test.js` |
| Persistência: reload, atualização de mapping, limite, concorrência e estado inválido | `upstream/WhatsAppInSlack/app/test/jsonStateStore.test.js` |
| Thread por conversa, deduplicação, retry, avisos, anexos e factory do adapter | `upstream/WhatsAppInSlack/app/test/reliability.test.js` |
| Variáveis injetadas, porta local, healthcheck, limites de recursos e rotação de logs | `upstream/WhatsAppInSlack/docker-compose.yml` |
| Runtime e instalação de dependências | `upstream/WhatsAppInSlack/Dockerfile` e `app/package.json` |

### Limites intencionais do mock

- O inbox persiste apenas as últimas 500 mensagens capturadas; o conteúdo inclui texto enviado pela equipe no Slack.
- Só mensagens de texto estão implementadas neste caminho. Anexos enviados numa thread mapeada recebem um aviso fixo e não são encaminhados.
- O `MessageRouter` exige uma thread previamente registrada para identificar a conversa WhatsApp de destino.
- Nenhum cliente, QR code, sessão ou credencial WhatsApp é iniciado ou requerido. `WHATSAPP_ADAPTER` aceita apenas `mock`; outro valor encerra o startup com `unsupported_whatsapp_adapter`. Os endpoints `/mock/*` só existem quando o adapter é o mock.
- O texto enviado ao WhatsApp não identifica a pessoa que respondeu no Slack. Incluir o nome exige o escopo `users:read` e uma decisão de produto.
- Persistência de mídia e adapter WhatsApp real são etapas futuras e não devem ser introduzidos ao alterar esta parte sem decisão explícita de arquitetura.

## Diagnóstico seguro de credenciais

Não rode `docker compose config` sem `--quiet`, `docker inspect` com saída integral, `printenv` ou dumps de ambiente. Esses comandos podem expor tokens. Para validar apenas a sintaxe do Compose use:

```powershell
docker compose --env-file ../../.env config --quiet
```

Se aparecer `invalid_auth`, confira no `.env` que `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` e `SLACK_CHANNEL_ID` são linhas separadas, sem valores colados por falta de quebra de linha; depois confirme no Slack os tipos dos tokens e o Socket Mode. Não imprima os valores para depurar.
