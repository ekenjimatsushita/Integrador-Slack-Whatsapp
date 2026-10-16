# Configurar o Slack de destino

## Como o laboratório funciona hoje

A aplicação usa um único workspace Slack por execução. O workspace e o canal não estão fixos no código: vêm de `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` e `SLACK_CHANNEL_ID`, definidos no `.env` do ambiente. Assim, é possível apontar uma instalação para outro workspace sem alterar a lógica do app.

O app atual **não** implementa instalação OAuth distribuída nem operação simultânea em vários workspaces. Se a equipe precisar operar em vários workspaces ao mesmo tempo, será necessário adicionar OAuth, armazenamento seguro das instalações e seleção de credenciais por `team_id`; apenas adicionar tokens ao `.env` atual não resolve isso.

## Preparar a instalação da empresa

O manifesto [`lion-whatsapp-lab-manifest.yml`](../../deploy/slack/lion-whatsapp-lab-manifest.yml) descreve o setup atual para um canal **público**. Crie/importa o app com esse manifesto enquanto estiver autenticado no workspace corporativo. O app deverá pertencer ao ambiente da empresa; a política desse workspace pode exigir aprovação do administrador antes da instalação.

O manifesto solicita apenas `channels:history` e `chat:write`, assina `message.channels` e habilita Socket Mode. Depois de criar o app:

1. Em **Basic Information**, gere um App-Level Token com `connections:write`; esse valor alimenta `SLACK_APP_TOKEN`.
2. Em **OAuth & Permissions**, instale o app no workspace corporativo e obtenha o Bot User OAuth Token; esse valor alimenta `SLACK_BOT_TOKEN`.
3. Convide o bot para o canal público escolhido. Copie o ID desse canal para `SLACK_CHANNEL_ID`.
4. Confirme com o administrador do Slack que o app, os eventos e esses escopos mínimos são permitidos.

Se o canal de destino for **privado**, use `groups:history` e assine `message.groups` no manifesto, em lugar das permissões/eventos de canal público acima; convide o bot para o canal privado. Não solicite ambos os conjuntos se a equipe usar apenas um tipo de canal.

## Troca do workspace pessoal para o corporativo

Não copie tokens do Slack pessoal para documentação ou mensagens. Mantenha os tokens corporativos somente no `.env` protegido no VPS, com proprietário `root:root` e modo `600`. Antes da troca:

1. Obtenha a aprovação/instalação corporativa e os três valores de configuração acima.
2. Faça backup do estado do mock. Ele contém mappings de threads e textos do workspace usado atualmente; planeje um estado/volume separado para o novo workspace e preserve o atual até validar a migração.
3. Faça a troca do `.env` em uma janela combinada e recrie somente o serviço `app`. Não publique a porta HTTP nem mude regras de firewall para conectar Slack: Socket Mode usa uma conexão de saída.
4. Confirme `/health`, publique uma thread de teste e valide uma resposta humana antes de liberar o uso pela equipe.

Um app criado no workspace pessoal não é automaticamente instalável no workspace da empresa. O caminho mais simples para um único workspace corporativo é criar o app a partir do manifesto dentro do workspace da empresa. Reutilizar o app pessoal em outros workspaces exige distribuição e um fluxo OAuth, que ainda não estão implementados neste projeto.

## Referências Slack

- [Manifesto de apps](https://docs.slack.dev/reference/app-manifest/)
- [Criar app com Bolt for JavaScript](https://docs.slack.dev/tools/bolt-js/creating-an-app/)
- [Distribuição de apps](https://docs.slack.dev/app-management/distribution/)
- [Instalar com OAuth](https://docs.slack.dev/authentication/installing-with-oauth/)
- [Autorização no Bolt for JavaScript](https://docs.slack.dev/tools/bolt-js/concepts/authorization/)
