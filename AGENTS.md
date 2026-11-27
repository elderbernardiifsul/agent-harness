# Instruções para agentes que trabalham neste repositório

Este repositório é o **código-fonte** do agent-harness. Ele não é um projeto que usa o harness.

## O que não vale aqui

As regras que o harness instala nos projetos não se aplicam ao desenvolvimento deste repositório:

- não há `.harness/`, `tools/ah` nem ganchos de agente; não abra frentes, não rode `ah open`, `ah close` ou `ah handoff` aqui;
- as travas T0 a T6, a reserva de tickets, o papel de executor ou orquestrador e o PR obrigatório para `stage` e `main` são comportamento a construir e testar, não regra de trabalho deste repositório;
- `docs/referencia/comandos.md`, `docs/agentes/` e `modelos/` descrevem o projeto que recebe o harness. Leia-os como especificação, não como instrução para esta sessão.

Para ver o harness em funcionamento, instale-o num projeto descartável (README, seção "Laboratório").

## Como se trabalha aqui

- **Ramos.** O trabalho entra na `dev`. Trabalho maior vai num ramo próprio a partir da `dev`, com merge local na `dev`. `stage` e `main` recebem a `dev` quando o autor decide publicar. Push e publicação só com ordem expressa do autor.
- **Código.** Node 22 ou mais novo, módulos ES, sem dependências externas. Código curto e direto: o repositório também é material de estudo, e cada peça precisa ser legível por um concluinte de Ciência da Computação.
- **Testes primeiro.** Executor de testes do Node (`npm test`), sobre repositórios descartáveis e com o `gh` falso de `teste/apoio/`. Nenhum teste usa rede real. Veja o teste falhar antes do conserto.
- **Sem CI.** O repositório não tem CI no GitHub: toda verificação roda nesta máquina. Antes de integrar na `dev`, `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` (suíte no Node mínimo e no atual, e a varredura) com código 0.
- **Antes de cada commit:** `npm test` verde e `node ferramentas/varre-termos.mjs` com código 0. A lista de termos proibidos é um arquivo local do autor (`~/.config/agent-harness/termos-proibidos.txt`), fora do repositório; sem ela, a varredura sai com código 2 e o commit espera o autor.
- **Textos.** Mensagens, documentos e comentários em português. Exemplos com nomes inventados (a loja, Ana Souza, Carla). Nenhum nome do projeto de origem.
- **Recusas.** Toda recusa do harness diz o motivo e o que fazer no lugar (`nucleo/lib/recusa.mjs`).
- **Documentação junto com o código.** Mudança de comportamento atualiza `docs/referencia/comandos.md`. Mudança de decisão atualiza o desenho (`docs/superpowers/specs/`) ou o plano correspondente.
- **Registro.** Planos e registros de execução ficam em `docs/superpowers/plans/`. Pendência encontrada e não tratada é registrada no plano em curso, com o motivo.

## Mapa

| Pasta | Conteúdo |
|---|---|
| `README.md` | Na seção "Instalar num projeto (instruções para o agente)", o procedimento que um agente segue para instalar o harness e o método num projeto (o único lugar dele) |
| `nucleo/` | O que o `init` copia para `.harness/nucleo/` no projeto: `bin/ah.mjs`, `comandos/`, `lib/`, `adaptadores/`, `extensoes/` |
| `modelos/` | Arquivos que o `init` instala no projeto (configuração, ponto de entrada, ganchos, CI, trecho do `AGENTS.md`) |
| `teste/` | Testes do harness; `teste/apoio/` monta repositórios descartáveis e o `gh` falso |
| `ferramentas/` | Ferramentas deste repositório (varredura de termos) |
| `docs/estudo/` | Guia de estudo: problemas, mecanismos, código, testes e limites; histórico da construção |
| `docs/referencia/` | Referência dos comandos, capacidades por agente e ensaios |
| `docs/agentes/`, `docs/extensoes/` | Roteiro de adaptação de agentes e guia de extensão |
| `docs/superpowers/` | Desenho (`specs/`), planos e registros de execução (`plans/`) |
| `docs/aula/`, `docs/video/` | Material da aula e gerador do vídeo de apresentação |
