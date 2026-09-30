# Agentes Codex — Slack ↔ WhatsApp

Este diretório mantém as especificações completas para leitura humana. As definições enxutas carregadas pelo Codex estão em `.codex/agents/`; ambas as formas devem permanecer alinhadas.

O índice de arquivos do projeto fica em [`manifest.json`](../../manifest.json).

## Agentes

| Agente | Responsabilidade |
|---|---|
| `orchestrator` | Decomposição, sequência, handoffs e consolidação |
| `repository_auditor` | Auditoria somente de leitura do repositório |
| `architecture_core` | Contratos, domínio e limites entre camadas |
| `slack_specialist` | Adapter Slack, eventos, Bolt e Socket Mode |
| `whatsapp_specialist` | Adapter, provider e sessão WhatsApp |
| `data_reliability` | Persistência, idempotência e recuperação |
| `qa_e2e` | Testes e evidência de comportamento integrado |
| `devops_security` | Docker, secrets, rede e execução operacional |
| `documentation` | README, ADRs, runbooks e sincronização documental |

Todos seguem [SHARED_PROTOCOL.md](SHARED_PROTOCOL.md). Os `.toml` individuais referenciam suas especificações detalhadas correspondentes.

## Estrutura

```text
.codex/
├── config.toml
└── agents/                 # agentes executáveis do projeto
    └── *.toml
docs/agents/                # especificações humanas e protocolo
└── *.md
```

O limite de concorrência é configurado em `.codex/config.toml`. Use apenas especialistas necessários; paralelize exploração independente e serialize alterações em arquivos ou contratos compartilhados.

## Arquitetura

```text
Slack Adapter → Application Core → WhatsApp Adapter
```

O Core não depende diretamente de SDKs Slack ou providers WhatsApp.
