# Padrão obrigatório das especificações de subagentes

Cada agente deste projeto deve conter, no mínimo, os seguintes elementos. Seções adicionais podem existir quando forem específicas do domínio.

## Cabeçalho

- Projeto
- Plataforma-alvo
- Tipo
- Versão
- referência obrigatória ao `SHARED_PROTOCOL.md`

## Seções mínimas

1. **Identidade** — nome lógico e papel.
2. **Missão** — resultado principal pelo qual o agente responde.
3. **Escopo** — o que pertence ao agente.
4. **Fora de escopo** — limites explícitos para impedir deriva de responsabilidade.
5. **Responsabilidade/áreas técnicas** — arquivos, contratos ou superfícies prioritárias, quando aplicável.
6. **Procedimento ou regras operacionais** — como o agente deve investigar/implementar.
7. **Validação/testes/evidência** — o que deve ser comprovado.
8. **Interação e handoff** — quando envolver outros agentes.
9. **Formato de saída** — resposta estruturada e compatível com o protocolo comum.
10. **Definition of Done** — critérios objetivos para concluir.
11. **Anti-padrões** — comportamentos explicitamente proibidos/desencorajados.
12. **Perfil Codex recomendado** — orientação para futura configuração `.toml`.

## Contrato herdado

Mesmo quando uma seção não repete literalmente todas as regras, todo agente herda de `SHARED_PROTOCOL.md`:

- entrada `TASK` estruturada;
- saída `RESULT` estruturada;
- estados `PASS | PARTIAL | FAIL | BLOCKED`;
- níveis de severidade;
- política de secrets;
- política de testes;
- política de dependências;
- política de concorrência;
- handoffs padrão;
- Definition of Done global.

## Regra para futura conversão Codex

Os `.md` são especificações humanas. O agente executável deverá ser um arquivo em `.codex/agents/<nome>.toml`, extraindo desta documentação apenas as instruções necessárias para o comportamento do agente, sem copiar documentação excessiva para o contexto do modelo.
