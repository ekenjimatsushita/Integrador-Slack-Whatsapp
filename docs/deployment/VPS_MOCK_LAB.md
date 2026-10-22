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

O `.env` do VPS foi copiado do arquivo local por SCP, pertence a `root:root` e está em modo `600`. Ele contém `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` e `SLACK_CHANNEL_ID`; seus valores não devem ser impressos, copiados para relatórios ou versionados. A instalação ativa usa o Slack pessoal/de laboratório e ainda não foi migrada para o workspace corporativo. O projeto usa `APP_HOST_PORT=3000` como default se essa variável não estiver definida. Consulte [`SLACK_WORKSPACE_SETUP.md`](SLACK_WORKSPACE_SETUP.md) para criar a instalação corporativa e planejar a troca.

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

Execução validada em 15/10/2026: 13 testes offline passaram dentro do container no VPS; a chamada de smoke test foi aceita pelo Slack; após reinício, a resposta humana foi roteada e capturada. Depois do hardening, uma nova resposta humana na thread também foi encaminhada: `received: 1`, `forwarded: 1`, sem rejeições; o mock passou a registrar duas mensagens. Um backup manual feito em seguida confirmou uma conversa e duas mensagens na cópia, sem exibir o conteúdo.

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
- Backup: um timer do systemd executa backup diário às 03:15 UTC, com atraso aleatório de até 10 minutos e retenção de 14 dias. Os arquivos ficam em `/var/backups/lion-whatsapp-lab`, acessíveis apenas por root (diretório `0700`, arquivos `0600`). O serviço valida o JSON sem exibir seu conteúdo. Consulte abaixo os comandos de operação e restauração.
- Limite do backup: a cópia está no mesmo VPS e não protege contra perda do host ou do disco. Ainda é necessário definir um destino externo antes de usar dados reais.
- O healthcheck HTTP só prova que o processo responde; o campo `slack: started` não representa o estado atual do WebSocket. O teste de resposta real em thread é a evidência funcional do Slack.
- Recursos não têm limites explícitos no Compose. A leitura inicial após deploy mostrou cerca de 30 MiB para o app; continuar acompanhando CPU/memória junto aos demais containers.

## Backup e restauração

O script é instalado em `/usr/local/sbin/backup-lion-whatsapp-lab`; o timer e o serviço são `lion-whatsapp-lab-backup.timer` e `lion-whatsapp-lab-backup.service`. Para conferir a agenda e executar/verificar um backup manual:

```bash
systemctl list-timers lion-whatsapp-lab-backup.timer
sudo systemctl start lion-whatsapp-lab-backup.service
sudo systemctl show lion-whatsapp-lab-backup.service -p Result
sudo find /var/backups/lion-whatsapp-lab -maxdepth 1 -type f -printf '%f %s bytes\n'
```

O ensaio de restauração foi executado em 16/10/2026 com um volume temporário: o backup mais recente (uma conversa, duas mensagens) foi lido pelo UID 1000 e validado com modo `0600`; o volume temporário foi removido. Para restaurar os dados ativos, escolha explicitamente o nome do backup e pare o app:

```bash
cd /opt/lion-ai/slack-whatsapp/upstream/WhatsAppInSlack
backup_file='mock-state-AAAAMMDDTHHMMSSZ.json'
docker compose -p lion-whatsapp-lab --env-file .env stop app
```

Valide o schema, escreva um arquivo temporário no volume e substitua o estado atomicamente:

```bash
docker run --rm --network none --read-only --user 0:0 \
  --mount "type=bind,source=/var/backups/lion-whatsapp-lab/$backup_file,target=/backup/state.json,readonly" \
  --mount type=volume,source=lion-whatsapp-lab_mock_state,target=/restore \
  --entrypoint node lion-whatsapp-lab-app:latest -e 'const fs=require("node:fs"); const raw=fs.readFileSync("/backup/state.json","utf8"); const s=JSON.parse(raw); if(s.version!==1||!Array.isArray(s.conversations)||!Array.isArray(s.messages)) process.exit(1); const tmp="/restore/.mock-state.json.restore"; fs.writeFileSync(tmp,raw,{mode:0o600}); fs.chownSync(tmp,1000,1000); fs.chmodSync(tmp,0o600); fs.renameSync(tmp,"/restore/mock-state.json");'
docker compose -p lion-whatsapp-lab --env-file .env up -d app
curl -fsS http://127.0.0.1:3000/health
```

Se a validação/restauração falhar antes da substituição, inicie o serviço novamente para voltar ao estado atual. Confira as contagens sem imprimir as mensagens. Nunca use `docker compose down -v` no projeto ativo. O backup local ainda não protege contra perda do VPS; configure uma cópia externa antes de armazenar dados reais.

## Próximas etapas de desenvolvimento

1. Continuar o piloto interno do mock e registrar falhas/reconexões.
2. Definir destino externo para as cópias de backup (o ensaio de restauração em volume temporário foi concluído em 16/10/2026).
3. Corrigir health/readiness para expor estado real do Socket Mode sem revelar dados.
4. Implementar deduplicação e estratégia de retry antes de conectar um provider real.
5. Escolher e encapsular o WhatsApp Adapter conforme o plano. Até essa decisão, manter o mock e não adicionar mídia ou sessão WhatsApp real.
6. Atualizar os critérios do piloto e decidir se a fase seguinte usará provider não oficial somente em laboratório ou a API oficial da Meta.
