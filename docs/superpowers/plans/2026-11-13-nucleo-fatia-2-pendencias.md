# Fatia 2 do núcleo: decisões da execução e pendências

Plano: [2026-11-13-nucleo-fatia-2.md](2026-11-13-nucleo-fatia-2.md). Execução em 12 e 13/11/2026, por subagentes, com revisão por tarefa, revisão final do ramo e duas ondas de conserto. Estado no fim: 758 testes (757 passam, 1 pulado fora do Windows); a varredura de termos sai com código 0.

O que a fatia entregou: papel de orquestrador e `open --para`, `handoff`, retomada de frente passada, `takeover`, `sweep`, as travas T1, T3 e T4, herança da frente na continuação da sessão, os itens novos do `doctor` e o ciclo completo com duas sessões simuladas.

## Decisões tomadas durante a execução

O autor não foi consultado em cada uma; qualquer delas pode ser revista.

Sessão e continuação:
1. `/clear` e `--resume` no mesmo processo são continuação: a sessão nova herda a frente da antiga. O fim de sessão com esses motivos não encerra a sessão; o começo seguinte, com o mesmo processo, herda.
2. Herança por processo só quando a hora de início do processo é conhecida e igual nos dois lados. Onde ela não se lê (Windows; macOS se o `ps` falhar), não há herança por processo: a frente fica com a sessão antiga até o sinal vencer, e a T4 deixa passar a sessão do mesmo processo.
3. Na continuação, a frente muda de dona antes de a sessão antiga ser encerrada, para não haver instante sem proteção.
3a. Na continuação para uma sessão executora que já tem frente ativa (o `/resume` de uma conversa com frente), as frentes da sessão anterior não são herdadas: ficam passadas, como no `handoff` (passagem pela fila de pendentes), o foco do destino não muda, e sai `frente-solta` com `motivo: "destino-ja-tem-frente"`; o resumo manda `tools/ah open <nome>`. O orquestrador herda tudo.

Reserva e corrida:
4. A reserva no `open` é em duas fases: nome e ID guardados sob a trava, o comentário no ticket fora dela, o worktree sob a trava de novo. O registro intermediário (`abrindo`) guarda o processo do `open` e só é tomado com esse processo morto.
5. Duas sessões que disputam o mesmo ticket: vale a ordem do servidor dentro de cada ticket. A frente fica só se, em cada ticket dela, o seu comentário é o de menor número entre as frentes ativas; senão desiste de tudo. Duas desistências ao mesmo tempo são aceitas (as duas tentam de novo).
6. O `open` recusa reservar ticket que tem comentário na fila de pendentes.
7. Sem rede, a retomada de frente com tickets é recusada: nunca duas donas vale mais que retomar sem rede. Frente sem tickets retoma sem consulta.
8. A retomada de frente com tickets vai sempre pelo servidor, também na mesma máquina que passou a frente.
9. O `close` de frente passada primeiro toma a frente pela mesma corrida da retomada; perdendo, fecha só o registro local.
10. Os marcadores nos tickets ganharam o campo `sid` (resumo da sessão inteira), para "é meu" não depender do começo do nome da sessão.

Takeover e travas:
11. O `takeover` exige `--confirmado`. A spec pede confirmação humana, e o gancho não tem como perguntar; fica como acordo de confiança, igual ao `AH_GUARD=off`. Sem `--confirmado`, o comando só lê.
12. O `takeover` comenta pelo arquivo de pendentes, fora da trava.
13. A T4 cobre comandos do git e também `rm`, `mv`, `cp`, `sed -i`, redirecionamentos e as ferramentas de edição de arquivo do agente, dentro de worktree de outra sessão viva. Cobre também a pasta que contém o worktree e os curingas do shell.
14. Dona com registro ilegível conta como viva: ninguém toma a frente até o registro ser consertado.
15. O `close` nunca remove o worktree com `--force`. Se aparecer arquivo novo entre a conferência e a remoção, recusa.
16. O `close` apaga o ramo remoto da frente só quando ele está contido na base do remoto. Com a base ainda não enviada, o ramo fica e o comando diz o que fazer.
17. O `init` recusa repositório sem nenhum commit.

## Não ensaiado

- **Codex e OpenCode:** só o Claude Code foi ensaiado de verdade (decisão do autor). A coluna dos outros em `docs/referencia/capacidades-por-agente.md` vem da documentação.
- **Windows e macOS:** não executados. O caminho sem hora de início do processo foi exercitado só com substituto de teste.
- O ensaio com o Claude Code real está em `docs/referencia/ensaio-claude-code.md`. Foi esse ensaio que achou o defeito do `/clear` (o agente avisa o fim da sessão antes do começo da seguinte), que os testes simulados não pegavam.

## Limites das travas

As travas pegam engano, não má-fé. Passam sem recusa:
- `git pull --rebase` no checkout principal;
- `git push origin :<ramo>`, `git push --delete <ramo>` e `git update-ref -d` sobre ramo de outra frente;
- `find -delete`, `xargs rm`, `unlink`, `shred`, `rsync`, `tar -C`, `python -c` e qualquer programa que escreva por conta própria;
- a leitura de `sed -i`, `perl -i` e `cp -t` é aproximada.

## Pendências

- **Rede dentro da trava no `close`:** a consulta ao servidor e o `push` que apaga o ramo remoto rodam com a trava de frentes presa (prazo de 20 s). Tirar exige o `close` em duas fases, como o `open`; pede tarefa própria.
- **Curinga e pasta oculta:** na T4, `*` e `?` casam componente que começa com ponto, e o shell não expande assim. `rm -rf *` numa pasta acima de um diretório oculto que guarda worktree de outra sessão viva é recusado à toa.
- **`close` recusado na remoção do worktree:** a essa altura o ticket já recebeu o comentário de fechamento e perdeu responsável e rótulo; a frente segue ativa até o segundo `close`.
- **Retomadas cruzadas:** duas sessões que retomam frentes uma da outra ao mesmo tempo podem perder as duas e precisar tentar de novo.
- **Frentes antigas:** as abertas antes desta fatia não têm a lista de sessões anteriores; a lista só cresce.
- **Sessão sem processo:** `ah` rodado à mão, sem `AH_PID_AGENTE`, registra sessão sem processo; o quadro a marca como "sem processo" e ela vale até o sinal vencer.
- **Sessão que aguarda continuação:** se o começo seguinte nunca chega e o processo segue vivo, a frente fica protegida até o processo morrer ou o sinal vencer.
- **Gancho:** lê todas as frentes a cada ferramenta (cerca de 50 ms com 20 frentes).
- **Datas:** os registros usam UTC e as telas, a hora local, sem indicação.
- **`caminhosEmComum`:** `a/xb` contra `a/**/b` acusa colisão (de propósito: `a/xb` pode ser pasta).
- `board` e `sweep` com a pasta de frentes sem permissão de leitura recusam com motivo, mas não têm teste próprio.

Para as próximas fatias (por desenho): fila do trabalho pesado e trava T6 (fatia 3); atualização do harness instalado num projeto (fatia 5); adaptadores de Codex e OpenCode.
