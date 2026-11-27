// O diário da execução por subagentes: onde fica, como se lê e como vai para um comentário de ticket e volta.
//
// A dor: o subagent-driven-development (Superpowers 7.0.2) guarda o diário de cada plano em
// `.superpowers/sdd/<pasta do plano>/progress.md`, dentro do worktree e ignorado pelo git. Remover o worktree apaga
// o diário, e a própria skill apaga a pasta quando a revisão final fica limpa. Este módulo não guarda nada: só lê e
// escreve o formato. Quem guarda é a extensão (`extensao.mjs`).
//
// O formato da 7.0.2 (SKILL.md, scripts/sdd-workspace e references/ da skill):
//   - a pasta tem `plan-path` (o caminho do plano, relativo à raiz) e `progress.md`;
//   - a primeira linha do diário é `# SDD ledger — plan: <caminho do plano>`;
//   - linhas `Task <N>: complete (commits <a7>..<b7>, review clean|<K> parked)`, `Task <N>: fix round <R>/5 (…)`,
//     `Task <N>: minor (deferred): …`, `Task <N>: parked — …` e decisões com `Ruling:`.
// A leitura é tolerante: diário em outro formato vai como texto, cortado, e o comentário diz isso.
import fs from 'node:fs';
import path from 'node:path';

const CABECALHO = /^# SDD ledger — plan: (.+?)\s*$/;
const CONCLUIDA = /^Task (\d+): complete \(commits ([0-9a-f]+)\.\.([0-9a-f]+), (.+)\)\s*$/;
const TAREFA = /^Task (\d+):/;
// Limites do texto do diário no comentário. O GitHub aceita até 65 536 caracteres por comentário.
export const LIMITE_RECONHECIDO = 60000;
export const LIMITE_DESCONHECIDO = 4000;
// Nome da pasta de plano e caminho do plano vindos de fora (o marcador de um comentário): a pasta não começa por
// ponto (sombrearia o .gitignore do sdd-workspace) nem tem barra; o plano é relativo à raiz, sem `..` nem `\\`.
const PASTA_VALIDA = /^[^./\\][^/\\]*$/;
const planoValido = plano => typeof plano === 'string' && plano !== '' && !path.isAbsolute(plano) && !plano.includes('\\') && !plano.split('/').includes('..');

const sdd = worktree => path.join(worktree, '.superpowers', 'sdd');
const lerOuNada = arquivo => { try { return fs.readFileSync(arquivo, 'utf8'); } catch { return null; } };
const curta = (t, n = 100) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

// Os diários do worktree, um por pasta de plano, em ordem de nome: [{pasta, plano, arquivo, texto}].
export function acharDiarios(worktree) {
  let nomes;
  try {
    nomes = fs.readdirSync(sdd(worktree), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch {
    return [];
  }
  const achados = [];
  for (const pasta of nomes) {
    const arquivo = path.join(sdd(worktree), pasta, 'progress.md');
    const texto = lerOuNada(arquivo);
    if (texto === null) continue;
    const marcado = lerOuNada(path.join(sdd(worktree), pasta, 'plan-path'))?.trim() || null;
    achados.push({ pasta, plano: marcado ?? lerDiario(texto).plano, arquivo, texto });
  }
  return achados;
}

// O que o diário diz: {reconhecido, plano, concluidas: [{tarefa, de, ate, revisao}], paradas: [{tarefa, ultima}],
// decisoes: [linha]}. `paradas` são as tarefas citadas sem a linha `complete`, com a última linha de cada uma.
export function lerDiario(texto) {
  const linhas = String(texto).split('\n');
  const cabeca = CABECALHO.exec(linhas[0] ?? '');
  const concluidas = [];
  const ultimas = new Map();
  const decisoes = [];
  for (const l of linhas) {
    const c = CONCLUIDA.exec(l);
    if (c) concluidas.push({ tarefa: Number(c[1]), de: c[2], ate: c[3], revisao: c[4] });
    const t = TAREFA.exec(l);
    if (t) ultimas.set(Number(t[1]), l.trim());
    if (l.includes('Ruling:')) decisoes.push(l.trim());
  }
  const feitas = new Set(concluidas.map(c => c.tarefa));
  const paradas = [...ultimas].filter(([n]) => !feitas.has(n)).map(([tarefa, ultima]) => ({ tarefa, ultima }));
  return { reconhecido: Boolean(cabeca), plano: cabeca?.[1] ?? null, concluidas, paradas, decisoes };
}

// A cerca do bloco de código tem uma crase a mais que a maior sequência de crases do diário (no mínimo quatro),
// para o texto nunca fechar o bloco antes da hora.
function cercaPara(texto) {
  const maiores = [...String(texto).matchAll(/`+/g)].map(m => m[0].length + 1);
  return '`'.repeat(Math.max(4, ...maiores));
}

// `<!-- ah:<tipo> chave=valor … v=<n> -->`, com cada valor em encodeURIComponent (sem espaço, legível por máquina).
function marcador(tipo, campos, versao = 1) {
  const pares = Object.entries(campos).map(([k, v]) => `${k}=${encodeURIComponent(v ?? '')}`);
  return `<!-- ah:${tipo} ${pares.join(' ')} v=${versao} -->`;
}

// As duas fases de um diário no ticket. `passagem`: o trabalho continua (handoff), e a retomada o devolve.
// `guardado`: saiu do worktree de propósito (`registros guardar`), e a retomada não o traz de volta.
export const FASES = ['passagem', 'guardado'];

// O comentário com o diário de um plano: {corpo, cortado}. Marcador v=2: `em` (quando foi guardado, ISO, para
// achar o mais novo entre tickets e máquinas) e `fase`.
export function corpoDoDiario({ frente, diario, commit, fase = 'passagem', em = new Date().toISOString() }) {
  const reconhecido = lerDiario(diario.texto).reconhecido;
  const limite = reconhecido ? LIMITE_RECONHECIDO : LIMITE_DESCONHECIDO;
  const cortado = diario.texto.length > limite;
  const texto = cortado ? `${diario.texto.slice(0, limite).replace(/\n?$/, '\n')}` : diario.texto;
  const motivo = !cortado ? null : reconhecido
    ? `Diário maior que ${LIMITE_RECONHECIDO} caracteres: cortado em ${LIMITE_RECONHECIDO} caracteres; a cópia inteira ficou na máquina que guardou.`
    : `Formato não reconhecido: o diário vai como texto, cortado em ${LIMITE_DESCONHECIDO} caracteres.`;
  const cerca = cercaPara(texto);
  const corpo = [
    marcador('registro', { id: frente.id, nome: frente.nome, pasta: diario.pasta, plano: diario.plano, commit, cortado: cortado ? '1' : '0', em, fase }, 2),
    `**Diário da execução por subagentes** da frente ${frente.id} ${frente.nome}: plano \`${diario.plano ?? diario.pasta}\`, commit \`${commit}\`.`,
    ...(motivo ? [`> ${motivo}`] : []),
    '',
    `${cerca}text`,
    texto.replace(/\n$/, ''),
    cerca,
    '',
  ].join('\n');
  return { corpo, cortado };
}

// Os campos do marcador `ah:registro` de um comentário, ou null (o do resumo, `ah:registro-resumo`, não conta).
// O v=1 (antes de 27/11) não tem `em` nem `fase`: conta como o mais antigo (em vazio) e como passagem.
export function lerMarcador(corpo) {
  const m = /<!-- ah:registro ((?:\S+=\S* )*)v=[12] -->/.exec(String(corpo));
  if (!m) return null;
  const campos = {};
  for (const par of m[1].trim().split(' ')) {
    const i = par.indexOf('=');
    try { campos[par.slice(0, i)] = decodeURIComponent(par.slice(i + 1)); } catch { return null; }
  }
  const fase = campos.fase || 'passagem';
  if (!campos.id || !campos.pasta || !FASES.includes(fase)) return null;
  return {
    id: campos.id, nome: campos.nome ?? '', pasta: campos.pasta, plano: campos.plano || null,
    commit: campos.commit ?? '', cortado: campos.cortado === '1', em: campos.em ?? '', fase,
  };
}

// O texto do diário dentro do bloco do comentário (sempre com uma quebra de linha no fim), ou null.
export function diarioDoComentario(corpo) {
  // Comentário editado no navegador pode voltar com \r\n.
  const linhas = String(corpo).replace(/\r\n/g, '\n').split('\n');
  const inicio = linhas.findIndex(l => /^`{4,}text$/.test(l));
  if (inicio < 0) return null;
  const cerca = linhas[inicio].slice(0, -4);
  const fim = linhas.findIndex((l, i) => i > inicio && l === cerca);
  if (fim < 0) return null;
  return `${linhas.slice(inicio + 1, fim).join('\n')}\n`;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// O comentário de fechamento: por plano, as tarefas concluídas (com os commits e o veredito da revisão), as que
// ficaram paradas (com a última linha) e as decisões tomadas sem o humano (`Ruling:`), até cinco por plano.
export function resumoDoFechamento({ frente, copias }) {
  const linhas = [
    marcador('registro-resumo', { id: frente.id, nome: frente.nome }),
    `**Resumo da execução por subagentes** da frente ${frente.id} ${frente.nome}:`,
  ];
  for (const c of copias) {
    const d = lerDiario(c.texto);
    const nome = c.plano ? `\`${c.plano}\`` : c.pasta;
    if (!d.reconhecido) {
      linhas.push(`- Plano ${nome}: diário em formato não reconhecido; o texto está no comentário do diário.`);
      continue;
    }
    const feitas = d.concluidas.length
      ? `${plural(d.concluidas.length, 'tarefa concluída', 'tarefas concluídas')} (${d.concluidas.map(x => `Task ${x.tarefa} ${x.de}..${x.ate}, ${x.revisao}`).join('; ')})`
      : 'nenhuma tarefa concluída';
    const paradas = d.paradas.length ? `, ${plural(d.paradas.length, 'parada', 'paradas')} (${d.paradas.map(x => curta(x.ultima)).join('; ')})` : '';
    linhas.push(`- Plano ${nome}: ${feitas}${paradas}, ${plural(d.decisoes.length, 'decisão', 'decisões')}.`);
    for (const r of d.decisoes.slice(0, 5)) linhas.push(`  - ${curta(r, 200)}`);
    if (d.decisoes.length > 5) linhas.push(`  - … e mais ${d.decisoes.length - 5} no comentário do diário`);
  }
  return `${linhas.join('\n')}\n`;
}

// Devolve um diário ao lugar em que o subagent-driven-development o procura: progress.md e plan-path na pasta do
// plano, e o .gitignore da pasta `.superpowers/sdd/` (só se faltar: o projeto pode ter posto o dele). A pasta vem
// de fora (marcador de um ticket) e não pode sair de `.superpowers/sdd/`.
export function devolverDiario(worktree, { pasta, plano, texto }) {
  if (!PASTA_VALIDA.test(String(pasta))) throw new Error(`pasta inválida para o diário: ${curta(String(pasta), 60)}`);
  if (plano != null && !planoValido(plano)) throw new Error(`plano inválido para o diário: ${curta(String(plano), 60)}`);
  const dir = path.join(sdd(worktree), pasta);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'progress.md'), texto);
  if (plano) fs.writeFileSync(path.join(dir, 'plan-path'), `${plano}\n`);
  const ignora = path.join(sdd(worktree), '.gitignore');
  if (!fs.existsSync(ignora)) fs.writeFileSync(ignora, '*\n');
}

// As pastas do worktree que são do subagent-driven-development: as pastas de plano (com `progress.md` ou
// `plan-path`), relativas ao worktree e terminadas em /. Lê só o disco: o close a chama sob a trava.
export function pastasDoSdd(worktree) {
  try {
    return fs.readdirSync(sdd(worktree), { withFileTypes: true })
      .filter(e => e.isDirectory() && ['progress.md', 'plan-path'].some(f => fs.existsSync(path.join(sdd(worktree), e.name, f))))
      .map(e => `.superpowers/sdd/${e.name}/`).sort();
  } catch {
    return [];
  }
}

// Apaga, dentro de uma pasta, os arquivos que o git não versiona e as pastas que ficam vazias. `rel` é o caminho da
// pasta relativo ao worktree; `rastreados`, os arquivos que o git versiona (relativos ao worktree).
function apagarNaoRastreados(abs, rel, rastreados) {
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const filhoAbs = path.join(abs, e.name);
    const filhoRel = `${rel}/${e.name}`;
    if (e.isDirectory()) apagarNaoRastreados(filhoAbs, filhoRel, rastreados);
    else if (!rastreados.has(filhoRel)) fs.rmSync(filhoAbs, { force: true });
  }
  if (!fs.readdirSync(abs).length) fs.rmdirSync(abs);
}

// Tira do worktree o que é do subagent-driven-development e já foi guardado: as pastas de plano (as que têm
// `progress.md` ou `plan-path`) e, se nada mais sobrou, o `.gitignore` que o `sdd-workspace` cria e as pastas
// vazias. Não apaga o que o git versiona (`rastreados`: o projeto pode versionar os diários, como o sdd-workspace
// prevê) nem o que não é da skill (um arquivo do aluno em `.superpowers/sdd/`): quem guarda não apaga o que não
// guardou. Devolve as sobras, relativas ao worktree; com sobra, o `ah close` recusa como sempre.
export function limparPastaDoSdd(worktree, rastreados = new Set()) {
  let itens;
  try {
    itens = fs.readdirSync(sdd(worktree), { withFileTypes: true });
  } catch {
    return [];
  }
  const sobras = [];
  for (const e of itens) {
    const abs = path.join(sdd(worktree), e.name);
    const rel = `.superpowers/sdd/${e.name}`;
    const doSdd = e.isDirectory() && ['progress.md', 'plan-path'].some(f => fs.existsSync(path.join(abs, f)));
    if (doSdd) apagarNaoRastreados(abs, rel, rastreados);
    else if (e.name !== '.gitignore') sobras.push(`${rel}${e.isDirectory() ? '/' : ''}`);
  }
  if (sobras.length) return sobras.sort();
  const ignora = '.superpowers/sdd/.gitignore';
  if (!rastreados.has(ignora)) fs.rmSync(path.join(worktree, ignora), { force: true });
  for (const dir of [sdd(worktree), path.join(worktree, '.superpowers')]) {
    try { fs.rmdirSync(dir); } catch { /* tem outra coisa: fica */ }
  }
  return [];
}

// O .gitignore que o sdd-workspace cria (`*`), e não um do projeto.
export const gitignoreDoSdd = worktree => lerOuNada(path.join(sdd(worktree), '.gitignore')) === '*\n';
