// `gh` do ensaio da skill orquestrar: o `gh` falso de teste/apoio/ mais o que um agente real chama e ele não tem.
// - `issue create --title <t> [--body <b> | --body-file <arq|->] [--label <l>]…`: cria o ticket no arquivo de tickets;
// - `issue close <n> [--comment <c>] [--reason <r>]`: fecha (com o comentário, se houver);
// - `issue view <n> [--comments]` e `issue list [--label <l>] [--state <s>]` sem `--json`: em texto, como o gh real;
// - o resto vai para o gh falso, sem mudança.
// Usa o mesmo GH_FALSO_TICKETS do gh falso. Só para o ensaio; os testes usam o gh falso direto.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FALSO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'apoio', 'gh-falso.mjs');
const argv = process.argv.slice(2);
const arq = process.env.GH_FALSO_TICKETS;
const opcao = nome => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : undefined; };
const opcoes = nome => argv.flatMap((a, i) => (a === nome && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const sair = (codigo, saida = '', erro = '') => { process.stdout.write(saida); process.stderr.write(erro); process.exit(codigo); };
const ler = () => JSON.parse(readFileSync(arq, 'utf8'));
const gravar = t => { writeFileSync(`${arq}.tmp`, JSON.stringify(t, null, 2)); renameSync(`${arq}.tmp`, arq); };
const url = n => `https://github.com/exemplo/loja/issues/${n}`;
const doFalso = args => spawnSync(process.execPath, [FALSO, ...args], { encoding: 'utf8', env: process.env, input: '' });
const entrada = () => { try { return readFileSync(0, 'utf8'); } catch { return ''; } };

const [a0, a1] = argv;
if (a0 === 'issue' && a1 === 'create') {
  const t = ler();
  const n = Math.max(0, ...Object.keys(t).filter(k => /^\d+$/.test(k)).map(Number)) + 1;
  const arquivo = opcao('--body-file');
  const body = arquivo === '-' ? entrada() : arquivo ? readFileSync(arquivo, 'utf8') : (opcao('--body') ?? '');
  t[n] = { title: opcao('--title') ?? '', body, labels: opcoes('--label'), comments: [], state: 'OPEN', assignees: [] };
  gravar(t);
  sair(0, `${url(n)}\n`);
}
if (a0 === 'issue' && a1 === 'close') {
  const n = String(argv[2] ?? '').replace(/^#/, '');
  const t = ler();
  if (!t[n]) sair(1, '', `could not find issue ${n}\n`);
  t[n].state = 'CLOSED';
  const c = opcao('--comment') ?? opcao('-c');
  if (c) (t[n].comments ??= []).push({ author: process.env.GH_FALSO_LOGIN || 'ana-souza', body: c });
  gravar(t);
  sair(0, `✓ Closed issue exemplo/loja#${n}\n`);
}
if (a0 === 'issue' && a1 === 'view' && !argv.includes('--json')) {
  const r = doFalso(['issue', 'view', argv[2], '--json', 'number,state,title,body,labels,comments']);
  if (r.status !== 0) sair(r.status ?? 1, r.stdout, r.stderr);
  const i = JSON.parse(r.stdout);
  let texto = `${i.title} #${i.number}\n${i.state}\nlabels: ${i.labels.map(l => l.name).join(', ')}\n\n${i.body || '(sem descrição)'}\n`;
  if (argv.includes('--comments')) texto += i.comments.map(c => `\n--- ${c.author.login}\n${c.body}\n`).join('');
  sair(0, texto);
}
if (a0 === 'issue' && a1 === 'list' && !argv.includes('--json')) {
  const resto = argv.slice(2);
  const r = doFalso(['issue', 'list', ...resto, '--json', 'number,title,labels,state']);
  if (r.status !== 0) sair(r.status ?? 1, r.stdout, r.stderr);
  sair(0, JSON.parse(r.stdout).map(i => `#${i.number}\t${i.state}\t${i.title}\t${i.labels.map(l => l.name).join(', ')}\n`).join(''));
}
const r = spawnSync(process.execPath, [FALSO, ...argv], { encoding: 'utf8', env: process.env, input: entrada() });
sair(r.status ?? 1, r.stdout ?? '', r.stderr ?? '');
