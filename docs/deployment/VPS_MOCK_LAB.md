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

Se `deploy/vps/backup-lion-whatsapp-lab.sh` mudou no commit, reinstale-o (a partir de `/opt/lion-ai/slack-whatsapp`): `install -o root -g root -m 0700 deploy/vps/backup-lion-whatsapp-lab.sh /usr/local/sbin/backup-lion-whatsapp-lab`. Antes de implantar uma versão do app, faça um backup manual e marque a imagem atual para rollback (`docker tag lion-whatsapp-lab-app:latest lion-whatsapp-lab-app:rollback-<commit>`).

`config --quiet` evita imprimir a configuração interpolada. Não use `docker compose down -v`: isso remove o volume com mappings e mensagens.

## Teste Slack ↔ mock no VPS

O teste offline automatizado não acessa Slack. Para o smoke test real, faça a chamada abaixo no VPS; ela publica uma mensagem identificada como teste no canal Slack configurado e cria um mapping:

```bash
curl -fsS -X POST http://127.0.0.1:3000/mock/whatsapp/send-test
```

Responda na thread no Slack. Em seguida, confira localmente `/mock/whatsapp/messages` e `/debug/router`. O primeiro endpoint contém texto da equipe: ao registrar evidência, use contagens e IDs, nunca o corpo da mensagem. Reinicie o serviço e responda novamente à mesma thread para validar que o mapping foi restaurado do volume.

Execução validada em 15/10/2026: 13 testes offline passaram dentro do container no VPS; a chamada de smoke test foi aceita pelo Slack; após reinício, a resposta humana foi roteada e capturada. Depois do hardening, uma nova resposta humana na thread também foi encaminhada: `received: 1`, `forwarded: 1`, sem rejeições; o mock passou a registrar duas mensagens. Um backup manual feito em seguida confirmou uma conversa e duas mensagens na cópia, sem exibir o conteúdo.

### Implantação de 22/10/2026 (versão com deduplicação)

Workspace `c052922` e app `a6bf72c` implantados após um backup manual; a imagem anterior foi mantida como `lion-whatsapp-lab-app:rollback-1f00713`. Resultados no VPS:

- 28 testes no container; `/health` 200 com `slack: connected`; limites (256 MiB, 0,5 CPU, 128 PIDs), rotação de logs, filesystem somente leitura, usuário `node`, porta só em loopback.
- O estado anterior (1 conversa, 2 mensagens) foi carregado sem migração; uma nova mensagem para a conversa antiga entrou na thread existente.
- Nova conversa + mensagem seguinte na mesma thread; após `restart`, a mesma thread foi reutilizada.
- Rede do container desconectada: `reconnecting`, HTTP 503 e `unhealthy`; reconectada: `connected`, 200 e `healthy`, com a porta ainda em loopback.
- Script de backup corrigido instalado e mtime dos backups antigos ajustado pelo nome; nenhum backup seria removido de uma vez.
- Teste humano após a correção (app `1d4869f`): resposta de texto encaminhada uma vez à conversa e thread corretas (`forwarded: 1`); anexo recusado com aviso na thread (`unsupported-media: 1`); edição da mensagem ignorada, sem reenvio; JSON malformado/corpo grande retornam 400/413 genéricos; nenhum conteúdo em log.
- Limite conhecido: a edição de uma mensagem no Slack é ignorada em silêncio, então o WhatsApp mantém o texto original e quem editou não é avisado. Definir o comportamento (aviso na thread ou envio da correção) antes do uso real.
- Falha encontrada: um corpo JSON malformado ou grande demais no `send-test` fazia o Express responder com HTML contendo stack trace e um trecho do corpo enviado, e gravar o mesmo no log. Corrigido com um tratador de erro HTTP genérico e `NODE_ENV=production` na imagem.

Para voltar à versão anterior em caso de problema: `git checkout` dos commits anteriores e `docker tag lion-whatsapp-lab-app:rollback-1f00713 lion-whatsapp-lab-app:latest` antes de `up -d` sem `--build`. O estado novo continua compatível com a versão anterior, que ignora `processedEvents`.

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
- Dependências de produção: `npm audit --omit=dev` reportou zero vulnerabilidades conhecidas nas verificações de 15/10/2026 e 22/10/2026.
- Firewall: UFW ativo; regras observadas liberam SSH 22 e Nginx 80/443. Nenhuma regra foi alterada para esta aplicação.
- SSH do host: a configuração efetiva observada permite login root e autenticação por senha e chave pública. Não foi alterada porque afeta a administração do VPS e os demais serviços; o responsável pelo host deve avaliar migrar para chave somente e uma conta administrativa adequada.
- Backup: até 22/10/2026 o script preservava a data de modificação do estado copiado (`docker cp` mantém o mtime original), então todos os backups tinham a data de 16/10 e a retenção os apagaria juntos por volta de 30/10. O script corrigido aplica `touch` na cópia; o comportamento do `docker cp` e a correção foram reproduzidos localmente em 22/10/2026. Depois de instalá-lo, ajuste uma vez os arquivos existentes conforme a seção de backup.
- Um timer do systemd executa backup diário às 03:15 UTC, com atraso aleatório de até 10 minutos e retenção de 14 dias. Os arquivos ficam em `/var/backups/lion-whatsapp-lab`, acessíveis apenas por root (diretório `0700`, arquivos `0600`). O serviço valida o JSON sem exibir seu conteúdo. Consulte abaixo os comandos de operação e restauração.
- Limite do backup: a cópia está no mesmo VPS e não protege contra perda do host ou do disco. Ainda é necessário definir um destino externo antes de usar dados reais.
- A partir da versão com deduplicação, `/health` responde 200 somente com o Socket Mode em `connected` e 503 (`degraded`) nos demais estados. Ainda assim, o teste de resposta real em thread é a evidência funcional do Slack.
- `unhealthy` não reinicia o container nem avisa ninguém: a política `unless-stopped` só age quando o processo termina. O cliente Socket Mode se reconecta sozinho em quedas de rede, mas uma falha persistente (token revogado, app removido) deixa o serviço parado em silêncio. Antes de uso real, adicionar alerta externo sobre o estado de saúde.
- Compose define `mem_limit: 256m`, `cpus: 0.5`, `pids_limit: 128` e rotação de logs Docker (`json-file`, 3 × 10 MB). Em 22/10/2026 o app usava cerca de 78 MiB. Antes dessa versão o container rodava sem limites e sem rotação de log.
- Verificação de 22/10/2026 (somente leitura): `fail2ban` inativo, `unattended-upgrades` ativo, UFW sem alteração, disco em 22%. SSH continua com `PermitRootLogin yes` e `PasswordAuthentication yes`.

## Backup e restauração

Após atualizar o script a partir de `deploy/vps/backup-lion-whatsapp-lab.sh`, corrija uma única vez o mtime dos backups antigos com base no timestamp do nome:

```bash
cd /opt/lion-ai/slack-whatsapp
sudo install -o root -g root -m 0700 deploy/vps/backup-lion-whatsapp-lab.sh /usr/local/sbin/backup-lion-whatsapp-lab
for f in /var/backups/lion-whatsapp-lab/mock-state-*.json; do
  ts="${f##*/mock-state-}"; ts="${ts%.json}"
  sudo touch -d "${ts:0:4}-${ts:4:2}-${ts:6:2} ${ts:9:2}:${ts:11:2}:${ts:13:2} UTC" "$f"
done
```

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
  --entrypoint node lion-whatsapp-lab-app:latest -e 'const fs=require("node:fs"); const raw=fs.readFileSync("/backup/state.json","utf8"); const s=JSON.parse(raw); if(s.version!==1||!Array.isArray(s.conversations)||!Array.isArray(s.messages)) process.exit(1); fs.chownSync("/restore",1000,1000); fs.chmodSync("/restore",0o700); const tmp="/restore/.mock-state.json.restore"; fs.writeFileSync(tmp,raw,{mode:0o600}); fs.chownSync(tmp,1000,1000); fs.chmodSync(tmp,0o600); fs.renameSync(tmp,"/restore/mock-state.json");'
docker compose -p lion-whatsapp-lab --env-file .env up -d app
curl -fsS http://127.0.0.1:3000/health
```

O `chown` da raiz do volume é necessário ao restaurar num volume **novo** (perda do volume ou volume separado para outro workspace): um volume criado vazio pertence ao root, e o app, que roda como `node`, falha na inicialização com `EPERM`. No volume ativo a raiz já pertence ao UID 1000 e o comando não muda nada. Esse caso foi encontrado e validado no ensaio de 22/10/2026: restauração num volume novo, carga do estado pelo app como UID 1000, deduplicação e busca de thread funcionando; o volume temporário foi removido.

Se a validação/restauração falhar antes da substituição, inicie o serviço novamente para voltar ao estado atual. Confira as contagens sem imprimir as mensagens. Nunca use `docker compose down -v` no projeto ativo. O backup local ainda não protege contra perda do VPS; configure uma cópia externa antes de armazenar dados reais.

## Próximas etapas de desenvolvimento

1. Continuar o piloto interno do mock e registrar falhas/reconexões.
2. Definir destino externo para as cópias de backup (restauração completa em volume novo validada em 22/10/2026).
3. Adicionar alerta externo para `/health` em 503/`unhealthy` e decidir o tratamento de edições no Slack (hoje ignoradas em silêncio). A versão com health real, deduplicação, retry, thread por conversa e avisos foi implantada e validada em 22/10/2026.
4. Antes de dados reais: SSH somente com chave, sem login root por senha; avaliar `fail2ban`; backup externo; política de retenção das mensagens.
5. Escolher e encapsular o WhatsApp Adapter conforme o plano. Até essa decisão, manter o mock e não adicionar mídia ou sessão WhatsApp real.
6. Atualizar os critérios do piloto e decidir se a fase seguinte usará provider não oficial somente em laboratório ou a API oficial da Meta.
