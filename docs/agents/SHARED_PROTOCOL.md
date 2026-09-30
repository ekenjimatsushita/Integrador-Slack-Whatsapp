# Protocolo Compartilhado dos Subagentes

> Projeto: Integração Slack ↔ WhatsApp  
> Plataforma-alvo: OpenAI Codex  
> Versão: 1.0

## 1. Finalidade

Este documento define o contrato operacional comum a todos os subagentes do projeto. Cada especificação de agente complementa este protocolo com responsabilidades, arquivos, testes e limites próprios.

A meta do sistema multiagente não é maximizar o número de agentes trabalhando ao mesmo tempo. A meta é aumentar a confiabilidade do desenvolvimento, reduzir perda de contexto, separar responsabilidades e produzir evidências verificáveis de que o projeto funciona.

## 2. Princípios obrigatórios

Todos os agentes devem:

1. Ler as instruções aplicáveis do repositório antes de agir, incluindo `AGENTS.md`, `AGENTS.override.md`, documentação de arquitetura, ADRs e instruções mais específicas do diretório em que atuarão.
2. Trabalhar somente dentro do escopo recebido.
3. Distinguir fatos observados de hipóteses.
4. Preferir evidência executável a inferência quando for possível testar.
5. Não declarar sucesso sem validação proporcional à alteração.
6. Não ocultar falhas, testes não executados ou dependências ausentes.
7. Não alterar código fora de seu domínio sem um handoff explícito ou autorização do Orchestrator.
8. Não expor secrets, tokens, cookies, QR codes, dados de sessão ou conteúdo sensível em logs, commits ou relatórios.
9. Não usar números, workspaces, credenciais ou sistemas de produção para testes sem autorização explícita.
10. Fazer mudanças pequenas, rastreáveis e reversíveis.
11. Evitar refatorações incidentais que não sejam necessárias para cumprir a tarefa.
12. Preservar o desacoplamento entre Slack, Core e WhatsApp.

## 3. Regra de concorrência

Subagentes podem atuar em paralelo quando as tarefas são independentes e predominantemente de leitura, investigação ou teste.

Agentes que precisem editar os mesmos arquivos, a mesma camada ou contratos compartilhados NÃO devem modificar esses arquivos em paralelo.

Quando houver conflito potencial:

```text
subagente identifica conflito
        ↓
não edita
        ↓
retorna BLOCKED ou PARTIAL
        ↓
informa arquivos/contratos envolvidos
        ↓
Orchestrator define ordem de execução
```

O Orchestrator é o responsável final pela sequência de alterações dependentes.

## 4. Contrato de entrada

Toda tarefa delegada deve conter, sempre que aplicável:

```text
TASK
Goal:
Context:
Relevant files:
Constraints:
Expected output:
Tests required:
Do not modify:
Dependencies:
```

O agente deve solicitar ou localizar contexto adicional somente quando isso for realmente necessário para executar a tarefa com segurança.

Se informação essencial não puder ser obtida, retornar `BLOCKED` em vez de inventar premissas.

## 5. Estados permitidos

Todo subagente encerra uma tarefa com exatamente um estado principal:

### PASS

O objetivo foi cumprido e validado.

### PARTIAL

Parte útil do objetivo foi concluída, mas existe uma limitação claramente identificada que impede conclusão total.

### FAIL

A abordagem executada não atende ao objetivo, causou regressão ou os testes relevantes falharam.

### BLOCKED

O agente não pode prosseguir com segurança por falta de dependência, permissão, decisão arquitetural, credencial de laboratório, serviço externo ou outra condição objetiva.

`PASS` não significa "parece correto". Deve haver evidência proporcional ao risco.

## 6. Contrato de saída

Todo agente deve retornar, no mínimo:

```text
RESULT

Status: PASS | PARTIAL | FAIL | BLOCKED

Summary:
- resumo objetivo do resultado

Evidence:
- comandos executados
- testes relevantes
- arquivos/símbolos examinados
- comportamento observado

Changes:
- arquivos alterados
- natureza das alterações
- "none" se a tarefa era somente leitura

Risks / Limitations:
- riscos remanescentes
- testes não executados
- premissas

Handoff:
- agente recomendado, se necessário
- pergunta ou tarefa concreta para o próximo agente
```

Para auditorias e revisões, acrescentar:

```text
Findings:
- severidade
- arquivo/símbolo
- evidência
- impacto
- ação sugerida
```

## 7. Níveis de severidade

### CRITICAL
Risco imediato de perda de dados, exposição de secrets, envio para destinatário incorreto, loop descontrolado, comprometimento relevante ou operação insegura.

### HIGH
Falha funcional importante, perda provável de mensagens, bypass de autorização, persistência inconsistente ou comportamento incorreto em condições comuns.

### MEDIUM
Problema real que afeta manutenibilidade, observabilidade, recuperação ou comportamento em casos menos comuns.

### LOW
Melhoria útil, dívida técnica ou pequena inconsistência sem impacto operacional relevante imediato.

Não usar severidade para questões puramente estéticas.

## 8. Evidência mínima

Quando possível, a evidência deve conter:

- comando executado;
- código de saída;
- teste específico;
- log relevante sem dados sensíveis;
- arquivo e símbolo;
- antes/depois do comportamento;
- reprodução mínima.

Evitar respostas como:

> "Parece estar funcionando."

Preferir:

```text
PASS — npm test
PASS — npm run lint
PASS — integração Slack Adapter com FakeWhatsAppAdapter
PASS — evento duplicado processado uma única vez
```

## 9. Regras para mudanças

Antes de modificar código, o agente deve:

1. localizar as instruções de projeto aplicáveis;
2. verificar o estado atual relevante;
3. identificar o menor conjunto de arquivos que precisa mudar;
4. compreender os testes existentes da área;
5. declarar internamente quais contratos não podem ser quebrados.

Depois de modificar:

1. executar testes focados;
2. executar verificações mais amplas quando proporcional ao risco;
3. revisar o diff;
4. verificar se secrets foram introduzidos;
5. registrar limitações.

## 10. Política de dependências

Nenhum agente deve adicionar dependência de produção apenas por conveniência.

Antes de adicionar:

- confirmar que a capacidade não existe no runtime ou dependências atuais;
- justificar manutenção e segurança;
- preferir bibliotecas maduras;
- fixar versão de forma coerente com a política do projeto;
- atualizar documentação relevante;
- executar testes.

Dependências ligadas a WhatsApp não oficial devem ser tratadas como substituíveis e isoladas no adapter.

## 11. Política de documentação externa

Quando o comportamento depender de APIs externas, o agente deve preferir fontes oficiais e atuais.

Especialmente:

- Slack: documentação oficial do Slack;
- WhatsApp Business Platform: documentação oficial da Meta;
- Codex: documentação oficial OpenAI;
- WPPConnect / whatsapp-web.js: repositórios e documentação oficial dos respectivos projetos.

Código antigo do repositório é evidência do estado atual, não necessariamente da API atual.

## 12. Política de secrets

Nunca:

- imprimir tokens completos;
- versionar `.env`;
- versionar sessão do WhatsApp;
- versionar QR code;
- copiar credenciais em fixtures;
- incluir secrets em snapshots;
- registrar headers de autenticação.

Ao encontrar credencial aparentemente real:

1. não reproduzir o valor;
2. sinalizar a localização;
3. recomendar rotação;
4. tratar como finding de segurança.

## 13. Política para WhatsApp não oficial

Durante a PoC:

- usar número de laboratório;
- evitar qualquer automação massiva;
- não tratar WPPConnect ou whatsapp-web.js como contrato permanente;
- manter o provider atrás de `WhatsAppAdapter`;
- documentar desconexões e comportamento de sessão;
- não prometer estabilidade equivalente à API oficial.

Qualquer recomendação para produção deve reavaliar os requisitos e a API oficial vigente.

## 14. Política de testes

### Mudança local pura
- unitário focado;
- lint/typecheck relacionado.

### Mudança em adapter
- unitário;
- integração com fake/mocks;
- contrato do adapter.

### Mudança em roteamento/persistência
- unitário;
- integração;
- restart/idempotência quando aplicável.

### Mudança E2E
- usar ambiente de laboratório;
- registrar passos de reprodução;
- não usar produção sem autorização.

## 15. Handoffs padrão

### Para Architecture/Core
Quando a dúvida é sobre contrato, domínio, responsabilidade de camada ou comportamento comum a providers.

### Para Slack Specialist
Quando a dúvida depende de eventos, scopes, Socket Mode, threads, arquivos ou rate limits do Slack.

### Para WhatsApp Specialist
Quando depende de sessão, QR, grupos, mídia, IDs, `fromMe`, WPPConnect, whatsapp-web.js ou futura Cloud API.

### Para Data/Reliability
Quando envolve persistência, idempotência, retries, filas, migrations ou recuperação após falha.

### Para QA/E2E
Quando é necessário provar comportamento integrado ou regressão.

### Para DevOps/Security
Quando envolve containers, rede, secrets, exposição de portas, CI/CD, hardening, observabilidade operacional ou vulnerabilidades.

### Para Documentation
Quando uma decisão aceita precisa virar documentação persistente.

### Para Orchestrator
Quando existe conflito de escopo, prioridade, arquitetura ou alteração simultânea.

## 16. Definition of Done global

Uma tarefa só pode ser considerada pronta quando:

- objetivo solicitado está atendido;
- mudanças respeitam a arquitetura;
- testes relevantes foram executados ou a impossibilidade está documentada;
- não há secret introduzido;
- limitações são explícitas;
- documentação necessária foi atualizada ou encaminhada;
- nenhum agente concorrente está editando o mesmo contrato sem coordenação;
- o resultado inclui evidências.

## 17. Anti-padrões globais

Evitar:

- big-bang refactor;
- alterar muitas camadas em um único passo sem necessidade;
- usar `any`/tipos genéricos para contornar contratos;
- silenciar erros para fazer teste passar;
- retries infinitos;
- `catch` que descarta erro;
- sleeps arbitrários como solução de sincronização;
- hardcode de IDs de canal, tokens ou números;
- lógica de Slack dentro do WhatsApp Adapter;
- lógica de WhatsApp dentro do Slack Adapter;
- testes que dependem de produção;
- assumir que mensagem entregue significa processada;
- considerar ausência de exception como prova de sucesso.

## 18. Nota sobre Codex

Estas especificações são documentação humana e base para geração dos custom agents.

Na etapa de implementação no Codex, cada agente deverá ser convertido para um arquivo `.toml` em:

```text
.codex/agents/
```

com pelo menos:

```toml
name = "..."
description = "..."
developer_instructions = """
...
"""
```

Configurações como modelo, esforço de raciocínio e sandbox poderão ser definidas por agente.
