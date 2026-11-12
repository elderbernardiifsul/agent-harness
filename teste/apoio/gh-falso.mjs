// gh de mentira para os testes: grava cada chamada e responde conforme um arquivo JSON.
// Com GH_FALSO_TICKETS, guarda os tickets nesse arquivo ({"<n>": {state, assignees, labels, comments, apagado?}})
// e responde a issue view/comment/edit/list e label create como o gh faria.
import { appendFileSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

const argv = process.argv.slice(2);
let entrada = '';
try {
  entrada = readFileSync(0, 'utf8');
} catch {
  entrada = '';
}
if (process.env.GH_FALSO_LOG) appendFileSync(process.env.GH_FALSO_LOG, `${JSON.stringify({ argv, entrada })}\n`);

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
if (casa) responder(casa.codigo ?? 0, casa.saida ?? '');

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
    comments: tk.comments.map(c => ({ author: { login: c.author }, body: c.body })),
  };
  return Object.fromEntries(campos.map(c => [c, tudo[c] ?? null]));
}

if (argv[0] === 'label' && argv[1] === 'create') responder(0, '');

if (argv[0] === 'issue' && argv[1] === 'list') {
  const t = lerTickets();
  const rotulos = opcoes('--label');
  const estado = (opcao('--state') ?? 'open').toUpperCase();
  const limite = Number(opcao('--limit') ?? 30);
  const campos = (opcao('--json') ?? 'number').split(',');
  const achados = Object.keys(t).filter(n => !t[n].apagado).map(n => [n, ticketDe(t, n)])
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
    const campos = (opcao('--json') ?? 'number,state').split(',');
    responder(0, `${JSON.stringify(noFormatoDoGh(n, tk, campos))}\n`);
  }

  if (argv[1] === 'comment') {
    const corpo = opcao('--body-file') === '-' ? entrada : (opcao('--body') ?? '');
    // Corrida: no primeiro comentário do ticket, outra abertura comenta e se põe de responsável antes.
    let corrida = null;
    try { corrida = process.env.GH_FALSO_CORRIDA ? JSON.parse(process.env.GH_FALSO_CORRIDA) : null; } catch { corrida = null; }
    if (corrida && String(corrida.ticket) === n && !tk.corridaFeita) {
      tk.comments.push({ author: corrida.autor, body: corrida.body });
      if (!tk.assignees.includes(corrida.autor)) tk.assignees.push(corrida.autor);
      tk.corridaFeita = true;
    }
    tk.comments.push({ author: login, body: corpo });
    t[n] = tk;
    gravarTickets(t);
    responder(0, `https://github.com/exemplo/loja/issues/${n}#issuecomment-${tk.comments.length}\n`);
  }

  // edit
  for (const a of opcoes('--add-assignee').flatMap(s => s.split(','))) if (!tk.assignees.includes(quem(a))) tk.assignees.push(quem(a));
  for (const a of opcoes('--remove-assignee').flatMap(s => s.split(','))) tk.assignees = tk.assignees.filter(x => x !== quem(a));
  for (const l of opcoes('--add-label').flatMap(s => s.split(','))) if (!tk.labels.includes(l)) tk.labels.push(l);
  for (const l of opcoes('--remove-label').flatMap(s => s.split(','))) tk.labels = tk.labels.filter(x => x !== l);
  t[n] = tk;
  gravarTickets(t);
  responder(0, `https://github.com/exemplo/loja/issues/${n}\n`);
}

responder(0, '');
