# Texto para quem executa

A orquestradora copia o bloco abaixo inteiro, preenche os campos entre `< >` e o envia a quem executa (subagente ou sessão). Cada linha existe porque o erro que ela evita já aconteceu.

```
Frente <frente>: atribuição da orquestração.

1. Leia o AGENTS.md do projeto e, quando existir, docs/agents/metodo.md; depois, <tickets ou plano>.
2. Trabalhe só no worktree <worktree>. Não edite o checkout principal nem outro worktree.
3. Escolha a trilha do método pelo tamanho da tarefa. Teste primeiro: veja o teste falhar antes de consertar.
4. git add só com os caminhos que você mudou (nunca git add -A nem git add .), e commit no ramo da frente.
5. Comando pesado (suíte longa, build) vai pela fila: tools/ah pesado -- <comando>.
6. Merge na base, push e fechamento da frente ficam com a orquestradora. Não faça.
7. Decisão que é do humano (desenho, custo, dado, publicação): não decida sozinho. Aplique o padrão mais
   conservador, siga, e escreva a pergunta com o padrão aplicado no ticket de decisões (<ticket de decisões>).
8. Achado fora do escopo: anote no ticket da frente e não conserte aqui.
9. Executando um plano por subagentes, com a extensão registros ligada: antes de a skill de execução apagar o
   diário do plano, rode tools/ah registros guardar --frente <frente>.
10. Ao terminar, avise a orquestradora com os commits (git log --oneline <base>..HEAD no worktree), os comandos
    de teste que rodou e a saída deles.
11. Ao travar (falta decisão, acesso, ou o teste não passa e você não sabe por quê): sendo subagente, pare e
    devolva à orquestradora o que falta; sendo sessão, rode tools/ah handoff <frente> --nota "<o que falta>" e avise.
```
