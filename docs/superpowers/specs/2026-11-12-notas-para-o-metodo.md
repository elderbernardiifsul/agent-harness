# Notas para o projeto 2 (método e conhecimento)

Não é um desenho. São as decisões que o autor (elderbernardi) já tomou em 12/11/2026, durante a conversa do núcleo, guardadas para o desenho do projeto 2 começar delas.

## Decididas pelo autor

- **Regra geral:** o harness sugere e registra; só as travas recusam. O método é recomendação.
- **Wiki dentro:** como base de conhecimento do projeto, com as skills dela (ingestão, consulta, conferência), e o harness conversa com ela.
- **Skill de ingestão de reunião:** no molde do roteiro já praticado (gravação → legenda com falante → transcrição → blocos por agentes → artigos na wiki, com as sobras para o humano decidir).
- **Cofre de segredos:** sugestão opcional.
- **Deploy:** depois.
- **Toda interação do aluno é pelo agente.** "Prepare meu projeto" cria ou aponta os repositórios (aplicação e identidade), instala o harness e as skills, e termina no `ah doctor`.
- **Skills recomendadas:** Superpowers e as do Matt Pocock, com instalação apontada pelo harness. Testar em Claude Code, Codex e OpenCode.
- **Pacote de skills ou plugin:** follow-up.

## Proposta de integração das skills (apresentada; o autor não objetou)

Um dono por etapa:

| Etapa | Skill | O que fica escrito | Harness |
|---|---|---|---|
| Entender e triar | triagem e issues (Matt Pocock) | Ticket com rótulo | — |
| Investigação longa | wayfinder, research, prototype (MP) | Mapa e tickets filhos, `docs/research/` | — |
| Decisão com o humano | grilling (MP) | Ticket de decisões por exceção (silêncio = padrão) | — |
| Vocabulário e decisões | domain-modeling (MP) | `CONTEXT.md`, `docs/adr/` | — |
| Desenho | brainstorming (Superpowers) | Spec | — |
| Plano | writing-plans (SP) | Plano com o comando de partida para colar numa sessão nova | `ah open --tickets --plano` |
| Execução | subagent-driven-development com test-driven-development (SP) | Commits e registros da execução | Worktree da frente, fila de pesado |
| Depuração | systematic-debugging (SP) | Teste de regressão | — |
| Revisão | requesting-code-review (SP) | Commit de consertos | — |
| Verificação | verification-before-completion (SP) | Comando e saída no PR ou ticket | — |
| Integrar e encerrar | nenhuma; é do harness | Linha do histórico | merge na `dev`, `ah close` ou `ah handoff` |

- Atritos resolvidos no `AGENTS.md` instalado: worktree e encerramento de branch são do `ah` (não das skills do Superpowers que fazem isso); um TDD só (o do Superpowers); "pronto" exige comando e saída.
- Três trilhas por tamanho (um commit; plano de partida; spec e plano), mais a de investigação longa, com o critério de escolha escrito.
- Os registros da execução por subagentes deixam de ficar só na máquina: o `handoff` os leva e o `close` resume no ticket (extensão).
- Instalação com versão fixada, conferida pelo `doctor`. **A verificar na documentação oficial:** como cada coleção se instala no Codex e no OpenCode.
- No manual, cada etapa traz o princípio durável que exercita.

## Peso do método (da avaliação do desenho; o autor aceitou)

- A trilha padrão do aluno é a leve (um commit, ou plano de partida). Spec e plano só para mudança de desenho.
- Duas coleções de skills carregam muito texto no contexto: o `AGENTS.md` instalado diz quais skills entram em cada trilha, para o agente não carregar as outras.
- Paralelismo em dois níveis: subagentes dentro de uma frente (a skill de plano pergunta se a execução é por subagentes ou na própria conversa) e várias sessões entre frentes. O manual explica os dois e o custo de cada um.
- A mesma regra não se repete em vários documentos: um lugar só, e os outros apontam.

## Escolha de modelos (o autor aceitou)

- Três níveis com nomes neutros (alto, médio, leve) e o esforço dentro de cada um; tabela de critérios no manual.
- A tradução de nível para modelo e esforço reais fica na configuração do projeto, por agente.
- O plano marca o nível de cada tarefa; o orquestrador usa a marca ao distribuir.
- Comando de consulta (`ah modelo <nível>`), como extensão.
- O harness registra o modelo de cada sessão e mostra no quadro, para medir depois o uso de modelo grande em trabalho pequeno.
- Nunca recusa por causa de modelo.
