# Projeto 2: revisão de ponta a ponta do ramo integrado

Revisão de `p2-metodo` em b443ea7 (74 commits sobre a `dev`), sem a fatia 2, feita em 27/11/2026. O revisor foi uma sessão secundária do Claude Code (Opus 5.5), com dois subagentes só de leitura, um para as costuras e a segurança e outro para a documentação. Tudo rodou num worktree destacado e em laboratórios descartáveis: nada foi editado nem commitado no ramo. Nenhum agente foi executado.

Foco, na ordem do pedido: (1) o caminho do aluno; (2) as costuras entre as fatias; (3) a documentação; (4) segurança e perda de dados.

## Como foi conferido

- **Caminho do aluno.** O caminho do clone foi seguido à mão (o worktree da revisão como origem, sem tag), com estado, worktrees, fila, cache, `gh` falso e configuração do git dentro de uma pasta descartável:
  - os passos 1 a 7 da seção "Instalar num projeto (instruções para o agente)";
  - o ciclo `tools/ah open carrinho --tickets 1`, um commit no worktree e o diário criado pelo `sdd-workspace` instalado;
  - `git merge --no-ff` na `dev`, um `close` (recusado, apontando o `guardar`), `tools/ah registros guardar` e o `close` de novo;
  - por fim: ligar `orquestracao` e `wiki` depois e rodar `metodo instalar` de novo; `tools/ah atualizar --de <clone raso>`.

  Tudo funcionou como o texto diz: o `metodo instalar` baixou as coleções reais (d1478fc, 22f0b46) e levou o `.harness/config.json` no `git add`; o `doctor` saiu com 0 falhas; o diário foi comentado com o marcador e a pasta removida; o `close` comentou o resumo; o `sweep` ficou limpo.
- **Costuras.** Um projeto com as oito extensões ligadas, com coleção git local e banco falso, e cenários de `close`, `handoff`, retomada em outra máquina, resumo, quadro e recusas. As suítes das extensões tocadas passam (115 de 115).
- **Documentação.** `comandos.md` inteiro contra o `uso`, as recusas e as saídas reais; a spec (seções 4 a 13 e 17) contra o construído; o README; `interface.md`; o trecho do `AGENTS.md`. Suíte completa: 1248 de 1249 (1 pulado). `varre-termos`: código 0.

## Crítico

**C1. Um id de frente forjado num comentário de ticket leva a `registros` a apagar uma pasta qualquer da máquina.** Reproduzido duas vezes.
- **Onde:**
  - `nucleo/extensoes/registros/extensao.mjs:52`: `dirDasCopias` usa `frente.id` como nome de pasta;
  - `nucleo/extensoes/registros/extensao.mjs:319`: `fs.rmSync(base, {recursive: true, force: true})` depois do `close`;
  - a causa fica no núcleo: `nucleo/comandos/open.mjs:599` (`id: passagem.id`) e `nucleo/lib/reserva.mjs:531` aceitam o `id` do marcador sem conferir o formato.
- **Cenário:**
  - um terceiro, sem associação com o repositório, comenta no ticket um `ah:passagem` com `id=../../../vitima`, depois da passagem verdadeira;
  - na outra máquina, `ah open frete` responde "Frente ../../../vitima frete retomada.";
  - `registros guardar` grava lá, e o `close` apaga a pasta `vitima`, com o conteúdo.
- **Alcance:** com o estado padrão (`$HOME/.local/state/agent-harness/<projeto>`), `id=..` apaga o estado do projeto, e `../../../../..` aponta para o `HOME`. Basta um repositório público.
- **Próximo passo:**
  - no núcleo, validar `^[a-z]{2,4}-\d+$` em todo id lido de marcador e recusar a retomada fora disso;
  - na `registros`, conferir que a pasta fica dentro de `<estado>/registros` antes de gravar ou apagar;
  - um teste para cada um.

**C2. A `ambiente` deixa o `close` apagar um arquivo do aluno que ela mesma reconhece como alheio.**
- **Onde:** `nucleo/extensoes/ambiente/extensao.mjs:206-208`. O `ignorados` declara o arquivo descartável sempre, sem consultar o `eNosso` (`:81-83`).
- **Cenário:**
  - com `"arquivo": ".env"` e o `.env` do aluno (com chaves) no worktree, o `ambiente preparar` avisa que o arquivo é alheio;
  - mas o `close` passa com código 0, e o `.env` some com o worktree;
  - sem a extensão, o mesmo `close` recusaria listando o `.env`;
  - vale também para o `.env.frente` editado sem o cabeçalho.
- **Por que importa:** contradiz `docs/referencia/comandos.md:736` ("nunca é sobrescrito nem apagado") e tira uma proteção que o núcleo já dava.
- **Próximo passo:**
  - declarar o item só quando o arquivo não existe ou é nosso;
  - recusar em `validarConfig` um `arquivo` terminado em `/`, que tornaria descartável uma pasta inteira;
  - um teste para cada caso.

**C3. Três textos entregues apontam para `docs/agents/metodo.md`, que não existe (fatia 2).** É crítico se a `dev` receber o ramo antes da fatia 2; hoje é uma dependência conhecida.
- **Quem aponta:**
  - `nucleo/extensoes/modelo/extensao.mjs:106` imprime `Critérios: docs/agents/metodo.md (nível de modelo).`, e `comandos.md:950` e `:974` documentam a linha;
  - `nucleo/extensoes/metodo/skills/orquestrar/executor.md:8` e `:13` mandam ler o arquivo e escolher a trilha por ele.
- **O que falta por causa disso:** o trecho do `AGENTS.md` (`nucleo/extensoes/metodo/modelos/agents-metodo.md`) não diz que se rode `tools/ah registros guardar` no fim do subagent-driven-development, antes de a skill apagar a pasta do plano (spec, seção 8). Num plano que termina limpo, o diário some antes do `guardar`, e o `close` passa sem registro. Só sobram a recusa do `close` e a linha do resumo, que só existem enquanto a pasta existe.
- **Próximo passo:** a fatia 2 entrega o `metodo.md` e o aponta no trecho, com as duas ocasiões do `guardar`, antes de a `dev` receber o ramo. Se a fatia 2 atrasar, marque as três referências como pendentes.

## Importante

**I1. O `registros guardar` apaga o que não guardou.**
- **Onde:** `nucleo/extensoes/registros/diario.mjs:197-205` e `:212-234`; `extensao.mjs:96-97`.
- **Cenário:** na pasta do plano, `task-2-report.md` e um `notas-do-aluno.md` somem sem aviso, e a cópia guarda só `progress.md` e `meta.json`. Uma pasta de plano só com `plan-path` e `task-1-brief.md` é apagada sem ir para lugar nenhum.
- **Por que importa:** contradiz `docs/extensoes/interface.md` ("não deve apagar o que não guardou").
- **Próximo passo:** guardar a pasta do plano inteira na cópia local, ou apagar só os arquivos conhecidos do `sdd-workspace` e avisar das sobras.

**I2. O diário vai para o ticket sem filtro, e o `handoff` faz isso sozinho.**
- **Onde:** `nucleo/extensoes/registros/diario.mjs:90-110`; `extensao.mjs:403-405` (`aoPassar`).
- **Cenário:** uma linha de decisão do diário com `DATABASE_URL=postgres://ana:SenhaReal123@…` e um caminho pessoal absoluto é comentada literalmente no ticket.
- **Por que importa:** num repositório público, isso vaza sem confirmação de ninguém.
- **Próximo passo:** procurar padrões de segredo e caminhos absolutos antes de publicar, cortando ou recusando com `Faça:`, e dizer isso no `metodo.md`.

**I3. O `migracao renumerar` quebra migrações em par (up e down com o mesmo número).**
- **Onde:** `nucleo/extensoes/migracao/numeros.mjs` (`emDia` e `planoDeRenumeracao`); `extensao.mjs:156-158`.
- **Cenário:** com a base ocupando o 0002, a frente com `0002_frete.down.sql` e `0002_frete.up.sql` vira `0003_…down` e `0004_…up`. Sem nada a renumerar, o par vira dois números diferentes.
- **Por que importa:** é o formato de ferramentas comuns de migração.
- **Próximo passo:** numerar por número distinto, não por arquivo, com teste do par.

**I4. O arquivo de ambiente aponta para um banco que a frente não criou, e outra máquina pode apagá-lo.**
- **Onde:** `nucleo/extensoes/ambiente/extensao.mjs:94-95`, que escreve `BANCO=` mesmo com `criado: false`.
- **Cenário (banco compartilhado):**
  - na retomada em outra máquina, o `criar` falha com "já existe", e o `.env.frente` sai com `BANCO=loja_frete` mesmo assim;
  - o `close` do registro velho, na primeira máquina, apaga `loja_frete`;
  - o `noSweep` (`:255-258`) sugere apagar banco "sem frente" que pode ser de outra máquina;
  - a coluna AMBIENTE não mostra "(não criado)".
- **Próximo passo:** sem `criado`, não escrever a chave do banco (ou escrevê-la comentada) e avisar. No `sweep`, dizer que o banco pode ser de outra máquina.

**I5. No caminho do README, os rótulos de triagem nunca são criados, e o `candidatos` depende deles.**
- **Onde:**
  - `nucleo/extensoes/metodo/sincronizar.mjs:301-302` só cria os rótulos com `github.repo` em texto;
  - o `init` não grava esse campo (`modelos/config.json:6`, `"repo": null`);
  - `README.md:10` dá a entender que, com o `gh`, os rótulos saem.
- **Consequência:** o `ah candidatos` procura `ready-for-agent`, que não existe.
- **Próximo passo:** decidir entre preencher `github.repo` no passo 5, pedindo a licença para criar os rótulos no GitHub (regra do README, linha 7), e fazer o `metodo instalar` avisar quando `github.repo` é nulo.

**I6. Depois do `ah atualizar`, as skills do próprio harness ficam velhas sem aviso.**
- **Onde:** `README.md:66` e a seção `atualizar` de `comandos.md` não mandam rodar `tools/ah metodo instalar` depois. O `doctor` pula a coleção `agent-harness` (`nucleo/extensoes/metodo/doctor.mjs:109`), e "Skills iguais à trava" compara o disco com a trava, não com a cópia nova do núcleo.
- **Próximo passo:** documentar o passo depois do `atualizar` e fazer o `doctor` comparar as skills do harness com `.harness/nucleo/extensoes/metodo/skills/`.

**I7. Nenhum texto que o agente lê diz como ligar uma extensão depois da instalação.**
- **Onde:** o README (passo 5) liga só `metodo`, `registros` e `modelo`; `comandos.md:517` diz só "se ligam em `extensoes`… quando o projeto precisar"; a seção `orquestracao` não diz que a skill `orquestrar` exige rodar o `metodo instalar` de novo.
- **O que a spec promete (seção 4):** ligar na configuração, `tools/ah metodo instalar` e o commit. No ensaio, isso funcionou: o `doctor` avisou das skills que faltavam, e o `instalar` copiou as cinco.
- **Próximo passo:** uma frase em `comandos.md:517` e no `metodo.md` (fatia 2).

**I8. A seção "Situação" do README (`README.md:40-49`) descreve só o projeto 1.**
- **O que falta:**
  - as oito extensões e as skills do harness;
  - os limites do projeto 2: a fatia 2 por fazer; os ensaios pendentes (fatia 1, Task 8, nos três agentes; fatia 5, pendente de autorização; OpenCode sem ensaio).
- **Onde mais:** o registro da fatia 1 tem só a sondagem.
- **Próximo passo:** reescrever a seção e registrar os ensaios como pendências no registro da fatia 1.

**I9. O `comandos.md` está com a frase de abertura e a ordem desatualizadas.**
- **Onde:**
  - `:3` ainda diz "com os comandos `recursos` e `metodo`";
  - as seções das extensões não seguem a ordem da tabela (`:505-515`) e separam os comandos do núcleo (`deps` em `:435`, `whoami` só em `:1079`);
  - `### atualizar` (`:642`, na `metodo`) repete o título de `## atualizar` (`:102`).
- **Próximo passo:** atualizar `:3`, pôr as seções das extensões na ordem da tabela, depois de todo o núcleo, e renomear o subtítulo para "metodo atualizar".

## Menor

Caminho do aluno e `metodo`:
- O conserto do item "Skills iguais à trava (metodo)" quando falta a skill de uma extensão ligada fala em "se as mudanças foram de propósito, guarde-as numa skill de outro nome", e não há mudança nenhuma (`nucleo/extensoes/metodo/doctor.mjs:91`).
- Uma skill mantida por ter mudança à mão sai da trava nova. Depois disso, o `--forcar` sugerido não a remove ("Nada a mudar"), e o `doctor` não acusa a skill de extensão desligada (`sincronizar.mjs:146` e `:277`).
- `comandos.md:603` cita só `preparar-projeto` entre as skills do harness; faltam `orquestrar`, `wiki-*` e `reuniao-ingerir`.
- O segundo exemplo do `metodo instalar` (`comandos.md:637-639`) mostra `Agora rode: tools/ah doctor`, que só sai depois do commit; falta a linha do commit no exemplo.
- Os "Faça" resumidos divergem do texto real (`comandos.md:621` e `:672`).
- O trecho `agents-metodo.md:7` diz que encerrar é "merge na base e `tools/ah close`", sem o `git push origin dev`, que está em `sessoes-paralelas.md` e no passo 6 da `orquestrar`. É a mesma regra em dois lugares; o trecho deveria apontar para a fonte.
- A spec, seção 6: o `metodo atualizar` não mostra skills renomeadas nem a diferença, e a linha `triage → implement` não está no trecho. A spec cita a 1.3.1, e o `colecoes.json` fixa a 1.3.2.

`registros`:
- Num registro velho, a recusa do `close` manda rodar o `guardar`, que comenta no ticket de uma frente ativa em outra máquina.
- Avisos sem próximo passo: `extensao.mjs:125`, `:128-129`, `:180`, `:195`, `:257`, `:261`, `:267` e `:314`.
- Depois de um `close` sem rede, as cópias ficam para sempre: não há comando nem `sweep` que as leve ao ticket.
- `interface.md:197` declara `.superpowers/sdd/` inteira com `guardar`, mas a extensão real declara só as pastas de plano e o `.gitignore`.

Comandos da configuração e texto de terceiros:
- O `spawnSync` da `ambiente` (`:29`) e o passo da `migracao` (`:199`) não têm prazo. O `apagar` roda em `depoisDeFechar`, dentro da trava das frentes (`close.mjs:549`); um `dropdb` que pede senha seguraria todas as sessões.
- Com `padrao` sem âncora, um `{de}` ou `{para}` vindo de um PR de fora pode começar por `--` e virar opção da ferramenta. O `replaceAll` encadeado troca `{para}` dentro de um `{de}` que contenha esse texto.
- Links simbólicos seguidos sem `lstat` (não reproduzido): `.superpowers/sdd` vindo de um PR e `.env.frente` apontando para fora do worktree.
- "A decidir" num comentário de qualquer pessoa tira o ticket dos candidatos. A skill `orquestrar` não diz que o texto de ticket ou PR é dado e não instrução, nem como reconhecer a resposta do humano no ticket de decisões.

Outros:
- O `ambiente preparar` reescreve o arquivo e perde linhas acrescentadas sob o cabeçalho, que diz "não edite".
- `agentes` é uma lista na `metodo` e um objeto na `modelo`: não colide, mas confunde.
- O quadro com todas as extensões passa de cerca de 140 colunas, e a AMBIENTE corta o nome do banco. No resumo, a linha "Sem dona" cortada em 200 caracteres perde frentes sem o "e mais N" (é do núcleo).
- `ah prova` sem argumentos sai com `Rótulo inválido: undefined`, sem recusa própria (`nucleo/extensoes/prova/extensao.mjs:76`).
- Variáveis de ambiente (`comandos.md:9-24`):
  - falta `CLAUDE_CONFIG_DIR` (lida em `nucleo/extensoes/metodo/plugins.mjs:17`);
  - `AH_CACHE` não cita `XDG_CACHE_HOME`;
  - já faltavam na `dev` `AH_AGENTE` e `AH_PESADO_VERBOSO`.
- O exemplo do `init` (`comandos.md:80-94`) não tem o `CLAUDE.md` da P1. `comandos.md:39` (quem exige sessão) cobre só a `recursos` entre as extensões.
- O `AGENTS.md:11` da raiz não lista `nucleo/extensoes/metodo/skills/` nem `modelos/` entre os textos a ler como especificação, e não como instrução.
- As decisões E1 (`pede-revisao`) e a forma da P5 com `descartavel` estão nos registros, mas não foram levadas à spec.
- Os auxiliares `criarProjeto` e `projetoDeTeste` não isolam `HOME` nem `CLAUDE_CONFIG_DIR`: um teste que rode o `doctor` com a `metodo` ligada lê os plugins do agente da máquina (só o `metodo-doctor.test.mjs` isola).

## Limites desta revisão

- Não avaliado:
  - o `gh` real (associação de membro com participação privada, paginação, comentários acima de 64 KiB);
  - os prazos reais de rede e das ferramentas de banco;
  - o conteúdo exato do `sdd-workspace` em todos os casos;
  - o Codex e o OpenCode;
  - o efeito, num agente real, do diário devolvido e do texto de ticket;
  - Windows e macOS;
  - corridas entre dois `close` ou dois `open`;
  - `docs/estudo/`;
  - as seções do núcleo que este ramo não mudou;
  - o `verifica.mjs` com os dois Node.
- Com o `gh` falso, o `doctor` dá ok à proteção de `stage` e `main` num projeto sem remoto, porque o `gh` falso responde sucesso a tudo. Não é defeito do harness.
- Efeito colateral da revisão: um `ah init` de um subagente rodou uma vez sem `AH_ESTADO` e criou `$HOME/.local/state/agent-harness/`, com `maquina.json` e `loja/origem.json`, às 01:38 de 27/11. A pasta não existia antes. A remoção foi deixada ao professor.

## Consertos de I5, I6 e de parte do "Menor"

- **I5.** Sem `github.repo`, o `metodo instalar` e o `metodo atualizar` acham o repositório pelo `gh repo view`, como o `repoAtual` do núcleo, e criam os rótulos nele (`rotulos.mjs`, `repoDoProjeto`). Sem repositório, avisam com o próximo passo. O passo 5 do README avisa o aluno de que os rótulos são criados no GitHub.
- **I6.** No `doctor`, o item novo `Skills do harness em dia (metodo)` compara a trava com `.harness/nucleo/extensoes/metodo/skills/`. O `ah atualizar`, com a `metodo` ligada, termina mandando rodar `tools/ah metodo atualizar`, e o README diz o mesmo.
- **Menor, consertados:**
  - o conserto de "Skills iguais à trava" só fala em guardar mudanças quando há arquivo alterado;
  - `comandos.md` lista as seis skills do harness;
  - o segundo exemplo do `metodo instalar` tem o commit antes do `Agora rode`;
  - o "Faça" do uso do `metodo` está igual ao texto real;
  - o subtítulo virou `### metodo atualizar`;
  - `CLAUDE_CONFIG_DIR` entrou nas variáveis lidas;
  - o trecho `agents-metodo.md` aponta o encerramento para `docs/agents/sessoes-paralelas.md`.
- **Menor, deixados:**
  - a skill mantida por mudança à mão que sai da trava. O conserto pede decidir como a trava guarda uma skill fora da lista, em cada destino;
  - a spec, seção 6 (skills renomeadas, diferença, `triage → implement`, 1.3.1 contra 1.3.2). É decisão de desenho, não conserto.

## Consertos de I8, I9 e do resto do "Menor" de documentação

- **I8.** A seção "Situação" do README traz a versão 0.3.0, o projeto 2 entregue e os limites conhecidos. O registro da fatia 1 ganhou o ensaio final (Task 8) e as pendências do autor.
- **I9.** Abertura do `comandos.md` atualizada; as seções do núcleo vêm primeiro (comandos e seções gerais), depois a "Extensões" e as extensões na ordem da tabela. As seções foram movidas inteiras, sem reescrita.
- **Menor, consertados:** `AH_AGENTE` e `AH_PESADO_VERBOSO` nas variáveis; `AH_CACHE` cita `XDG_CACHE_HOME`; a regra de sessão das extensões aponta para a seção de cada uma; o exemplo do `init` tem o `AGENTS.md` e o `CLAUDE.md` (saída real); `interface.md` diz que o exemplo dos `ignorados` é simplificado; o `AGENTS.md` da raiz cita as skills e os modelos do método entre os textos a ler como especificação.
- **Menor, deixados:** os de código e os de desenho listados acima (E1 e P5 na spec, versão 1.3.1 citada na spec, instrução da `orquestrar` sobre texto de ticket como dado).
