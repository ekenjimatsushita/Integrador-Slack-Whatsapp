# Estado atual e próximos passos

> Atualize este arquivo ao fim de cada sessão. Última atualização: **22/10/2026**.

## Onde estamos

| Item | Estado |
|---|---|
| App (`main`) | `1d4869f`: thread única por conversa, deduplicação persistida, retry com backoff, aviso de falha/anexo na thread, `WHATSAPP_ADAPTER` (só `mock`), `/health` com o estado real do Socket Mode, erros HTTP genéricos |
| Workspace (`master`) | o commit mais recente contém este arquivo e o ponteiro do app em `1d4869f` |
| Testes | 31 testes offline (`npm test`), passando local, no container e no VPS |
| VPS `179.198.97.107` | rodando `1d4869f`, `healthy`, Slack de laboratório (pessoal); imagem anterior guardada como `lion-whatsapp-lab-app:rollback-1f00713` |
| Validação real (22/10) | conversa nova e mensagens seguintes na mesma thread, persistência após restart, queda/recuperação de rede (503 → 200), resposta humana encaminhada, anexo recusado com aviso, edição ignorada, restauração em volume novo |
| Backup | timer diário 03:15 UTC, retenção de 14 dias, script corrigido (mtime) instalado; cópias **só no próprio VPS** |
| WhatsApp | somente `MockWhatsAppAdapter`; nenhuma conta ou provider real conectado |

## Bloqueios externos

- **Sem acesso ao workspace Slack da empresa.** Quando houver acesso, siga [`../deployment/SLACK_WORKSPACE_SETUP.md`](../deployment/SLACK_WORKSPACE_SETUP.md). Use um projeto Compose e um volume separados e o `chown` da raiz do volume descrito em `VPS_MOCK_LAB.md`.
- **Sem conta WhatsApp Business / Meta.** O adapter real não pode ser testado ainda.

## Decisões pendentes do usuário

1. Provider real: **Cloud API oficial da Meta** ou WPPConnect (não oficial, só em laboratório). O planejamento recomendava o WPPConnect para a PoC. O usuário falou em "API real"; confirme antes de implementar.
2. Conversas individuais ou grupos (a Cloud API tem limitações com grupos; ver seção 37 do planejamento).
3. Canal da empresa público ou privado (muda escopos e eventos do manifesto).
4. Tratamento de edições no Slack: hoje são ignoradas em silêncio.
5. Identificar no WhatsApp quem respondeu no Slack (exige o escopo `users:read`).
6. Remover o container local antigo `whatsappinslack-app-1`.

## Backlog priorizado (o que dá para fazer sem os acessos)

1. **Alerta de saúde:** `unhealthy` não reinicia o container nem avisa ninguém, e um token revogado deixaria o serviço parado em silêncio. Avaliar um monitor externo ou um timer que verifique `/health` e notifique.
2. **Segurança do VPS** (combinar com o usuário): SSH só por chave e sem root por senha, `fail2ban`. Confirme o acesso por chave numa segunda sessão antes de recarregar o `sshd`.
3. **Backup externo** e política de retenção das mensagens (LGPD, seção 42 do planejamento).
4. **Preparar o adapter real com teste:** interface `sendMessage`/`onMessage` e erros com `retryable` (o router já respeita `retryable === false`). Para a Cloud API: webhook HTTPS público só para essa rota via Nginx, validação de `X-Hub-Signature-256`, `messageId` = `wamid` para a deduplicação, janela de 24h (erro não retryable) e respostas 2xx rápidas. Endpoints `/mock/*` não podem ser expostos.
5. Logs estruturados sem conteúdo e métricas (seção 23 do planejamento).
6. Mídia (fase 2 do roadmap), depois que o provider estiver definido.

## Armadilhas já encontradas

- Duas conexões Socket Mode com o mesmo app Slack dividem os eventos (o container local antigo ou um teste local com o VPS ativo).
- `docker cp` preserva o mtime: a retenção baseada em `-mtime` precisa de `touch` (já corrigido).
- Um volume Docker novo nasce com dono root: o app (`node`) falha com `EPERM` se o volume não receber `chown 1000:1000` (já documentado na restauração).
- O Express sem tratador de erro devolve stack trace e trecho do corpo (já corrigido; mantenha `httpErrorHandler` como último middleware).
- O Git Bash no Windows converte caminhos em `docker exec`: use `MSYS_NO_PATHCONV=1`.
