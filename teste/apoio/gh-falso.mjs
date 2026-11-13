// gh de mentira para os testes: grava cada chamada e responde conforme um arquivo JSON.
// Com GH_FALSO_TICKETS, guarda os tickets nesse arquivo ({"<n>": {state, assignees, labels, comments, apagado?}})
// e responde a issue view/comment/edit/list e label create como o gh faria.
import { appendFileSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

const argv = process.argv.slice(2);
let entrada = '';
try {
  entrada = readFileSync(0, 'utf8');
} catch {
  entrada = '';
}
// GH_FALSO_ESPIA: arquivo cujo conteúdo vai junto no registro da chamada (para ver o estado no meio de um comando).
let espia;
if (process.env.GH_FALSO_ESPIA) {
  try { espia = readFileSync(process.env.GH_FALSO_ESPIA, 'utf8'); } catch { espia = null; }
}
if (process.env.GH_FALSO_LOG) appendFileSync(process.env.GH_FALSO_LOG, `${JSON.stringify({ argv, entrada, ...(espia !== undefined ? { espia } : {}) })}\n`);

function responder(codigo, saida, erro = '') {
  if (saida) process.stdout.write(saida);
  if (erro) process.stderr.write(erro);
  process.exit(codigo);
}

if (process.env.GH_FALSO_FORA === '1') responder(1, '', 'sem rede\n');

let lista = [];
if (process.env.GH_FALSO_RESPOSTAS) {
  try {
    lista = JSON.parse(readFileSync(process.env.GH_FALSO_RESPOSTAS, 'utf8'));
  } catch {
    lista = [];
  }
}
const casa = lista.find(r => r.prefixo.every((p, i) => argv[i] === p));
if (casa) responder(casa.codigo ?? 0, casa.saida ?? '', casa.erro ?? '');

const login = process.env.GH_FALSO_LOGIN || 'ana-souza';
if (argv[0] === 'api' && argv[1] === 'user') responder(0, `${JSON.stringify({ login })}\n`);
if (argv[0] === 'repo' && argv[1] === 'view') responder(0, 'exemplo/loja\n');

const arqTickets = process.env.GH_FALSO_TICKETS;
if (!arqTickets) responder(0, '');

// --- Tickets com estado ---
function lerTickets() {
  try {
    return JSON.parse(readFileSync(arqTickets, 'utf8'));
  } catch {
    return {};
  }
}
function gravarTickets(t) {
  const temp = `${arqTickets}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(t, null, 2));
  renameSync(temp, arqTickets);
}
// Rótulos criados por `label create` ficam em `_rotulos`; um rótulo já posto num ticket também existe.
const CHAVE_ROTULOS = '_rotulos';
const numeros = t => Object.keys(t).filter(k => /^\d+$/.test(k));
const rotuloExiste = (t, l) => (t[CHAVE_ROTULOS] ?? []).includes(l) || numeros(t).some(n => (t[n].labels ?? []).includes(l));
const CAMPOS = ['number', 'state', 'assignees', 'labels', 'comments'];
function camposPedidos(padrao) {
  const campos = (opcao('--json') ?? padrao).split(',');
  const errado = campos.find(c => !CAMPOS.includes(c));
  if (errado) responder(1, '', `Unknown JSON field: "${errado}"\nAvailable fields:\n${CAMPOS.map(c => `  ${c}`).join('\n')}\n`);
  return campos;
}
// GH_FALSO_PAUSA=<arquivo>: o `issue view` cria <arquivo>.chegou e espera <arquivo>.solta (até 10 s).
function pausar() {
  const base = process.env.GH_FALSO_PAUSA;
  if (!base) return;
  writeFileSync(`${base}.chegou`, '');
  const ate = Date.now() + 10000;
  const espera = new Int32Array(new SharedArrayBuffer(4));
  while (!existsSync(`${base}.solta`) && Date.now() < ate) Atomics.wait(espera, 0, 0, 50);
}
const vazio = () => ({ state: 'OPEN', assignees: [], labels: [], comments: [] });
const ticketDe = (t, n) => ({ ...vazio(), ...(t[n] ?? {}) });
const opcao = nome => {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
};
const opcoes = nome => argv.flatMap((a, i) => (a === nome && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const quem = x => (x === '@me' ? login : x);
const NAO_ACHEI = 'GraphQL: Could not resolve to an issue or pull request with the number of %n. (repository.issue)\n';

// Formato do gh: responsáveis por login, rótulos por nome, comentários com autor.
function noFormatoDoGh(n, tk, campos) {
  const tudo = {
    number: Number(n),
    state: tk.state,
    assignees: tk.assignees.map(l => ({ login: l })),
    labels: tk.labels.map(l => ({ name: l })),
    // url com issuecomment-<n>: n cresce no repositório inteiro (os semeados sem número ficam antes, pela posição).
    comments: tk.comments.map((c, i) => ({ author: { login: c.author }, body: c.body, url: `https://github.com/exemplo/loja/issues/${n}#issuecomment-${c.numero ?? i + 1}` })),
  };
  return Object.fromEntries(campos.map(c => [c, tudo[c] ?? null]));
}

if (argv[0] === 'label' && argv[1] === 'create') {
  const t = lerTickets();
  const rotulos = t[CHAVE_ROTULOS] ?? [];
  if (argv[2] && !rotulos.includes(argv[2])) {
    t[CHAVE_ROTULOS] = [...rotulos, argv[2]];
    gravarTickets(t);
  }
  responder(0, '');
}

if (argv[0] === 'issue' && argv[1] === 'list') {
  const t = lerTickets();
  const rotulos = opcoes('--label');
  const estado = (opcao('--state') ?? 'open').toUpperCase();
  const limite = Number(opcao('--limit') ?? 30);
  const campos = camposPedidos('number');
  const achados = numeros(t).filter(n => !t[n].apagado).map(n => [n, ticketDe(t, n)])
    .filter(([, tk]) => estado === 'ALL' || tk.state === estado)
    .filter(([, tk]) => rotulos.every(r => tk.labels.includes(r)))
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .slice(0, limite)
    .map(([n, tk]) => noFormatoDoGh(n, tk, campos));
  responder(0, `${JSON.stringify(achados)}\n`);
}

if (argv[0] === 'issue' && ['view', 'comment', 'edit'].includes(argv[1])) {
  const n = String(argv[2] ?? '').replace(/^#/, '');
  if (!/^\d+$/.test(n)) responder(1, '', `argumento inválido: ${argv[2]}\n`);
  const t = lerTickets();
  if (t[n]?.apagado) responder(1, '', NAO_ACHEI.replace('%n', n));
  const tk = ticketDe(t, n);

  if (argv[1] === 'view') {
    pausar();
    const campos = camposPedidos('number,state');
    responder(0, `${JSON.stringify(noFormatoDoGh(n, tk, campos))}\n`);
  }

  if (argv[1] === 'comment') {
    const corpo = opcao('--body-file') === '-' ? entrada : (opcao('--body') ?? '');
    // Corrida: outra abertura comenta (e se põe de responsável) no meio desta. GH_FALSO_CORRIDA é um objeto ou
    // uma lista de {ticket, autor, body, antesDe?, depoisDe?}: sem os dois, entra antes do primeiro comentário
    // deste login no `ticket`; com `antesDe`/`depoisDe` (número de ticket), antes/depois do comentário deste
    // login naquele ticket. Cada uma acontece uma vez (`_corridas`).
    let corridas = [];
    try { corridas = process.env.GH_FALSO_CORRIDA ? [JSON.parse(process.env.GH_FALSO_CORRIDA)].flat() : []; } catch { corridas = []; }
    const feitas = new Set(t._corridas ?? []);
    t[n] = tk;
    const proximo = () => (t._seq = (t._seq ?? 1000) + 1);
    const aplicar = momento => corridas.forEach((c, i) => {
      if (feitas.has(i)) return;
      const gatilho = momento === 'antes' ? (c.antesDe ?? (c.depoisDe === undefined ? c.ticket : undefined)) : c.depoisDe;
      if (gatilho === undefined || String(gatilho) !== n) return;
      const alvo = String(c.ticket);
      const ta = alvo === n ? tk : ticketDe(t, alvo);
      ta.comments.push({ author: c.autor, body: c.body, numero: proximo() });
      if (!ta.assignees.includes(c.autor)) ta.assignees.push(c.autor);
      t[alvo] = ta;
      feitas.add(i);
    });
    aplicar('antes');
    tk.comments.push({ author: login, body: corpo, numero: proximo() });
    const meu = tk.comments.at(-1).numero;
    aplicar('depois');
    t._corridas = [...feitas];
    gravarTickets(t);
    responder(0, `https://github.com/exemplo/loja/issues/${n}#issuecomment-${meu}\n`);
  }

  // edit
  for (const a of opcoes('--add-assignee').flatMap(s => s.split(','))) if (!tk.assignees.includes(quem(a))) tk.assignees.push(quem(a));
  for (const a of opcoes('--remove-assignee').flatMap(s => s.split(','))) tk.assignees = tk.assignees.filter(x => x !== quem(a));
  const novos = opcoes('--add-label').flatMap(s => s.split(','));
  const semRotulo = novos.find(l => !rotuloExiste(t, l));
  if (semRotulo) responder(1, '', `failed to update https://github.com/exemplo/loja/issues/${n}: '${semRotulo}' not found\n`);
  for (const l of novos) if (!tk.labels.includes(l)) tk.labels.push(l);
  for (const l of opcoes('--remove-label').flatMap(s => s.split(','))) tk.labels = tk.labels.filter(x => x !== l);
  t[n] = tk;
  gravarTickets(t);
  responder(0, `https://github.com/exemplo/loja/issues/${n}\n`);
}

responder(0, '');
