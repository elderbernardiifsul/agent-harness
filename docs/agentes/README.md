# Adaptação do harness a outros agentes

Roteiro para que um agente de código (Codex, OpenCode ou outro) escreva o próprio adaptador, rode os testes de contrato e prove o funcionamento sem auxílio de quem mantém o harness.

## Público

O roteiro se destina ao agente que chega a um projeto com o agent-harness e não é o Claude Code, o único com adaptador até o momento. Sem adaptador, o `tools/ah` funciona (frentes, worktrees, quadro), com três perdas:

- **as travas automáticas não valem:** nada recusa `git push origin main`, `git add -A` ou a edição do worktree de outra sessão antes da execução;
- **não há resumo no começo da sessão** (identificação da sessão, frente própria, frentes das outras sessões);
- **o harness não identifica a sessão:** cada chamada aos comandos do `ah` precisa de `AH_SESSAO=<id>`.

`tools/ah doctor` informa se o agente em uso tem adaptador (item "Adaptador do agente em uso"). Se as variáveis de ambiente não permitem reconhecer o agente, declara-se o nome dele: `AH_AGENTE=<nome> tools/ah doctor`.

## Função do adaptador

O núcleo do harness trabalha com quatro eventos num formato neutro, definidos pelo contrato. O agente tem ganchos próprios, cada um com o próprio formato JSON. O adaptador faz apenas a tradução entre os dois:

```
agente ──(gancho do agente, JSON dele na entrada padrão)──> tools/ah gancho <agente>
          traduzirEntrada: JSON do agente -> evento do contrato
          núcleo: registra a sessão, aplica as travas, monta o resumo
          traduzirSaida:  resposta do contrato -> saída, erro e código que o agente entende
agente <──(saída padrão, saída de erro, código de saída)──
```

O adaptador tem duas partes: o módulo `nucleo/adaptadores/<agente>.mjs`, que faz a tradução, e o arquivo de gancho do agente, que faz o agente chamar `tools/ah gancho <agente>` em cada evento e que o `ah init` copia para o projeto.

## Localização dos arquivos

O adaptador é escrito no **clone do agent-harness**, e não no projeto, porque cada `ah init` substitui a cópia em `.harness/nucleo/` e essa cópia não deve ser editada à mão. Os caminhos citados neste roteiro são relativos ao clone. No projeto, o roteiro está copiado em `.harness/nucleo/docs/agentes/`, e a referência que ele cita, em `.harness/nucleo/docs/referencia/`. Quem não tem o clone deve cloná-lo (o `MANIFEST.json` em `.harness/nucleo/` informa a versão e o commit usados no projeto) e trabalhar nele; ao final, o `init` do clone executado no projeto instala o adaptador.

## Documentos do roteiro

| Arquivo | Conteúdo |
|---|---|
| [contrato.md](contrato.md) | Os quatro eventos (entrada, saída e tratamento no núcleo); a recusa; a sessão e o processo; o fim seguido de continuação; o gancho que falha |
| [exemplo-claude-code.md](exemplo-claude-code.md) | O adaptador existente, comentado, com os JSON reais do ensaio |
| [escrever-um-adaptador.md](escrever-um-adaptador.md) | O passo a passo e o tratamento de eventos que o agente não oferece |
| [provar.md](provar.md) | Os testes de contrato (comando exato) e o ensaio com o agente real |
| [../referencia/capacidades-por-agente.md](../referencia/capacidades-por-agente.md) | O que se sabe sobre Claude Code, Codex e OpenCode (ganchos, formatos, variáveis), com fonte e data |

Ordem de leitura: este arquivo, `contrato.md`, `exemplo-claude-code.md`, `escrever-um-adaptador.md` (que manda consultar a linha do seu agente em `capacidades-por-agente.md` no passo 1), `provar.md`.

## Critérios de conclusão

O adaptador está concluído quando:

1. `AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs` passa no clone (ver [provar.md](provar.md));
2. a suíte inteira (`npm test`) continua passando;
3. o ensaio com o agente real recusou as ações proibidas e está registrado em `docs/referencia/ensaio-<agente>.md`;
4. os eventos que o agente não entrega estão declarados (`EVENTOS_ENTREGUES`) e anotados na tabela de capacidades.
