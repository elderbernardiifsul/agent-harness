# Adaptar o harness ao seu agente

Roteiro para um agente de código (Codex, OpenCode ou qualquer outro) escrever o adaptador dele, rodar os testes de contrato e provar que funciona, sem ninguém do harness por perto.

## Para quem é

Para o agente que chega a um projeto com o agent-harness e não é o Claude Code. Hoje só o Claude Code tem adaptador. Sem adaptador, o `tools/ah` funciona (frentes, worktrees, quadro), mas com três perdas:

- **as travas automáticas não valem:** nada recusa `git push origin main`, `git add -A` ou a edição do worktree de outra sessão antes de rodar;
- **não há resumo no começo da sessão** (quem você é, sua frente, as frentes dos outros);
- **o harness não sabe quem é a sessão:** os comandos do `ah` precisam de `AH_SESSAO=<id>` em cada chamada.

`tools/ah doctor` diz se o agente em uso tem adaptador (item "Adaptador do agente em uso"). Se o seu agente não for reconhecido pelas variáveis de ambiente, declare-o: `AH_AGENTE=<nome> tools/ah doctor`.

## O que o adaptador faz

O núcleo do harness conhece quatro eventos, num formato neutro (o contrato). O agente conhece os ganchos dele, cada um com um JSON próprio. O adaptador é a tradução entre os dois, e só isso:

```
agente ──(gancho do agente, JSON dele na entrada padrão)──> tools/ah gancho <agente>
          traduzirEntrada: JSON do agente -> evento do contrato
          núcleo: registra a sessão, aplica as travas, monta o resumo
          traduzirSaida:  resposta do contrato -> saída, erro e código que o agente entende
agente <──(saída padrão, saída de erro, código de saída)──
```

São duas peças: o módulo `nucleo/adaptadores/<agente>.mjs` (a tradução) e o arquivo de gancho do agente (o que faz o agente chamar `tools/ah gancho <agente>` em cada evento), que o `ah init` copia para o projeto.

## Onde as coisas moram

O adaptador se escreve no **clone do agent-harness**, não no projeto: a cópia em `.harness/nucleo/` do projeto é substituída a cada `ah init` e ninguém a edita à mão. Os caminhos deste roteiro são do clone. No projeto, este roteiro está copiado em `.harness/nucleo/docs/agentes/` e a referência que ele cita em `.harness/nucleo/docs/referencia/`. Se você não tem o clone, clone o agent-harness (o `MANIFEST.json` em `.harness/nucleo/` diz a versão e o commit que o projeto usa) e trabalhe nele; no fim, rode o `init` do clone no projeto para levar o adaptador.

## O mapa

| Arquivo | Para quê |
|---|---|
| [contrato.md](contrato.md) | Os quatro eventos: o que entra, o que sai, o que o núcleo faz com cada um; a recusa; a sessão e o processo; o fim que é continuação; o gancho que quebra |
| [exemplo-claude-code.md](exemplo-claude-code.md) | O adaptador que existe, comentado, com os JSON reais do ensaio |
| [escrever-um-adaptador.md](escrever-um-adaptador.md) | O passo a passo, e o que fazer quando o seu agente não tem um dos eventos |
| [provar.md](provar.md) | Os testes de contrato (comando exato) e o ensaio com o agente de verdade |
| [../referencia/capacidades-por-agente.md](../referencia/capacidades-por-agente.md) | O que se sabe de Claude Code, Codex e OpenCode: ganchos, formatos, variáveis, com fonte e data |

Ordem de leitura: este arquivo, `contrato.md`, `exemplo-claude-code.md`, `escrever-um-adaptador.md`, `provar.md`.

## Pronto quando

O adaptador está pronto quando:

1. `AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs` passa no clone (ver [provar.md](provar.md));
2. a suíte inteira (`node --test teste/`) continua passando;
3. o ensaio com o agente de verdade recusou as ações proibidas e está registrado em `docs/referencia/ensaio-<agente>.md`;
4. o que o seu agente não entrega está declarado (`EVENTOS_ENTREGUES`) e escrito na tabela de capacidades.
