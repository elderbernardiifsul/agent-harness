// Roteiro do vídeo de apresentação do repositório. Cada cena tem um tipo de tela (telas.js) e uma lista de
// passos; cada passo tem a fala (texto da legenda) e, quando a voz sintetizada leria mal, `voz` (texto falado).
// A duração de cada passo vem da duração do áudio da fala. Blocos de terminal citam as saídas reais em
// demo/saidas/ (gravadas por demo/capturar.sh, com a pasta do ensaio e a do clone abreviadas); `comando` só abrevia a linha do comando, com "…".

export const SECOES = {
  1: 'Cenário e problemática',
  2: 'O método',
  3: 'O repositório por dentro',
  4: 'Demonstração',
  5: 'Limites e como começar',
};

const EVENTO = '{"session_id":"carla-terminal","hook_event_name":"PreToolUse", …';

export const CENAS = [
  // ------------------------------------------------------------------ 1. cenário e problemática
  {
    id: 'abertura', secao: 1, tipo: 'capa',
    rotulo: 'agent-harness · apresentação do repositório',
    titulo: 'Várias sessões de agentes num mesmo repositório',
    sub: 'Comandos e ganchos que coordenam frentes de trabalho, ramos, travas e estado local',
    endereco: 'github.com/elderbernardiifsul/agent-harness · ramo dev',
    passos: [
      { fala: "Este vídeo apresenta o agent-harness, um repositório que coordena várias sessões de agentes de código no mesmo projeto.", voz: "Este vídeo apresenta o êidjent rárness, um repositório que coordena várias sessões de agentes de código no mesmo projeto." },
    ],
  },
  {
    id: 'laco', secao: 1, tipo: 'diagrama', diagrama: 'laco',
    rotulo: 'Cenário', titulo: 'Agente de código: um modelo num laço de ferramentas',
    passos: [
      { anim: "todo", fala: "Um agente de código é um modelo num laço. O modelo lê o contexto e pede uma ferramenta, como rodar um comando. O programa executa, e o resultado volta ao contexto até o modelo responder sem pedir ferramenta." },
    ],
  },
  {
    id: 'harness', secao: 1, tipo: 'duas',
    rotulo: 'Cenário', titulo: 'Harness: o que envolve o modelo',
    colunas: [
      { titulo: 'Harness do agente', sub: 'vem com o programa: Claude Code, Codex, OpenCode',
        itens: ['ferramentas e permissões', 'ganchos antes e depois das ferramentas', 'gestão do contexto: limpar, compactar'] },
      { titulo: 'Harness do projeto', sub: 'a equipe escreve e mantém', acento: true,
        itens: ['instruções: <code>AGENTS.md</code>, skills', 'comandos próprios', 'ganchos com as regras do projeto', 'proteção de ramo e CI no servidor'] },
    ],
    passos: [
      { ate: 1, fala: "Harness é o que envolve o modelo: ferramentas, permissões, contexto e ganchos. Uma parte vem com o programa do agente.", voz: "Rárness é o que envolve o modelo: ferramentas, permissões, contexto e ganchos. Uma parte vem com o programa do agente." },
      { ate: 2, fala: "A outra parte a equipe escreve: instruções, comandos, ganchos e proteção de ramo. O repositório trata dessa parte." },
    ],
  },
  {
    id: 'colisao', secao: 1, tipo: 'diagrama', diagrama: 'colisao',
    rotulo: 'Cenário fictício: projeto loja', titulo: 'Três sessões, uma pasta',
    passos: [
      { fase: 0, anim: 1.8, fala: "Com uma sessão, a pessoa acompanha o agente. No cenário da aula, Ana abre três terminais no projeto loja, com agentes para carrinho, cupom e frete; Carla trabalha de casa." },
      { fase: 1, anim: 4.8, fala: "Na mesma pasta, as sessões colidem. O commit do cupom leva junto o total do carrinho, editado pela metade. O frete troca de ramo, e as outras sessões passam a escrever no ramo dele." },
    ],
  },
  {
    id: 'problemas', secao: 1, tipo: 'lista', compacta: true,
    rotulo: 'Problemática', titulo: 'Seis problemas e as causas',
    itens: [
      { t: 'A conversa limpa perde o vínculo com o trabalho', c: 'causa: a conversa é a única memória da sessão' },
      { t: 'As sessões escrevem no mesmo diretório', c: 'causa: uma pasta tem um ramo em uso e um índice' },
      { t: 'Ninguém sabe quem faz o quê', c: 'causa: um quadro dentro do git vira commit e conflito' },
      { t: 'Duas sessões pegam a mesma tarefa', c: 'causa: conferir e pegar são dois passos' },
      { t: 'Regra só pedida é descumprida', c: 'causa: a instrução é texto; nada confere o comando' },
      { t: 'Sessão que para deixa trabalho pela metade', c: 'causa: quem morre não registra nada' },
    ],
    passos: [
      { fala: "Primeiro problema: Ana limpa a conversa quando o contexto enche, e o agente novo não sabe que o carrinho era dele. A conversa é a única memória da sessão." },
      { fala: "Segundo: as sessões dividem a pasta, e uma pasta tem um só ramo em uso e um só índice." },
      { fala: "Terceiro: ninguém sabe quem faz o quê. Um quadro dentro do git vira um commit a cada mudança e um conflito a cada merge." },
      { fala: "Quarto: Ana e Carla pegam o mesmo ticket, porque conferir que ele está livre e pegá-lo são dois passos." },
      { fala: "Quinto: a instrução manda não enviar para a main, e o agente envia numa forma que ela não previa. Nada fora do modelo confere o comando.", voz: "Quinto: a instrução manda não enviar para a mêin, e o agente envia numa forma que ela não previa. Nada fora do modelo confere o comando." },
      { fala: "Sexto: a conversa trava no meio. Quem morre não registra nada, e de fora uma sessão morta parece igual a uma lenta." },
      { ate: 6, nota: "Vários escritores no mesmo estado, sem coordenador, formam um sistema concorrente.", fala: "São escritores concorrentes no mesmo estado, sem coordenador. O método responde a cada problema com um mecanismo, que tem custo e condição de falha." },
    ],
  },

  // ------------------------------------------------------------------ 2. o método
  {
    id: 'identidade', secao: 2, tipo: 'mecanismo',
    rotulo: 'Problema 1 · identidade', titulo: 'Identidade pela sessão do agente; herança só com prova',
    custos: [
      { k: 'Identidade', v: 'o id de conversa que o agente fornece; à mão, <code>AH_SESSAO</code>' },
      { k: 'Vínculo', v: 'registro fora da conversa; resumo no começo de cada conversa' },
      { k: 'Herança', v: 'só no mesmo processo do agente (pid e hora de início)' },
      { k: 'Custa', v: 'às vezes uma frente fica sem dono e alguém a retoma', w: true },
      { k: 'Falha quando', v: 'o agente não fornece id nem avisa o começo da conversa', w: true },
    ],
    exemplo: { doc: 'docs/referencia/comandos.md', linhas: [612, 617], antes: '# resumo do começo de sessão (exemplo de docs/referencia/comandos.md)' },
    passos: [
      { custos: 3, fala: "Identidade: a sessão usa o id de conversa que o agente fornece, ou a variável AH_SESSAO. O vínculo com a frente fica fora da conversa, e o gancho entrega um resumo no começo de cada uma.", voz: "Identidade: a sessão usa o id de conversa que o agente fornece, ou a variável á agá sessão. O vínculo com a frente fica fora da conversa, e o gancho entrega um resumo no começo de cada uma." },
      { custos: 5, fala: "A conversa nova herda a frente só no mesmo processo do agente. Na dúvida, não herda: melhor uma frente sem dono, que alguém retoma, do que dois donos." },
    ],
  },
  {
    id: 'worktrees', secao: 2, tipo: 'mecanismo', diagrama: 'worktrees',
    rotulo: 'Problema 2 · isolamento', titulo: 'Um worktree e um ramo por frente',
    custos: [
      { k: 'Custa', v: 'uma pasta e as dependências por frente; os conflitos aparecem no merge', w: true },
      { k: 'Falha quando', v: 'uma sessão escreve na pasta de outra (as travas cobrem esse caso)', w: true },
    ],
    passos: [
      { custos: 0, anim: 2.6, fala: "Isolamento: cada frente ganha ramo e pasta próprios, com git worktree. O histórico é um só; ramo e índice são de cada pasta. A pasta principal fica na dev, para integrar." },
      { custos: 2, fala: "Custa uma pasta e as dependências por frente, e o conflito aparece no merge, onde alguém decide." },
    ],
  },
  {
    id: 'quadro', secao: 2, tipo: 'mecanismo',
    rotulo: 'Problema 3 · registro', titulo: 'Quadro de coordenação fora do git',
    custos: [
      { k: 'Agora', v: 'quem faz o quê: arquivos da máquina, escrita atômica, um escritor por vez' },
      { k: 'Histórico', v: 'no git: uma linha por frente fechada' },
      { k: 'Entre máquinas', v: 'comentários nos tickets do GitHub' },
      { k: 'Custa', v: 'outra máquina vê só o que passa pelos tickets', w: true },
      { k: 'Falha quando', v: 'a frente não tem ticket: fica invisível para outra máquina', w: true },
    ],
    exemplo: { arquivo: '08-board', manter: ['ID ', 'as-1', 'as-2'], antes: '# o quadro desta máquina, na demonstração' },
    passos: [
      { custos: 3, fala: "Registro: quem faz o quê fica em arquivos da máquina, fora do git, com escrita atômica. No git fica só o histórico das frentes fechadas, e entre máquinas o canal são os tickets." },
      { custos: 5, fala: "Outra máquina vê só o que passa pelos tickets; frente sem ticket fica invisível para ela." },
    ],
  },
  {
    id: 'reserva', secao: 2, tipo: 'mecanismo', diagrama: 'reserva',
    rotulo: 'Problema 4 · reserva', titulo: 'Reserva no ticket; o servidor desempata',
    custos: [
      { k: 'Custa', v: 'sem rede, ninguém reserva', w: true },
      { k: 'Falha quando', v: 'pedidos cruzados (#1,#2 contra #2,#1): as duas podem desistir', w: true },
    ],
    passos: [
      { custos: 0, anim: 6.2, fala: "Reserva: cada abertura comenta no ticket e relê. Com duas reservas, fica a que o servidor registrou primeiro; a outra desiste e desfaz o que fez. O relógio das máquinas não decide." },
      { custos: 2, fala: "Sem rede, ninguém reserva. E pedidos cruzados, um e dois contra dois e um, podem fazer as duas desistirem." },
    ],
  },
  {
    id: 'travas', secao: 2, tipo: 'lista', compacta: true,
    rotulo: 'Problema 5 · regras', titulo: 'Gancho antes do comando, com falha fechada',
    itens: [
      { n: 'T0', t: 'comando ilegível que menciona git ou gh' },
      { n: 'T1', t: 'trocar o ramo da pasta principal' },
      { n: 'T2', t: '<code>git add</code> de tudo e <code>commit -a</code> na pasta principal' },
      { n: 'T3', t: 'descartar trabalho na pasta principal' },
      { n: 'T4', t: 'escrever na pasta ou no ramo de outra sessão viva' },
      { n: 'T5', t: 'push para ramo protegido; <code>gh pr merge</code> com base protegida' },
      { n: 'T6', t: 'trabalho pesado fora da fila da máquina' },
    ],
    passos: [
      { ate: 1, fala: "Regras: o gancho lê cada comando antes de ele rodar e recusa o que estraga o trabalho dos outros, com motivo e saída. Se não consegue ler um comando que menciona git, recusa: é a falha fechada." },
      { ate: 7, fala: "T1 a T3 guardam a pasta principal; T4, a pasta de outra sessão viva; T5, os ramos protegidos; T6, a memória da máquina.", voz: "Tê um a tê três guardam a pasta principal; tê quatro, a pasta de outra sessão viva; tê cinco, os ramos protegidos; tê seis, a memória da máquina." },
      { ate: 7, nota: "A barreira efetiva é a proteção de ramo no servidor. Método fica como instrução.", fala: "O gancho lê texto, e há formas que escapam; a barreira efetiva é a proteção de ramo no servidor. Método fica como instrução e nunca é motivo de recusa." },
    ],
  },
  {
    id: 'vida', secao: 2, tipo: 'mecanismo', diagrama: 'vida',
    rotulo: 'Problema 6 · interrupção', titulo: 'Sinal de vida com prazo; passagem com nota',
    custos: [
      { k: 'Custa', v: 'prazo curto: a sessão lenta parece morta; prazo longo: a morta parece viva', w: true },
      { k: 'Falha quando', v: 'quem para sem aviso não deixa nota', w: true },
    ],
    passos: [
      { fase: 0, custos: 0, anim: 6.2, fala: "Interrupção: cada sessão renova um sinal de vida a cada ação. Sem sinal em cento e vinte minutos, ou sem processo, a frente fica órfã, e só uma decisão humana a passa adiante." },
      { fase: 1, custos: 0, anim: 3.2, fala: "Quem para de propósito faz o handoff: envia o ramo e deixa uma nota no ticket. Outra sessão retoma com o open." },
      { fase: 2, custos: 2, fala: "O prazo troca um erro por outro: curto, a sessão lenta parece morta; longo, a morta parece viva." },
    ],
  },
  {
    id: 'principio', secao: 2, tipo: 'capa',
    rotulo: 'Princípio do autor',
    titulo: 'O harness sugere e registra; só recusa o que protege o trabalho dos outros e a máquina.', tituloTam: 76,
    passos: [
      { fala: "A regra do autor: o harness sugere e registra, e só recusa o que protege o trabalho dos outros e a máquina.", voz: "A regra do autor: o rárness sugere e registra, e só recusa o que protege o trabalho dos outros e a máquina." },
    ],
  },

  // ------------------------------------------------------------------ 3. o repositório
  {
    id: 'arvore', secao: 3, tipo: 'arvore',
    rotulo: 'Repositório', titulo: 'O que há nas pastas',
    linhas: [
      { txt: 'agent-harness/', dir: true },
      { txt: '├── nucleo/', dir: true, c: 'o harness, em Node, sem dependências' },
      { txt: '│   ├── bin/ah.mjs', c: 'ponto de entrada dos comandos' },
      { txt: '│   ├── comandos/', c: 'init, open, board, handoff, close…' },
      { txt: '│   ├── lib/', c: 'travas, vida da sessão, reserva, estado' },
      { txt: '│   └── adaptadores/', c: 'Claude Code e o contrato dos eventos' },
      { txt: '├── modelos/', dir: true, c: 'o que o init instala: tools/ah, ganchos, CI' },
      { txt: '├── docs/referencia/', dir: true, c: 'cada comando, as recusas e os limites' },
      { txt: '├── docs/agentes/', dir: true, c: 'roteiro para escrever outro adaptador' },
      { txt: '├── docs/aula/', dir: true, c: 'slides e material de apoio' },
      { txt: '└── teste/', dir: true, c: 'node --test teste/' },
    ],
    passos: [
      { ate: 6, fala: "O núcleo é escrito em Node, sem dependências: comandos, travas, vida da sessão e reserva, mais o adaptador do Claude Code." },
      { ate: 11, fala: "A pasta de modelos guarda o que o init instala; em docs ficam a referência, o roteiro para outros agentes e a aula." },
      { ate: 11, nota: "Requisitos: Node 22 ou mais novo, git e, para tickets e proteção de ramo, o <code>gh</code> com login.", fala: "Requisitos: Node vinte e dois, git e, para tickets e proteção de ramo, o gh com login.", voz: "Requisitos: Node vinte e dois, git e, para tickets e proteção de ramo, o gê agá com login." },
    ],
  },
  {
    id: 'codigo', secao: 3, tipo: 'codigo',
    rotulo: 'Repositório', titulo: 'Trecho real: o cabeçalho das travas',
    arquivo: 'nucleo/lib/travas.mjs', trecho: [1, 11],
    passos: [
      { "fala": "As travas são funções puras: decidem pelo texto do comando, sem tocar o git nem o disco, e os testes as exercitam sem agente. A T4, destacada, cobre git, escrita de arquivo, redirecionamento e edição.", "voz": "As travas são funções puras: decidem pelo texto do comando, sem tocar o git nem o disco, e os testes as exercitam sem agente. A tê quatro, destacada, cobre git, escrita de arquivo, redirecionamento e edição.", "marca": [8, 9] },
    ],
  },

  // ------------------------------------------------------------------ 4. demonstração
  {
    id: 'demo-preparo', secao: 4, tipo: 'lista', numerada: false,
    rotulo: 'Demonstração', titulo: 'Um repositório descartável, sem rede',
    itens: [
      { t: 'projeto <code>loja</code>: um commit na <code>main</code>; o init cria <code>dev</code> e <code>stage</code>' },
      { t: 'sem rede: o <code>gh</code> é um script que falha; sem ticket e sem proteção no servidor' },
      { t: 'duas sessões à mão: <code>AH_SESSAO=ana-terminal</code> e <code>AH_SESSAO=carla-terminal</code>' },
      { t: 'saídas reais; <code>&lt;demo&gt;</code> abrevia a pasta do ensaio' },
    ],
    passos: [
      { ate: 2, fala: "A demonstração usa um repositório descartável e não usa rede: o gh é um script que falha, então não há ticket nem proteção no servidor.", voz: "A demonstração usa um repositório descartável e não usa rede: o gê agá é um script que falha, então não há ticket nem proteção no servidor." },
      { ate: 4, fala: "As duas sessões rodam à mão, com nomes na variável AH_SESSAO.", voz: "As duas sessões rodam à mão, com nomes na variável á agá sessão." },
    ],
  },
  {
    id: 'demo-init', secao: 4, tipo: 'terminal',
    rotulo: 'Demonstração', titulo: 'init: instalar o harness no projeto',
    blocos: [{
      arquivo: '01-init',
      comando: 'node <clone>/nucleo/bin/ah.mjs init --projeto loja --sigla as --sem-protecao',
      manter: ['Criei:', '.harness/nucleo/ (', '  .harness/config.json\n', '  tools/ah\n', '  AGENTS.md\n', '  .claude/settings.json\n', '  .github/workflows/ah-ci.yml\n', 'ramo dev', 'ramo stage', 'Falta levar', 'git switch dev', 'git commit -m', 'Depois rode'],
      marcas: ['Falta levar o harness'],
    }],
    passos: [
      { fala: "O init copia o núcleo para o projeto, cria o comando ah, liga os ganchos do Claude Code e grava o AGENTS.md. Ele não faz commit: mostra os comandos para o commit na dev.", voz: "O init copia o núcleo para o projeto, cria o comando á agá, liga os ganchos do Claude Code e grava o arquivo agents. Ele não faz commit: mostra os comandos para o commit na dev." },
    ],
  },
  {
    id: 'demo-doctor', secao: 4, tipo: 'terminal',
    rotulo: 'Demonstração', titulo: 'doctor: conferir a instalação',
    blocos: [{
      arquivo: '02-doctor',
      manter: ['Node 22', 'git presente', 'aviso', 'Gancho responde', 'falha(s)'],
      marcas: ['!aviso   Proteção no servidor'],
    }],
    passos: [
      { fala: "O doctor confere vinte e três itens e ensaia recusas reais do gancho. Os quatro avisos vêm da falta do gh e da CI desligada; avisos não mudam o código de saída.", voz: "O dóctor confere vinte e três itens e ensaia recusas reais do gancho. Os quatro avisos vêm da falta do gê agá e da CI desligada; avisos não mudam o código de saída." },
    ],
  },
  {
    id: 'demo-open', secao: 4, tipo: 'terminal',
    rotulo: 'Demonstração', titulo: 'open e whoami: duas sessões, duas frentes',
    blocos: [
      { arquivo: '03-open-ana', marcas: ['Trabalhe em'] },
      { arquivo: '04-whoami-ana' },
      { arquivo: '05-open-carla' },
    ],
    passos: [
      { fala: "A sessão da Ana abre a frente carrinho: ramo, worktree e registro na máquina. Com tickets, o open também reservaria o ticket." },
      { fala: "Em seguida, a sessão confere quem ela é, o papel e a frente em foco." },
      { fala: "Carla abre a frente cupom, com outro worktree." },
    ],
  },
  {
    id: 'demo-board', secao: 4, tipo: 'terminal',
    rotulo: 'Demonstração', titulo: 'Trabalho no worktree e o quadro',
    blocos: [
      { arquivo: '06-commit-ana', antes: '# no worktree <demo>/wt/carrinho' },
      { arquivo: '07-nota-ana' },
      { arquivo: '08-board', marcas: ['Sessões vivas'] },
    ],
    passos: [
      { ate: 2, fala: "Ana faz o commit no worktree dela e deixa uma nota na frente." },
      { ate: 3, fala: "O board mostra frentes, donas e notas. Rodadas à mão, sem processo de agente, as sessões vivem só pelo sinal.", voz: "O bôrd mostra frentes, donas e notas. Rodadas à mão, sem processo de agente, as sessões vivem só pelo sinal." },
    ],
  },
  {
    id: 'demo-recusas', secao: 4, tipo: 'terminal',
    rotulo: 'Demonstração', titulo: 'Recusas do gancho',
    blocos: [
      { arquivo: '09-t4', comando: `echo '${EVENTO} "tool_name":"Edit", "file_path":"<demo>/wt/carrinho/src/total.js" …}' | tools/ah gancho claude-code`, marcas: ['!Recusado (T4)'] },
      { arquivo: '10-t5', comando: `echo '${EVENTO} "command":"git push origin dev:main"}' | tools/ah gancho claude-code`, marcas: ['!Recusado (T5)'] },
      { arquivo: '11-t2', comando: `echo '${EVENTO} "command":"git add -A"}' | tools/ah gancho claude-code`, marcas: ['!Recusado (T2)'] },
    ],
    passos: [
      { ate: 1, fala: "Agora as recusas, com o evento que o Claude Code mandaria ao gancho. Carla tenta editar o total no worktree da Ana: a T4 recusa, porque a dona está viva, e indica o handoff ou o takeover. O código dois faz o agente desistir da ferramenta.", voz: "Agora as recusas, com o evento que o Claude Code mandaria ao gancho. Carla tenta editar o total no worktree da Ana: a tê quatro recusa, porque a dona está viva, e indica o handoff ou o takeover. O código dois faz o agente desistir da ferramenta." },
      { ate: 3, fala: "Um push de dev para main cai na T5, e um git add com tudo, na pasta principal, cai na T2.", voz: "Um push de dev para mêin cai na tê cinco, e um git add com tudo, na pasta principal, cai na tê dois." },
    ],
  },
  {
    id: 'demo-handoff', secao: 4, tipo: 'terminal',
    rotulo: 'Demonstração', titulo: 'handoff e retomada por outra sessão',
    blocos: [
      { arquivo: '12-handoff-ana', marcas: ['!Aviso: sem remoto'] },
      { arquivo: '13-open-carla-recusa', marcas: ['!Recusado'] },
      { arquivo: '14-close-cupom' },
      { arquivo: '15-open-carla-retoma' },
      { arquivo: '16-board', marcas: ['falta o teste do total'] },
    ],
    passos: [
      { ate: 1, fala: "Ana para no meio, com handoff e nota. Sem remoto, só esta máquina retoma a frente." },
      { ate: 2, fala: "Carla tenta retomar e é recusada: uma sessão executora tem uma frente só, e ela ainda tem o cupom." },
      { ate: 4, fala: "Ela fecha o cupom e retoma o carrinho." },
      { ate: 5, fala: "No board, a frente tem nova dona e a nota da Ana.", voz: "No bôrd, a frente tem nova dona e a nota da Ana." },
    ],
  },
  {
    id: 'demo-close', secao: 4, tipo: 'terminal',
    rotulo: 'Demonstração', titulo: 'merge na dev e close',
    blocos: [
      { arquivo: '17-commit-carla', antes: '# no worktree <demo>/wt/carrinho' },
      { arquivo: '18-close-antes', marcas: ['!Recusado'] },
      { arquivo: '19-merge', antes: '# no checkout principal, na dev' },
      { arquivo: '20-close' },
      { arquivo: '22-historico', manter: ['- 2026-11-13', 'docs(frentes)', 'merge: carrinho'], marcas: ['as-1 · carrinho'] },
    ],
    passos: [
      { ate: 2, fala: "Carla escreve o teste e tenta fechar antes do merge. O close recusa, porque perderia dois commits, e diz as saídas." },
      { ate: 4, fala: "Depois do merge na dev, o close remove o worktree e o ramo e solta a frente." },
      { ate: 5, fala: "Ele também grava uma linha no histórico, com um commit na dev." },
    ],
  },
  {
    id: 'demo-limite', secao: 4, tipo: 'lista', numerada: false,
    rotulo: 'Demonstração', titulo: 'O que esta demonstração não mostra',
    itens: [
      { t: 'reserva de ticket e comentário de passagem', c: 'pedem o GitHub' },
      { t: 'proteção de ramo no servidor', c: 'pede o GitHub e um remoto' },
      { t: 'o gancho chamado pelo agente real', c: 'registrado em <code>docs/referencia/ensaio-claude-code.md</code>' },
      { t: 'sessão viva pelo processo do agente', c: 'aqui as sessões vivem só pelo sinal' },
    ],
    passos: [
      { "ate": 4, "fala": "Ficaram de fora a reserva de ticket e a proteção no servidor, que pedem o GitHub. O gancho chamado pelo agente real está no ensaio com o Claude Code, e aqui as sessões vivem só pelo sinal." },
    ],
  },

  // ------------------------------------------------------------------ 5. limites e como começar
  {
    id: 'limites', secao: 5, tipo: 'lista', compacta: true,
    rotulo: 'Limites', titulo: 'O que o harness não resolve',
    itens: [
      { t: 'Método', c: 'plano, revisão e critério de pronto ficam com a equipe' },
      { t: 'Custo', c: 'espera, tokens e manutenção do harness; medir pede registro à parte' },
      { t: 'Má-fé', c: 'o gancho lê texto: <code>python -c</code>, <code>find -delete</code>, <code>xargs rm</code> passam' },
      { t: 'Fora do agente', c: 'comando digitado no terminal não passa pelo gancho' },
      { t: 'Outros agentes', c: 'só o Claude Code foi ensaiado; Codex e OpenCode têm roteiro sem ensaio' },
    ],
    passos: [
      { ate: 2, fala: "Limites: método e critério de pronto ficam com a equipe, e o custo em tokens e em espera não é medido." },
      { ate: 3, fala: "Contra má-fé, sem caixa de areia, o gancho não basta: um python menos c ou um find com delete passam." },
      { ate: 4, fala: "O comando digitado no terminal, fora do agente, não passa pelo gancho; a proteção no servidor continua valendo." },
      { ate: 5, fala: "Só o Claude Code foi ensaiado; Codex e OpenCode têm roteiro de adaptação, sem ensaio." },
    ],
  },
  {
    id: 'comecar', secao: 5, tipo: 'terminal',
    rotulo: 'Como começar', titulo: 'Instalar num projeto',
    blocos: [
      { texto: '# 1. clonar\n$ git clone https://github.com/elderbernardiifsul/agent-harness ~/agent-harness' },
      { texto: '# 2. na pasta do projeto (repositório git com pelo menos um commit)\n$ node ~/agent-harness/nucleo/bin/ah.mjs init' },
      { texto: '# 3. o commit na dev, com os comandos que o init mostra; depois\n$ tools/ah doctor' },
    ],
    passos: [
      { ate: 3, legenda: "Comandos do README · material da aula em <code>docs/aula/</code> · referência em <code>docs/referencia/comandos.md</code>", fala: "Para começar: clone, rode o init no seu projeto, faça o commit na dev e rode o doctor. Material e referência estão em docs.", voz: "Para começar: clone, rode o init no seu projeto, faça o commit na dev e rode o dóctor. Material e referência estão em docs." },
    ],
  },
  {
    id: 'fim', secao: 5, tipo: 'capa',
    rotulo: 'agent-harness',
    titulo: 'github.com/elderbernardiifsul/agent-harness', tituloTam: 66,
    sub: 'ramo dev · material em docs/aula/ · referência em docs/referencia/',
    passos: [
      { fala: "O endereço do repositório está na tela.", cauda: 2.0 },
    ],
  },
];
