# Operação do laboratório mock no VPS

## Escopo

Este ambiente conecta Slack Bolt via Socket Mode ao `MockWhatsAppAdapter`. Ele não inicia WhatsApp Web, não autentica uma conta WhatsApp e não envia mensagens para WhatsApp. Mensagens do adapter mock são publicadas no canal Slack de laboratório; respostas humanas em threads mapeadas ficam no inbox JSON.

## Instalação vigente

| Item | Valor observado |
|---|---|
| Host | `179.198.97.107` |
| SO | Ubuntu 24.04.4 LTS |
| Diretório | `/opt/lion-ai/slack-whatsapp` |
| Branch workspace | `master` |
| Projeto Compose | `lion-whatsapp-lab` |
| Serviço | `app` |
| Porta no host | `127.0.0.1:3000` |
| Volume persistente | `lion-whatsapp-lab_mock_state` |
| Arquivo de estado no container | `/data/mock-state.json` |
| Usuário do container | `node` (UID 1000) |

O `.env` do VPS foi copiado do arquivo local por SCP, pertence a `root:root` e está em modo `600`. Ele contém `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` e `SLACK_CHANNEL_ID`; seus valores não devem ser impressos, copiados para relatórios ou versionados. O projeto usa `APP_HOST_PORT=3000` como default se essa variável não estiver definida.

## Atualizar e executar

Os comandos abaixo devem ser executados no VPS. Use sempre `-p lion-whatsapp-lab` para que Compose selecione o volume e a rede deste laboratório.

```bash
cd /opt/lion-ai/slack-whatsapp
git pull --ff-only origin master
git submodule update --init --recursive
cd upstream/WhatsAppInSlack

docker compose -p lion-whatsapp-lab --env-file .env config --quiet
docker compose -p lion-whatsapp-lab --env-file .env run --build --rm --no-deps app npm test
docker compose -p lion-whatsapp-lab --env-file .env up -d --build
docker compose -p lion-whatsapp-lab --env-file .env ps
curl -fsS http://127.0.0.1:3000/health
```

`config --quiet` evita imprimir a configuração interpolada. Não use `docker compose down -v`: isso remove o volume com mappings e mensagens.

## Teste Slack ↔ mock no VPS

O teste offline automatizado não acessa Slack. Para o smoke test real, faça a chamada abaixo no VPS; ela publica uma mensagem identificada como teste no canal Slack configurado e cria um mapping:

```bash
curl -fsS -X POST http://127.0.0.1:3000/mock/whatsapp/send-test
```

Responda na thread no Slack. Em seguida, confira localmente `/mock/whatsapp/messages` e `/debug/router`. O primeiro endpoint contém texto da equipe: ao registrar evidência, use contagens e IDs, nunca o corpo da mensagem. Reinicie o serviço e responda novamente à mesma thread para validar que o mapping foi restaurado do volume.

Execução validada em 15/10/2026: 13 testes offline passaram dentro do container no VPS; a chamada de smoke test foi aceita pelo Slack; após reinício, a resposta humana foi roteada e capturada. Os contadores mostraram `received: 1`, `forwarded: 1`, sem rejeições. O estado foi confirmado por contagens sem exibir o conteúdo.

## Acesso da equipe e rede

A equipe usa o canal Slack configurado. Não existe uma interface web para usuários finais. A API HTTP do laboratório está limitada a `127.0.0.1:3000`; o VPS não abriu essa porta no UFW. Nginx continua nas portas 80/443, e SSH permanece na 22.

Para uma administração individual a partir de uma estação confiável, abra um túnel SSH:

```bash
ssh -L 3000:127.0.0.1:3000 root@179.198.97.107
```

Então acesse `http://127.0.0.1:3000` localmente. Não publique `/mock/whatsapp/messages`, `/debug/router` ou `/mock/whatsapp/send-test` por um proxy público: não têm autenticação e podem revelar conteúdo ou publicar mensagens no Slack.

## Segurança observada e limites

- `.env`: `root:root`, modo `600`; não está versionado.
- Porta do serviço: publicada apenas em loopback.
- Container: executa como `node`, não é privilegiado, não tem capabilities adicionais, usa filesystem raiz somente leitura, `/tmp` em tmpfs e `no-new-privileges`.
- Volume: único mount de dados da aplicação, `/data`, gravável pelo usuário `node`; o estado JSON tem modo `600` dentro do container.
- Dependências de produção: `npm audit --omit=dev` reportou zero vulnerabilidades conhecidas na verificação de 15/10/2026.
- Firewall: UFW ativo; regras observadas liberam SSH 22 e Nginx 80/443. Nenhuma regra foi alterada para esta aplicação.
- SSH do host: a configuração efetiva observada permite login root e autenticação por senha e chave pública. Não foi alterada porque afeta a administração do VPS e os demais serviços; o responsável pelo host deve avaliar migrar para chave somente e uma conta administrativa adequada.
- Dados: o volume persiste reinícios/substituições do container, mas não protege contra perda do VPS. Não há backup externo automatizado documentado ou configurado nesta etapa. Definir destino, retenção e restauração antes de armazenar dados reais.
- O healthcheck HTTP só prova que o processo responde; o campo `slack: started` não representa o estado atual do WebSocket. O teste de resposta real em thread é a evidência funcional do Slack.
- Recursos não têm limites explícitos no Compose. A leitura inicial após deploy mostrou cerca de 30 MiB para o app; continuar acompanhando CPU/memória junto aos demais containers.

## Próximas etapas de desenvolvimento

1. Continuar o piloto interno do mock e registrar falhas/reconexões.
2. Definir backup e restauração do volume, sem remover `mock_state`.
3. Corrigir health/readiness para expor estado real do Socket Mode sem revelar dados.
4. Implementar deduplicação e estratégia de retry antes de conectar um provider real.
5. Escolher e encapsular o WhatsApp Adapter conforme o plano. Até essa decisão, manter o mock e não adicionar mídia ou sessão WhatsApp real.
6. Atualizar os critérios do piloto e decidir se a fase seguinte usará provider não oficial somente em laboratório ou a API oficial da Meta.
