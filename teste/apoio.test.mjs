import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepo, escreverConfig } from './apoio/repo.mjs';
import { gh } from '../nucleo/lib/github.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { processoExiste } from '../nucleo/lib/vida.mjs';

test('criarRepo entrega ramos e remoto', () => {
  const r = criarRepo();
  assert.equal(r.git(['branch', '--show-current']).saida.trim(), 'dev');
  assert.match(r.git(['branch', '--list']).saida, /stage/);
  assert.match(r.git(['remote']).saida, /origin/);
  assert.ok(r.env.AH_ESTADO && r.env.AH_ESTADO !== r.raiz);
  assert.equal(r.env.AH_SESSAO, 'sessao-teste-0001');
  r.limpar();
});

test('gh falso guarda comentário, responsável e rótulo por ticket', () => {
  const p = criarRepo();
  gh(['issue', 'comment', '3', '--body-file', '-'], { cwd: p.raiz, env: p.env, entrada: 'oi' });
  gh(['label', 'create', 'em-andamento'], { cwd: p.raiz, env: p.env });
  gh(['issue', 'edit', '3', '--add-assignee', '@me', '--add-label', 'em-andamento'], { cwd: p.raiz, env: p.env });
  assert.deepEqual(p.ghTicket(3), { state: 'OPEN', assignees: ['ana-souza'], labels: ['em-andamento'], comments: [{ author: 'ana-souza', body: 'oi', numero: 1001 }] });
  const v = JSON.parse(gh(['issue', 'view', '3', '--json', 'assignees,comments'], { cwd: p.raiz, env: { ...p.env, GH_FALSO_LOGIN: 'carla-dias' } }).saida);
  assert.equal(v.comments[0].author.login, 'ana-souza');
  // url com o número do comentário, que cresce no repositório inteiro (como o issuecomment-<n> do GitHub)
  assert.match(v.comments[0].url, /\/issues\/3#issuecomment-1001$/);
  assert.deepEqual(v.assignees, [{ login: 'ana-souza' }]);
  assert.deepEqual(Object.keys(v).sort(), ['assignees', 'comments']);
  gh(['issue', 'edit', '3', '--remove-assignee', 'ana-souza', '--remove-label', 'em-andamento'], { cwd: p.raiz, env: p.env });
  assert.deepEqual(p.ghTicket(3).assignees, []);
  assert.deepEqual(p.ghTicket(3).labels, []);
  p.limpar();
});

test('gh falso: login trocável, rótulo, lista por rótulo, ticket apagado e sem rede', () => {
  const p = criarRepo();
  const o = extra => ({ cwd: p.raiz, env: { ...p.env, ...extra } });
  assert.equal(JSON.parse(gh(['api', 'user'], o({ GH_FALSO_LOGIN: 'carla-dias' })).saida).login, 'carla-dias');
  assert.equal(gh(['label', 'create', 'em-andamento', '--color', 'FBCA04', '--force'], o()).codigo, 0);
  p.ghSemear(2, { labels: ['em-andamento'], comments: [{ author: 'carla-dias', body: 'b' }] });
  p.ghSemear(4, { labels: ['em-andamento'], state: 'CLOSED' });
  p.ghSemear(5, { labels: ['outro'] });
  const lista = JSON.parse(gh(['issue', 'list', '--label', 'em-andamento', '--state', 'open', '--json', 'number,comments', '--limit', '50'], o()).saida);
  assert.deepEqual(lista, [{ number: 2, comments: [{ author: { login: 'carla-dias' }, authorAssociation: 'OWNER', body: 'b', url: 'https://github.com/exemplo/loja/issues/2#issuecomment-1' }] }]);
  p.ghSemear(8, { apagado: true });
  for (const args of [['issue', 'view', '8', '--json', 'state'], ['issue', 'comment', '8', '--body-file', '-'], ['issue', 'edit', '8', '--add-label', 'x']]) {
    const r = gh(args, o());
    assert.equal(r.codigo, 1);
    assert.match(r.erro, /Could not resolve to an issue/);
  }
  assert.equal(gh(['issue', 'comment', '1', '--body-file', '-'], { ...o({ GH_FALSO_FORA: '1' }), entrada: 'x' }).codigo, 1);
  assert.deepEqual(p.ghTicket(1).comments, []);
  // As respostas programadas continuam com prioridade.
  p.ghResponder([{ prefixo: ['issue', 'view', '2'], codigo: 0, saida: '{"state":"CLOSED"}' }]);
  assert.equal(JSON.parse(gh(['issue', 'view', '2', '--json', 'state'], o()).saida).state, 'CLOSED');
  p.limpar();
});

test('gh falso simula a corrida: outro comenta e se põe de responsável antes do primeiro comentário', () => {
  const p = criarRepo();
  const env = { ...p.env, GH_FALSO_CORRIDA: JSON.stringify({ ticket: 1, autor: 'carla-dias', body: 'dela' }) };
  gh(['issue', 'comment', '1', '--body-file', '-'], { cwd: p.raiz, env, entrada: 'minha' });
  gh(['issue', 'comment', '1', '--body-file', '-'], { cwd: p.raiz, env, entrada: 'outra' });
  const t = p.ghTicket(1);
  assert.deepEqual(t.comments.map(c => [c.author, c.body]), [['carla-dias', 'dela'], ['ana-souza', 'minha'], ['ana-souza', 'outra']]);
  assert.deepEqual(t.assignees, ['carla-dias']);
  p.limpar();
});

test('gh falso: rótulo criado fica guardado; rótulo que não existe e campo desconhecido saem com 1', () => {
  const p = criarRepo();
  const o = { cwd: p.raiz, env: p.env };
  const sem = gh(['issue', 'edit', '1', '--add-label', 'em-andamento'], o);
  assert.equal(sem.codigo, 1);
  assert.match(sem.erro, /'em-andamento' not found/);
  assert.deepEqual(p.ghTicket(1).labels, []);
  assert.equal(gh(['label', 'create', 'em-andamento', '--force'], o).codigo, 0);
  assert.equal(gh(['issue', 'edit', '1', '--add-label', 'em-andamento'], o).codigo, 0);
  assert.deepEqual(p.ghTicket(1).labels, ['em-andamento']);
  // O rótulo semeado num ticket também existe.
  p.ghSemear(2, { labels: ['urgente'] });
  assert.equal(gh(['issue', 'edit', '3', '--add-label', 'urgente'], o).codigo, 0);
  for (const args of [['issue', 'view', '1', '--json', 'state,titulo'], ['issue', 'list', '--label', 'x', '--json', 'number,corpo']]) {
    const r = gh(args, o);
    assert.equal(r.codigo, 1);
    assert.match(r.erro, /Unknown JSON field/);
  }
  p.limpar();
});

test('pasta de teste esquecida (até sem permissão de escrita) é apagada na saída do processo', () => {
  const repo = pathToFileURL(path.join(import.meta.dirname, 'apoio', 'repo.mjs')).href;
  const codigo = `import { criarRepo } from ${JSON.stringify(repo)};
import fs from 'node:fs'; import path from 'node:path';
const a = criarRepo(); const b = criarRepo();
if (process.platform !== 'win32') { const d = path.join(a.raiz, 'trancada'); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'x'), 'x'); fs.chmodSync(d, 0o500); }
b.limpar();
console.log(JSON.stringify([path.dirname(a.raiz), path.dirname(b.raiz)]));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const pastas = JSON.parse(r.stdout);
  for (const pasta of pastas) assert.ok(!fs.existsSync(pasta), `sobrou ${pasta}`);
});

test('limpar mata os processos que o teste iniciou ao fundo, para um teste que falha não prender a suíte', async () => {
  const p = criarRepo();
  escreverConfig(p);
  const fila = path.join(p.raiz, '..', 'fila');
  fs.mkdirSync(fila, { recursive: true });
  fs.writeFileSync(path.join(fila, 'config.json'), JSON.stringify({ versao: 1, vagas: 1, memoriaLivreMinimaMb: 0 }));
  const env = { AH_FILA: fila, AH_FILA_PAUSA_MS: '20' };
  const marca = path.join(p.raiz, '..', 'comecou');
  // O primeiro segura a única vaga por 60 s; o segundo fica esperando a vez, como o que prendeu a suíte.
  const primeiro = p.ahAoFundo(['pesado', '--', process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marca)}, ''); setTimeout(() => {}, 60000)`], { env });
  const espera = async (cond, ms = 10000) => { const fim = Date.now() + ms; while (!cond() && Date.now() < fim) await new Promise(r => setTimeout(r, 20)); };
  await espera(() => fs.existsSync(marca));
  assert.ok(fs.existsSync(marca), 'o primeiro não começou');
  const segundo = p.ahAoFundo(['pesado', '--', process.execPath, '-e', '0'], { env });
  await espera(() => { try { return JSON.parse(fs.readFileSync(path.join(fila, 'fila.json'), 'utf8')).entradas.length === 2; } catch { return false; } });
  assert.equal(JSON.parse(fs.readFileSync(path.join(fila, 'fila.json'), 'utf8')).entradas.length, 2, 'o segundo não entrou na fila');
  p.limpar();
  await espera(() => !processoExiste(primeiro.processo.pid) && !processoExiste(segundo.processo.pid));
  const vivos = [primeiro, segundo].filter(x => processoExiste(x.processo.pid));
  for (const x of vivos) x.processo.kill('SIGKILL');
  assert.equal(vivos.length, 0, 'sobrou ah pesado vivo depois do limpar');
});
