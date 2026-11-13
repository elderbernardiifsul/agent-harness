import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, dirDoTeste } from './apoio/repo.mjs';
import { processoVivo } from './apoio/processo.mjs';
import { idCurto } from '../nucleo/lib/sessao.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lerMarcadores, lerTicket, liberarTickets, marcarTickets, montarMarcador, reservar, situacaoDoTicket } from '../nucleo/lib/reserva.mjs';
import { criarRotulo } from '../nucleo/lib/github.mjs';

const lerFrenteDoTeste = (p, nome) => {
  const arq = path.join(p.estado, 'loja', 'frentes', `${nome}.json`);
  return fs.existsSync(arq) ? JSON.parse(fs.readFileSync(arq, 'utf8')) : null;
};
const eventos = p => fs.readFileSync(path.join(p.estado, 'loja', 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const marcador = (tipo, id, login, estado, extra = {}) => montarMarcador(tipo, { id, nome: 'frete', ramo: 'feat/frete', estado, login, ...extra });
const ticket = (marcadores, extra = {}) => ({ numero: 1, aberto: true, responsaveis: [], rotulos: [], marcadores, ...extra });

test('marcador ida e volta, com espaço no valor', () => {
  const campos = { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', estado: 'ativa', login: 'ana-souza', plano: 'docs/meu plano.md' };
  const m = montarMarcador('frente', campos);
  assert.match(m, /^<!-- ah:frente id=as-1 nome=carrinho ramo=feat\/carrinho estado=ativa login=ana-souza plano=docs\/meu%20plano\.md v=1 -->$/);
  assert.deepEqual(lerMarcadores(`texto\n\n${m}\n`), [{ tipo: 'frente', campos: { ...campos, v: '1' } }]);
});

test('marcador omite vazios, mantém vírgula e dois-pontos e escapa o que fecharia o comentário', () => {
  const m = montarMarcador('passagem', { id: 'as-1', nome: 'carrinho', plano: null, tickets: '1,2', abertaEm: '2026-11-13T10:00:00-03:00', sessao: '' });
  assert.equal(m, '<!-- ah:passagem id=as-1 nome=carrinho tickets=1,2 abertaEm=2026-11-13T10:00:00-03:00 v=1 -->');
  const hostil = montarMarcador('frente', { id: 'as-1', nome: 'a --> b=c' });
  assert.doesNotMatch(hostil.slice(0, -4), /-->/);
  assert.equal(lerMarcadores(hostil)[0].campos.nome, 'a --> b=c');
});

test('marcador da fatia 1 é lido como frente ativa', () =>
  assert.equal(lerMarcadores('<!-- ah:frente id=as-1 nome=carrinho ramo=feat/carrinho -->')[0].campos.estado, 'ativa'));

test('situação: o último marcador decide; responsável posto à mão também reserva', () => {
  const ativa = { ...lerMarcadores(marcador('frente', 'cd-4', 'carla-dias', 'ativa'))[0], autor: 'carla-dias' };
  const fechou = { ...lerMarcadores(marcador('fechamento', 'cd-4', 'carla-dias', 'livre'))[0], autor: 'carla-dias' };
  assert.deepEqual(situacaoDoTicket(ticket([ativa]), { rotulo: 'em-andamento', frenteId: 'as-1' }),
    { livre: false, id: 'cd-4', nome: 'frete', login: 'carla-dias', estado: 'ativa' });
  assert.deepEqual(situacaoDoTicket(ticket([ativa, fechou]), { rotulo: 'em-andamento', frenteId: 'as-1' }), { livre: true });
  const aMao = situacaoDoTicket(ticket([ativa, fechou], { responsaveis: ['carla-dias'] }), { rotulo: 'em-andamento', frenteId: 'as-1' });
  assert.equal(aMao.livre, false);
  assert.deepEqual([aMao.id, aMao.login], [null, 'carla-dias']);
  const soRotulo = situacaoDoTicket(ticket([], { rotulos: ['em-andamento'] }), { rotulo: 'em-andamento', frenteId: 'as-1' });
  assert.deepEqual([soRotulo.livre, soRotulo.id, soRotulo.login], [false, null, 'desconhecido']);
  const minha = { ...lerMarcadores(marcador('frente', 'as-1', 'ana-souza', 'ativa'))[0], autor: 'ana-souza' };
  assert.deepEqual(situacaoDoTicket(ticket([minha], { responsaveis: ['ana-souza'], rotulos: ['em-andamento'] }), { rotulo: 'em-andamento', frenteId: 'as-1' }),
    { livre: true, propria: true });
  // frente passada continua com a reserva
  const passada = { ...lerMarcadores(marcador('passagem', 'cd-4', 'carla-dias', 'passada'))[0], autor: 'carla-dias' };
  assert.equal(situacaoDoTicket(ticket([ativa, passada]), { rotulo: 'em-andamento', frenteId: 'as-1' }).estado, 'passada');
  // marcador da fatia 1 sem login: o login é o autor do comentário
  const antigo = { ...lerMarcadores('<!-- ah:frente id=cd-2 nome=frete ramo=feat/frete -->')[0], autor: 'carla-dias' };
  assert.equal(situacaoDoTicket(ticket([antigo]), { rotulo: 'em-andamento', frenteId: 'as-1' }).login, 'carla-dias');
});

test('lerTicket traz estado, responsáveis, rótulos e marcadores com autor; sem rede, ok false', () => {
  const p = criarProjeto();
  p.ghSemear(5, { state: 'CLOSED', assignees: ['carla-dias'], labels: ['x'], comments: [{ author: 'carla-dias', body: `oi\n\n${marcador('frente', 'cd-4', 'carla-dias', 'ativa')}` }, { author: 'ana-souza', body: 'sem marcador' }] });
  const r = lerTicket(5, { cwd: p.raiz, env: p.env });
  assert.equal(r.ok, true);
  assert.deepEqual([r.ticket.numero, r.ticket.aberto, r.ticket.responsaveis, r.ticket.rotulos], [5, false, ['carla-dias'], ['x']]);
  assert.equal(r.ticket.marcadores.length, 1);
  assert.deepEqual([r.ticket.marcadores[0].tipo, r.ticket.marcadores[0].autor, r.ticket.marcadores[0].campos.id], ['frente', 'carla-dias', 'cd-4']);
  assert.equal(lerTicket(5, { cwd: p.raiz, env: { ...p.env, GH_FALSO_FORA: '1' } }).ok, false);
  p.limpar();
});

test('open reserva com responsável, rótulo e marcador', () => {
  const p = criarProjeto();
  assert.equal(p.ah(['open', 'carrinho', '--tickets', '1']).codigo, 0);
  const t = p.ghTicket(1);
  assert.deepEqual([t.assignees, t.labels], [['ana-souza'], ['em-andamento']]);
  assert.match(t.comments.at(-1).body, /<!-- ah:frente id=as-1 nome=carrinho ramo=feat\/carrinho estado=ativa login=ana-souza/);
  assert.deepEqual(lerFrenteDoTeste(p, 'carrinho').reserva, { logins: ['ana-souza'], tickets: [1] });
  assert.ok(p.ghChamadas().some(c => c.argv[0] === 'label' && c.argv[1] === 'create' && c.argv[2] === 'em-andamento'));
  assert.ok(eventos(p).some(e => e.tipo === 'reserva' && e.frente === 'carrinho'));
  p.limpar();
});

test('open recusa ticket reservado por outra frente e não cria nada', () => {
  const p = criarProjeto();
  p.ghSemear(2, { assignees: ['carla-dias'], labels: ['em-andamento'], comments: [{ author: 'carla-dias', body: montarMarcador('frente', { id: 'cd-4', nome: 'frete', ramo: 'feat/frete', estado: 'ativa', login: 'carla-dias' }) }] });
  const r = p.ah(['open', 'carrinho', '--tickets', '2']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /cd-4/);
  assert.match(r.erro, /Faça: .*@carla-dias/);
  assert.doesNotMatch(p.git(['branch', '--list']).saida, /feat\/carrinho/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho'), null);
  assert.equal(p.ghTicket(2).comments.length, 1);
  p.limpar();
});

test('open recusa ticket com responsável posto à mão', () => {
  const p = criarProjeto();
  p.ghSemear(2, { assignees: ['carla-dias'] });
  const r = p.ah(['open', 'carrinho', '--tickets', '2']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: .*@carla-dias/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho'), null);
  p.limpar();
});

test('corrida: quem reservou depois desiste, sai de responsável e não cria worktree', () => {
  const p = criarProjeto();
  const corrida = { ticket: 1, autor: 'carla-dias', body: montarMarcador('frente', { id: 'cd-1', nome: 'frete', ramo: 'feat/frete', estado: 'ativa', login: 'carla-dias', abertaEm: '2020-01-01T00:00:00-03:00' }) };
  const r = p.ah(['open', 'carrinho', '--tickets', '1'], { env: { GH_FALSO_CORRIDA: JSON.stringify(corrida) } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /cd-1/);
  const t = p.ghTicket(1);
  assert.match(t.comments.at(-1).body, /ah:desistencia id=as-1 .*estado=livre/);
  assert.ok(!t.assignees.includes('ana-souza'));
  assert.ok(t.assignees.includes('carla-dias'));
  assert.deepEqual(t.labels, ['em-andamento']);
  assert.equal(lerFrenteDoTeste(p, 'carrinho'), null);
  assert.doesNotMatch(p.git(['branch', '--list']).saida, /feat\/carrinho/);
  assert.ok(eventos(p).some(e => e.tipo === 'reserva-desistida'));
  p.limpar();
});

test('corrida em um de dois tickets: desiste nos dois e tira o rótulo onde ficou sozinha', () => {
  const p = criarProjeto();
  const corrida = { ticket: 2, autor: 'carla-dias', body: montarMarcador('frente', { id: 'cd-1', nome: 'frete', ramo: 'feat/frete', estado: 'ativa', login: 'carla-dias', abertaEm: '2020-01-01T00:00:00-03:00' }) };
  const r = p.ah(['open', 'carrinho', '--tickets', '1,2'], { env: { GH_FALSO_CORRIDA: JSON.stringify(corrida) } });
  assert.equal(r.codigo, 1);
  const t1 = p.ghTicket(1);
  assert.deepEqual([t1.assignees, t1.labels], [[], []]);
  assert.match(t1.comments.at(-1).body, /ah:desistencia id=as-1 /);
  assert.equal(situacaoDoTicket(lerTicket(1, { cwd: p.raiz, env: p.env }).ticket, { rotulo: 'em-andamento', frenteId: 'cd-9' }).livre, true);
  p.limpar();
});

test('ticket fechado não é reservado; o open avisa e segue', () => {
  const p = criarProjeto();
  p.ghSemear(3, { state: 'CLOSED' });
  const r = p.ah(['open', 'carrinho', '--tickets', '3']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /#3.*fechado/);
  assert.deepEqual(p.ghTicket(3).assignees, []);
  assert.deepEqual(lerFrenteDoTeste(p, 'carrinho').reserva, { logins: ['ana-souza'], tickets: [] });
  p.limpar();
});

test('reabrir na mesma frente (marcador próprio) não é recusa', () => {
  const p = criarProjeto();
  p.ghSemear(1, { assignees: ['ana-souza'], labels: ['em-andamento'], comments: [{ author: 'ana-souza', body: montarMarcador('frente', { id: 'as-1', nome: 'carrinho', estado: 'ativa', login: 'ana-souza' }) }] });
  const r = p.ah(['open', 'carrinho', '--tickets', '1']);
  assert.equal(r.codigo, 0, r.erro);
  p.limpar();
});

test('marcarTickets comenta com o marcador do tipo e reatribui quem não estava', () => {
  const p = criarProjeto();
  const o = { cwd: p.raiz, env: p.env };
  const frente = { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', tickets: [1, 2], reserva: { logins: ['ana-souza'], tickets: [1, 2] } };
  assert.equal(criarRotulo('em-andamento', o), true); // a reserva anterior criou o rótulo
  const r = marcarTickets({ frente, tipo: 'tomada', texto: 'Frente tomada.', login: 'carla-dias', sessao: 'sessao-b-0002', rotulo: 'em-andamento', dirEstado: dirDoTeste(p), reatribuir: true }, o);
  assert.deepEqual(r.logins, ['ana-souza', 'carla-dias']);
  for (const n of [1, 2]) {
    const t = p.ghTicket(n);
    assert.match(t.comments.at(-1).body, /^Frente tomada\.\n\n<!-- ah:tomada id=as-1 nome=carrinho ramo=feat\/carrinho estado=ativa login=carla-dias sessao=sessao-b /);
    assert.deepEqual(t.assignees, ['carla-dias']);
  }
  const sem = marcarTickets({ frente, tipo: 'passagem', texto: 'Passada.', login: 'ana-souza', sessao: 'sessao-teste-0001', rotulo: 'em-andamento', dirEstado: dirDoTeste(p) }, o);
  assert.deepEqual(sem.logins, ['ana-souza']);
  assert.match(p.ghTicket(1).comments.at(-1).body, /ah:passagem .*estado=passada/);
  p.limpar();
});

test('liberarTickets sem rede deixa comentário e edição na fila, em ordem', () => {
  const p = criarProjeto();
  const frente = { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', tickets: [1], reserva: { logins: ['ana-souza'], tickets: [1] } };
  const r = liberarTickets({ frente, resumo: 'soma', login: 'ana-souza', rotulo: 'em-andamento', dirEstado: dirDoTeste(p) }, { cwd: p.raiz, env: { ...p.env, GH_FALSO_FORA: '1' } });
  assert.deepEqual([r.comentariosNaFila, r.edicoesNaFila], [[1], [1]]);
  const fila = fs.readFileSync(path.join(dirDoTeste(p), 'pendentes.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  assert.deepEqual(fila.map(f => f.tipo), ['comentario', 'edicao']);
  assert.deepEqual(fila[1].args, ['--remove-assignee', 'ana-souza', '--remove-label', 'em-andamento']);
  p.limpar();
});

// ---- Consertos da revisão da tarefa 5 ----

const RAIZ_HARNESS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const marcadorDe = (id, nome, login) => montarMarcador('frente', { id, nome, ramo: `feat/${nome}`, estado: 'ativa', login });
const projeto = t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  return p;
};

test('corrida cruzada em dois tickets: as duas veem a outra antes em algum ticket e desistem; nenhuma fica', t => {
  // Ordem no servidor: A#1, B#2, A#2, B#1. No #1 A chegou antes; no #2, B. Cada uma perde num dos seus tickets e
  // desiste de todos (aceito: tentam de novo); o que não pode é as duas ficarem.
  const A = { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', tickets: [1, 2] };
  const B = { id: 'cd-1', nome: 'frete', ramo: 'feat/frete', tickets: [2, 1] };
  const pa = projeto(t);
  const corridaDeA = [
    { ticket: 2, autor: 'carla-dias', body: marcadorDe('cd-1', 'frete', 'carla-dias'), antesDe: 2 },
    { ticket: 1, autor: 'carla-dias', body: marcadorDe('cd-1', 'frete', 'carla-dias'), depoisDe: 2 },
  ];
  const ra = reservar({ tickets: [1, 2], frente: A, login: 'ana-souza', sessao: 'sessao-teste-0001', rotulo: 'em-andamento', dirEstado: dirDoTeste(pa) },
    { cwd: pa.raiz, env: { ...pa.env, GH_FALSO_CORRIDA: JSON.stringify(corridaDeA) } });
  assert.deepEqual(pa.ghTicket(1).comments.slice(0, 2).map(c => c.numero), [1001, 1004]);
  assert.deepEqual(pa.ghTicket(2).comments.slice(0, 2).map(c => c.numero), [1002, 1003]);
  assert.deepEqual([ra.ok, ra.desistiu, ra.id], [false, true, 'cd-1']);

  const pb = projeto(t);
  const corridaDeB = [
    { ticket: 1, autor: 'ana-souza', body: marcadorDe('as-1', 'carrinho', 'ana-souza'), antesDe: 2 },
    { ticket: 2, autor: 'ana-souza', body: marcadorDe('as-1', 'carrinho', 'ana-souza'), depoisDe: 2 },
  ];
  const rb = reservar({ tickets: [2, 1], frente: B, login: 'carla-dias', sessao: 'sessao-b-0002', rotulo: 'em-andamento', dirEstado: dirDoTeste(pb) },
    { cwd: pb.raiz, env: { ...pb.env, GH_FALSO_LOGIN: 'carla-dias', GH_FALSO_CORRIDA: JSON.stringify(corridaDeB) } });
  assert.deepEqual([rb.ok, rb.desistiu, rb.id], [false, true, 'as-1']);
  for (const n of [1, 2]) {
    const tk = pb.ghTicket(n);
    assert.match(tk.comments.at(-1).body, /ah:desistencia id=cd-1 /);
    assert.deepEqual(tk.assignees, ['ana-souza']);
  }
});

test('quem já é responsável pelo ticket não é recusado no próprio ticket', t => {
  const p = projeto(t);
  p.ghSemear(1, { assignees: ['ana-souza'] });
  const r = p.ah(['open', 'carrinho', '--tickets', '1']);
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual(p.ghTicket(1).assignees, ['ana-souza']);
  assert.equal(situacaoDoTicket(ticket([], { responsaveis: ['ana-souza'], rotulos: ['em-andamento'] }), { rotulo: 'em-andamento', frenteId: 'as-1', login: 'ana-souza' }).livre, true);
  assert.equal(situacaoDoTicket(ticket([], { responsaveis: ['ana-souza'] }), { rotulo: 'em-andamento', frenteId: 'as-1', login: 'carla-dias' }).livre, false);
});

test('marcador citado no meio do comentário não vale', () => {
  const m = marcadorDe('cd-4', 'frete', 'carla-dias');
  assert.deepEqual(lerMarcadores(`O formato é assim:\n${m}\ne segue o texto.`), []);
  assert.deepEqual(lerMarcadores(`texto ${m}`), []);
  assert.equal(lerMarcadores(`texto\n\n  ${m}  \n\n`).length, 1);
});

test('marcador de terceiro não reserva nem libera', t => {
  const p = projeto(t);
  const o = { cwd: p.raiz, env: p.env };
  // carla escreve um marcador que se diz da ana: não vale
  p.ghSemear(1, { comments: [{ author: 'carla-dias', body: marcadorDe('as-9', 'falsa', 'ana-souza') }] });
  assert.deepEqual(lerTicket(1, o).ticket.marcadores, []);
  assert.equal(p.ah(['open', 'carrinho', '--tickets', '1']).codigo, 0);
  // ana escreve um fechamento em nome da frente da carla: não libera
  p.ghSemear(2, { assignees: ['carla-dias'], comments: [
    { author: 'carla-dias', body: marcadorDe('cd-4', 'frete', 'carla-dias') },
    { author: 'ana-souza', body: montarMarcador('fechamento', { id: 'cd-4', nome: 'frete', estado: 'livre', login: 'carla-dias' }) },
  ] });
  const s = situacaoDoTicket(lerTicket(2, o).ticket, { rotulo: 'em-andamento', frenteId: 'as-2', login: 'ana-souza' });
  assert.deepEqual([s.livre, s.id], [false, 'cd-4']);
});

test('rótulo sem frente nem responsável: a recusa manda tirar o rótulo à mão', t => {
  const p = projeto(t);
  p.ghSemear(2, { labels: ['em-andamento'] });
  const r = p.ah(['open', 'carrinho', '--tickets', '2']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /rótulo em-andamento sem frente do harness nem responsável/);
  assert.match(r.erro, /Faça: .*gh issue edit 2 --remove-label em-andamento/);
  assert.doesNotMatch(r.erro, /desconhecido/);
});

// gh que entrega o comentário e diz que falhou (prazo estourado depois da entrega).
function ghQueEntregaEFalha(p, modo) {
  const arq = path.join(path.dirname(p.raiz), 'gh-entrega-e-falha.mjs');
  const contador = path.join(path.dirname(p.raiz), 'gh-entrega-e-falha.n');
  fs.writeFileSync(arq, `import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const args = process.argv.slice(2);
let entrada = ''; try { entrada = readFileSync(0, 'utf8'); } catch {}
const r = spawnSync(process.execPath, [${JSON.stringify(path.join(RAIZ_HARNESS, 'teste', 'apoio', 'gh-falso.mjs'))}, ...args], { input: entrada, encoding: 'utf8', env: process.env });
process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
if (args[0] === 'issue' && args[1] === 'comment') {
  const n = existsSync(${JSON.stringify(contador)}) ? Number(readFileSync(${JSON.stringify(contador)}, 'utf8')) : 0;
  writeFileSync(${JSON.stringify(contador)}, String(n + 1));
  if (${JSON.stringify(modo)} === 'todos' || n === 0) { process.stderr.write('prazo estourado\\n'); process.exit(1); }
}
process.exit(r.status ?? 1);
`);
  return arq;
}

test('comentário entregue com prazo estourado: a reserva é desfeita, e a recusa diz o que fez', t => {
  const p = projeto(t);
  const r = p.ah(['open', 'carrinho', '--tickets', '1'], { env: { AH_GH: ghQueEntregaEFalha(p, 'primeiro') } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /desfiz o que tinha feito/);
  const tk = p.ghTicket(1);
  assert.match(tk.comments.at(-1).body, /ah:desistencia id=as-1 .*estado=livre/);
  assert.deepEqual([tk.assignees, tk.labels], [[], []]);
  assert.equal(lerFrenteDoTeste(p, 'carrinho'), null);

  const q = projeto(t);
  const r2 = q.ah(['open', 'carrinho', '--tickets', '1'], { env: { AH_GH: ghQueEntregaEFalha(q, 'todos') } });
  assert.equal(r2.codigo, 1);
  assert.match(r2.erro, /deixei na fila o que desfaz a reserva/);
  assert.doesNotMatch(r2.erro, /desfiz o que tinha feito/);
});

test('worktree que falha depois da reserva: o ticket volta livre, com a desistência', t => {
  const p = projeto(t);
  const alvo = path.join(p.env.AH_WORKTREES, 'carrinho');
  fs.mkdirSync(alvo, { recursive: true });
  fs.writeFileSync(path.join(alvo, 'ocupado.txt'), 'x');
  const r = p.ah(['open', 'carrinho', '--tickets', '1']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /O git não criou o worktree/);
  const tk = p.ghTicket(1);
  assert.match(tk.comments.at(-1).body, /ah:desistencia id=as-1 .*estado=livre/);
  assert.deepEqual([tk.assignees, tk.labels], [[], []]);
  assert.equal(lerFrenteDoTeste(p, 'carrinho'), null);
  assert.equal(p.git(['branch', '--list', 'feat/carrinho']).saida.trim(), '');
});

test('close sem fila disponível não diz que o comentário ficou na fila', t => {
  const p = projeto(t);
  assert.equal(p.ah(['open', 'carrinho', '--tickets', '1']).codigo, 0);
  const wt = lerFrenteDoTeste(p, 'carrinho').worktree;
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a');
  p.git(['add', 'a.txt'], { cwd: wt });
  p.git(['commit', '-m', 'feat: a'], { cwd: wt });
  p.git(['merge', '--no-ff', 'feat/carrinho', '-m', 'm']);
  fs.mkdirSync(path.join(dirDoTeste(p), 'pendentes.jsonl')); // a fila não aceita nada
  const r = p.ah(['close'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.doesNotMatch(r.erro, /ficou na fila/);
  assert.match(r.erro, /não foi enviada nem guardada na fila.*Faça à mão: gh issue comment 1/);
});

// `ah` em segundo plano (para rodar outro comando enquanto este espera).
function ahAssinc(p, args, extra = {}) {
  return new Promise(resolve => {
    const filho = spawn(process.execPath, [path.join(RAIZ_HARNESS, 'nucleo', 'bin', 'ah.mjs'), ...args], { cwd: p.raiz, env: { ...p.env, ...extra } });
    let saida = '';
    let erro = '';
    filho.stdout.on('data', d => { saida += d; });
    filho.stderr.on('data', d => { erro += d; });
    filho.on('close', codigo => resolve({ codigo, saida, erro }));
  });
}
async function esperarArquivo(arquivo, ms = 15000) {
  const ate = Date.now() + ms;
  while (!fs.existsSync(arquivo)) {
    if (Date.now() > ate) throw new Error(`não apareceu: ${arquivo}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

test('reserva fora da trava: durante ela outra sessão responde, abre outra frente com outro id e não toma o nome', async t => {
  const p = projeto(t);
  const pausa = path.join(path.dirname(p.raiz), 'pausa');
  const a = ahAssinc(p, ['open', 'carrinho', '--tickets', '1'], { GH_FALSO_PAUSA: pausa });
  try {
    await esperarArquivo(`${pausa}.chegou`);
    const B = { env: { AH_SESSAO: 'sessao-b-0002' } };
    const inicio = Date.now();
    const w = p.ah(['whoami'], B);
    assert.equal(w.codigo, 0, w.erro);
    assert.ok(Date.now() - inicio < 4000, 'o whoami esperou a trava');
    const quadro = JSON.parse(p.ah(['board', '--json']).saida);
    assert.equal(quadro.frentes.find(f => f.nome === 'carrinho').estado, 'abrindo');
    assert.match(p.ah(['board']).saida, /carrinho.*abrindo/);
    const b = p.ah(['open', 'frete'], B);
    assert.equal(b.codigo, 0, b.erro);
    assert.match(b.saida, /Frente as-2 frete aberta/);
    const c = p.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-c-0003' } });
    assert.equal(c.codigo, 1);
    assert.match(c.erro, /abertura da frente carrinho em curso/);
  } finally {
    fs.writeFileSync(`${pausa}.solta`, '');
  }
  const r = await a;
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho aberta/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'ativa');
});

// Registro `abrindo` de um open que parou no meio.
function gravarAbrindo(p, { id = 'as-1', nome = 'carrinho', dona = 'sessao-c-0003', tickets = [], processo = null } = {}) {
  const dir = path.join(dirDoTeste(p), 'frentes');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${nome}.json`), JSON.stringify({
    esquema: 2, id, nome, ramo: `feat/${nome}`, worktree: path.join(p.env.AH_WORKTREES, nome), tickets, plano: null, caminhos: [],
    dona, abertaPor: 'ana-souza', abertaEm: '2026-11-13T10:00:00-03:00', estado: 'abrindo', notas: [],
    reserva: tickets.length ? { logins: ['ana-souza'], tickets } : null, ...(processo ? { processo } : {}),
  }));
}

test('open parado no meio: quadro e doctor acusam, e outro open com o mesmo nome o toma com o mesmo id', t => {
  const p = projeto(t);
  gravarAbrindo(p, { id: 'as-7', tickets: [1] });
  p.ghSemear(1, { assignees: ['ana-souza'], labels: ['em-andamento'], comments: [{ author: 'ana-souza', body: marcadorDe('as-7', 'carrinho', 'ana-souza') }] });
  assert.match(p.ah(['board']).saida, /carrinho.*abrindo \(parada\)/);
  const f = JSON.parse(p.ah(['board', '--json']).saida).frentes[0];
  assert.deepEqual([f.estado, f.donaViva], ['abrindo', false]);
  const d = p.ah(['doctor']);
  assert.match(d.saida + d.erro, /carrinho` em abertura parada.*ah open carrinho/);
  const r = p.ah(['open', 'carrinho', '--tickets', '1']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-7 carrinho aberta/);
  const fr = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([fr.estado, fr.dona], ['ativa', 'sessao-teste-0001']);
});

test('frente em abertura conta para a regra do executor', t => {
  const p = projeto(t);
  gravarAbrindo(p, { nome: 'frete', dona: 'sessao-teste-0001' });
  const r = p.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Esta sessão já tem a frente frete/);
});

// ---- Consertos da revisão da tarefa 5, rodada 2 ----

const marcadorCompleto = (f, login, sessao) => montarMarcador('frente', { id: f.id, nome: f.nome, ramo: f.ramo, estado: 'ativa', login, sessao: idCurto(sessao), abertaEm: f.abertaEm });
async function pidMorto() {
  const pr = processoVivo();
  const pid = pr.pid;
  await pr.matar();
  return pid;
}

test('três frentes: A quer #1, B quer #1 e #2, C quer #2; em nenhum ticket duas ficam', t => {
  // Servidor: B#1=1001, A#1=1002, C#2=1003, B#2=1004. Duas variantes: cada frente relê logo depois das próprias
  // escritas (só vê o que já estava lá), ou todas relêem no fim (veem tudo). Em ambas: A perde no #1 para B; B
  // perde no #2 para C; C é a primeira no #2 e fica.
  const A = { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', tickets: [1], abertaEm: '2026-11-13T10:00:01-03:00' };
  const B = { id: 'cd-1', nome: 'frete', ramo: 'feat/frete', tickets: [1, 2], abertaEm: '2026-11-13T10:00:00-03:00' };
  const C = { id: 'as-2', nome: 'cupom', ramo: 'feat/cupom', tickets: [2], abertaEm: '2026-11-13T10:00:02-03:00' };
  const mA = marcadorCompleto(A, 'ana-souza', 'sessao-teste-0001');
  const mB = marcadorCompleto(B, 'carla-dias', 'sessao-b-0002');
  const mC = marcadorCompleto(C, 'ana-souza', 'sessao-c-0003');
  const rodar = (frente, login, sessao, corrida) => {
    const p = projeto(t);
    const env = { ...p.env, GH_FALSO_LOGIN: login, GH_FALSO_CORRIDA: JSON.stringify(corrida) };
    return reservar({ tickets: frente.tickets, frente, login, sessao, rotulo: 'em-andamento', dirEstado: dirDoTeste(p) }, { cwd: p.raiz, env }).ok;
  };
  const variantes = {
    logoDepois: {
      A: [{ ticket: 1, autor: 'carla-dias', body: mB, antesDe: 1 }],
      B: [{ ticket: 1, autor: 'ana-souza', body: mA, depoisDe: 1 }, { ticket: 2, autor: 'ana-souza', body: mC, depoisDe: 1 }],
      C: [{ ticket: 1, autor: 'carla-dias', body: mB, antesDe: 2 }, { ticket: 1, autor: 'ana-souza', body: mA, antesDe: 2 }],
    },
    noFim: {
      A: [{ ticket: 1, autor: 'carla-dias', body: mB, antesDe: 1 }, { ticket: 2, autor: 'ana-souza', body: mC, depoisDe: 1 },
        { ticket: 2, autor: 'carla-dias', body: mB, depoisDe: 1 }],
      B: [{ ticket: 1, autor: 'ana-souza', body: mA, depoisDe: 1 }, { ticket: 2, autor: 'ana-souza', body: mC, depoisDe: 1 }],
      C: [{ ticket: 1, autor: 'carla-dias', body: mB, antesDe: 2 }, { ticket: 1, autor: 'ana-souza', body: mA, antesDe: 2 },
        { ticket: 2, autor: 'carla-dias', body: mB, depoisDe: 2 }],
    },
  };
  for (const [nome, v] of Object.entries(variantes)) {
    const ok = {
      A: rodar(A, 'ana-souza', 'sessao-teste-0001', v.A),
      B: rodar(B, 'carla-dias', 'sessao-b-0002', v.B),
      C: rodar(C, 'ana-souza', 'sessao-c-0003', v.C),
    };
    assert.ok(!(ok.A && ok.B), `${nome}: A e B ficaram com o #1`);
    assert.ok(!(ok.B && ok.C), `${nome}: B e C ficaram com o #2`);
    assert.deepEqual(ok, { A: false, B: false, C: true }, nome);
  }
});

test('marcador sem login só vale como ah:frente antigo: fechamento de terceiro não libera', t => {
  const p = projeto(t);
  const o = { cwd: p.raiz, env: p.env };
  p.ghSemear(1, { assignees: ['ana-souza'], comments: [
    { author: 'ana-souza', body: marcadorDe('as-1', 'carrinho', 'ana-souza') },
    { author: 'carla-dias', body: '<!-- ah:fechamento id=as-1 nome=carrinho -->' },
    { author: 'carla-dias', body: '<!-- ah:desistencia id=as-1 nome=carrinho estado=livre v=1 -->' },
    { author: 'carla-dias', body: '<!-- ah:frente id=cd-9 nome=fantasma estado=ativa v=1 -->' },
  ] });
  const tk = lerTicket(1, o).ticket;
  assert.deepEqual(tk.marcadores.map(m => [m.tipo, m.campos.id]), [['frente', 'as-1']]);
  const s = situacaoDoTicket(tk, { rotulo: 'em-andamento', frenteId: 'as-2', login: 'carla-dias' });
  assert.deepEqual([s.livre, s.id], [false, 'as-1']);
  // o formato antigo da fatia 1 (ah:frente sem login e sem v) continua valendo, com o login do autor
  p.ghSemear(2, { comments: [{ author: 'carla-dias', body: '<!-- ah:frente id=cd-2 nome=frete ramo=feat/frete -->' }] });
  assert.equal(situacaoDoTicket(lerTicket(2, o).ticket, { rotulo: 'em-andamento', frenteId: 'as-2', login: 'ana-souza' }).login, 'carla-dias');
});

// gh que falha (sem entregar) o comentário num ticket.
function ghQueFalhaComentarNo(p, ticket) {
  const arq = path.join(path.dirname(p.raiz), `gh-falha-no-${ticket}.mjs`);
  fs.writeFileSync(arq, `import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'issue' && args[1] === 'comment' && args[2] === ${JSON.stringify(String(ticket))}) { process.stderr.write('sem rede\\n'); process.exit(1); }
let entrada = ''; try { entrada = readFileSync(0, 'utf8'); } catch {}
const r = spawnSync(process.execPath, [${JSON.stringify(path.join(RAIZ_HARNESS, 'teste', 'apoio', 'gh-falso.mjs'))}, ...args], { input: entrada, encoding: 'utf8', env: process.env });
process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
process.exit(r.status ?? 1);
`);
  return arq;
}

test('desfazer no meio da reserva não tira rótulo nem responsável que outra frente segura', t => {
  const p = projeto(t);
  const outra = { id: 'cd-1', nome: 'frete', ramo: 'feat/frete', abertaEm: '2020-01-01T00:00:00-03:00' };
  const corrida = { ticket: 1, autor: 'carla-dias', body: marcadorCompleto(outra, 'carla-dias', 'sessao-b-0002') };
  const r = p.ah(['open', 'carrinho', '--tickets', '1,2'], { env: { AH_GH: ghQueFalhaComentarNo(p, 2), GH_FALSO_CORRIDA: JSON.stringify(corrida) } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /falhou no meio/);
  const t1 = p.ghTicket(1);
  assert.match(t1.comments.at(-1).body, /ah:desistencia id=as-1 /);
  assert.deepEqual([t1.assignees, t1.labels], [['carla-dias'], ['em-andamento']]);
});

test('dois open do mesmo nome: o segundo é recusado enquanto o primeiro vive, e o primeiro termina com a reserva', async t => {
  const p = projeto(t);
  const pausa = path.join(path.dirname(p.raiz), 'pausa-a');
  const a = ahAssinc(p, ['open', 'carrinho', '--tickets', '1'], { GH_FALSO_PAUSA: pausa });
  try {
    await esperarArquivo(`${pausa}.chegou`);
    const b = p.ah(['open', 'carrinho', '--tickets', '1']); // mesma sessão
    assert.equal(b.codigo, 1);
    assert.match(b.erro, /abertura da frente carrinho em curso/);
  } finally {
    fs.writeFileSync(`${pausa}.solta`, '');
  }
  const r = await a;
  assert.equal(r.codigo, 0, r.erro);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.id, f.estado, f.processo], ['as-1', 'ativa', undefined]);
  const tk = p.ghTicket(1);
  assert.deepEqual([tk.assignees, tk.labels], [['ana-souza'], ['em-andamento']]);
  assert.doesNotMatch(tk.comments.map(c => c.body).join('\n'), /desistencia/);
});

test('open morto na fase 2 com a sessão viva: quadro e doctor acusam pelo processo, e a sessão é orientada', async t => {
  const p = projeto(t);
  assert.equal(p.ah(['whoami']).codigo, 0); // a sessão dona existe e está viva
  gravarAbrindo(p, { dona: 'sessao-teste-0001', processo: { pid: await pidMorto(), inicio: null } });
  assert.match(p.ah(['board']).saida, /carrinho.*abrindo \(parada\)/);
  const f = JSON.parse(p.ah(['board', '--json']).saida).frentes[0];
  assert.deepEqual([f.estado, f.donaViva, f.aberturaParada], ['abrindo', true, true]);
  const d = p.ah(['doctor']);
  assert.match(d.saida + d.erro, /carrinho` em abertura parada.*processo \d+ morto.*ah open carrinho/);
  const o = p.ah(['open', 'frete']);
  assert.equal(o.codigo, 1);
  assert.match(o.erro, /Faça: .*ah open carrinho para retomar a abertura parada, ou ah close carrinho para desistir/);
  // com o processo vivo, não está parada
  const vivo = processoVivo();
  t.after(() => vivo.matar());
  gravarAbrindo(p, { nome: 'cupom', id: 'as-2', dona: 'sessao-teste-0001', processo: { pid: vivo.pid, inicio: null } });
  assert.match(p.ah(['board']).saida, /cupom +\S+ +abrindo(?! \()/);
  const c = p.ah(['close', 'cupom']);
  assert.equal(c.codigo, 1);
  assert.match(c.erro, /está sendo aberta agora/);
  assert.doesNotMatch(c.erro, /órfã/);
});

test('close de abertura parada: desfaz só onde o marcador ativo é dela, sem histórico nem commit', async t => {
  const p = projeto(t);
  gravarAbrindo(p, { id: 'as-7', tickets: [1, 2], processo: { pid: await pidMorto(), inicio: null } });
  p.ghSemear(1, { assignees: ['ana-souza'], labels: ['em-andamento'], comments: [{ author: 'ana-souza', body: marcadorDe('as-7', 'carrinho', 'ana-souza') }] });
  p.ghSemear(2, { assignees: ['carla-dias', 'ana-souza'], labels: ['em-andamento'], comments: [{ author: 'carla-dias', body: marcadorDe('cd-4', 'frete', 'carla-dias') }] });
  const antes = p.git(['rev-list', '--count', 'HEAD']).saida.trim();
  const r = p.ah(['close', 'carrinho']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Abertura de as-7 carrinho desfeita/);
  assert.doesNotMatch(r.saida, /fechada/);
  const ev = eventos(p).at(-1);
  assert.deepEqual([ev.tipo, ev.nome, ev.frente], ['abertura-desfeita', 'carrinho', 'carrinho']);
  const t1 = p.ghTicket(1);
  assert.match(t1.comments.at(-1).body, /ah:desistencia id=as-7 /);
  assert.deepEqual([t1.assignees, t1.labels], [[], []]);
  const t2 = p.ghTicket(2);
  assert.deepEqual([t2.comments.length, t2.assignees, t2.labels], [1, ['carla-dias', 'ana-souza'], ['em-andamento']]);
  assert.equal(lerFrenteDoTeste(p, 'carrinho'), null);
  assert.equal(p.git(['rev-list', '--count', 'HEAD']).saida.trim(), antes);
  const hist = path.join(p.raiz, 'docs', 'agents', 'historico-das-frentes.md');
  assert.ok(!fs.existsSync(hist) || !fs.readFileSync(hist, 'utf8').includes('as-7'));
});

// ---- Consertos da revisão da tarefa 5, rodada 3 ----

test('quem escreve depois desiste mesmo tendo aberto antes e com id menor (ordem do servidor no ticket)', async t => {
  const p = projeto(t);
  const pausa = path.join(path.dirname(p.raiz), 'pausa-y');
  // Y lê o #1 (vazio) e para; X reserva, confirma e sai; Y segue, escreve depois de X e tem de desistir.
  const Y = { AH_SESSAO: 'sessao-b-0002', GH_FALSO_LOGIN: 'carla-dias' };
  const y = ahAssinc(p, ['open', 'frete', '--tickets', '1'], { ...Y, GH_FALSO_PAUSA: pausa });
  let x;
  try {
    await esperarArquivo(`${pausa}.chegou`);
    x = p.ah(['open', 'carrinho', '--tickets', '1']);
  } finally {
    fs.writeFileSync(`${pausa}.solta`, '');
  }
  assert.equal(x.codigo, 0, x.erro);
  assert.match(x.saida, /Frente as-2 carrinho aberta/);
  const ry = await y;
  assert.equal(ry.codigo, 1);
  assert.match(ry.erro, /as-2/);
  const tk = p.ghTicket(1);
  assert.match(tk.comments.at(-1).body, /ah:desistencia id=as-1 /);
  assert.deepEqual([tk.assignees, tk.labels], [['ana-souza'], ['em-andamento']]);
  const s = situacaoDoTicket(lerTicket(1, { cwd: p.raiz, env: p.env }).ticket, { rotulo: 'em-andamento', frenteId: 'cd-9', login: 'carla-dias' });
  assert.deepEqual([s.livre, s.id], [false, 'as-2']);
  assert.equal(lerFrenteDoTeste(p, 'frete'), null);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'ativa');
});

test('close de abertura parada com outro login tira a responsável que a reserva pôs', async t => {
  const p = projeto(t);
  gravarAbrindo(p, { id: 'as-7', tickets: [1], processo: { pid: await pidMorto(), inicio: null } });
  p.ghSemear(1, { assignees: ['ana-souza'], labels: ['em-andamento'], comments: [{ author: 'ana-souza', body: marcadorDe('as-7', 'carrinho', 'ana-souza') }] });
  const r = p.ah(['close', 'carrinho'], { env: { GH_FALSO_LOGIN: 'carla-dias', AH_SESSAO: 'sessao-b-0002' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Abertura de as-7 carrinho desfeita/);
  const tk = p.ghTicket(1);
  assert.deepEqual([tk.assignees, tk.labels], [[], []]);
  assert.match(tk.comments.at(-1).body, /ah:desistencia id=as-7 .*login=carla-dias/);
  assert.equal(situacaoDoTicket(lerTicket(1, { cwd: p.raiz, env: p.env }).ticket, { rotulo: 'em-andamento', frenteId: 'cd-9', login: 'carla-dias' }).livre, true);
});

test('close de abertura parada diz qual responsável ficou quando outra frente do mesmo login segura o ticket', async t => {
  const p = projeto(t);
  gravarAbrindo(p, { id: 'as-7', tickets: [1], processo: { pid: await pidMorto(), inicio: null } });
  p.ghSemear(1, { assignees: ['ana-souza'], labels: ['em-andamento'], comments: [
    { author: 'ana-souza', body: marcadorDe('as-7', 'carrinho', 'ana-souza') },
    { author: 'ana-souza', body: marcadorDe('as-3', 'cupom', 'ana-souza') },
  ] });
  const r = p.ah(['close', 'carrinho']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /@ana-souza continua de responsável no ticket #1 \(outra frente do mesmo login segura o ticket\)/);
  assert.deepEqual([p.ghTicket(1).assignees, p.ghTicket(1).labels], [['ana-souza'], ['em-andamento']]);
});

// ---- Consertos da revisão da tarefa 5, rodada 4 ----

// gh que falha os comentários de desistência (e, opcionalmente, todo comentário num ticket) e, a partir da
// chamada `falharViewDesde` de `issue view`, as leituras.
function ghComFalhas(p, { ticketSemComentario = null, falharViewDesde = null } = {}) {
  const arq = path.join(path.dirname(p.raiz), `gh-com-falhas-${ticketSemComentario}-${falharViewDesde}.mjs`);
  const contador = `${arq}.views`;
  fs.writeFileSync(arq, `import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const args = process.argv.slice(2);
let entrada = ''; try { entrada = readFileSync(0, 'utf8'); } catch {}
const falha = () => { process.stderr.write('sem rede\\n'); process.exit(1); };
if (args[0] === 'issue' && args[1] === 'comment') {
  if (/ah:desistencia/.test(entrada)) falha();
  if (${JSON.stringify(ticketSemComentario === null ? null : String(ticketSemComentario))} === args[2]) falha();
}
if (args[0] === 'issue' && args[1] === 'view' && ${JSON.stringify(falharViewDesde)} !== null) {
  const n = (existsSync(${JSON.stringify(contador)}) ? Number(readFileSync(${JSON.stringify(contador)}, 'utf8')) : 0) + 1;
  writeFileSync(${JSON.stringify(contador)}, String(n));
  if (n >= ${JSON.stringify(falharViewDesde)}) falha();
}
const r = spawnSync(process.execPath, [${JSON.stringify(path.join(RAIZ_HARNESS, 'teste', 'apoio', 'gh-falso.mjs'))}, ...args], { input: entrada, encoding: 'utf8', env: process.env });
process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
process.exit(r.status ?? 1);
`);
  return arq;
}

test('ticket com operação desta máquina na fila não é reservado: a desistência velha não libera a reserva nova', t => {
  const p = projeto(t);
  const gh = ghComFalhas(p, { ticketSemComentario: 2 });
  // (a) o comentário no #2 falha; a desistência do #1 também falha e vai para a fila
  const a = p.ah(['open', 'frete', '--tickets', '1,2'], { env: { AH_GH: gh } });
  assert.equal(a.codigo, 1);
  assert.ok(fs.readFileSync(path.join(dirDoTeste(p), 'pendentes.jsonl'), 'utf8').includes('ah:desistencia id=as-1'));
  // (b) de novo, com o reenvio ainda falhando: recusa sem mudar nada
  const antes = p.ghTicket(1).comments.length;
  const b = p.ah(['open', 'frete', '--tickets', '1'], { env: { AH_GH: gh } });
  assert.equal(b.codigo, 1);
  assert.match(b.erro, /há comentário pendente para o ticket #1/);
  assert.match(b.erro, /Faça: rode de novo quando o GitHub responder; ah doctor mostra a fila/);
  assert.equal(lerFrenteDoTeste(p, 'frete'), null);
  assert.equal(p.ghTicket(1).comments.length, antes);
  // o doctor mostra a fila
  const d = p.ah(['doctor']);
  assert.match(d.saida + d.erro, /Comentários pendentes: \d+ operaç(ão|ões) na fila \(#1/);
  // com rede, a fila sai antes e o open reserva de novo, agora sobre o ticket já livre
  const c = p.ah(['open', 'frete', '--tickets', '1']);
  assert.equal(c.codigo, 0, c.erro);
  assert.match(p.ghTicket(1).comments.at(-1).body, /ah:frente id=as-1 /);
});

test('desistência que não consegue reler o ticket não tira rótulo nem responsável e diz como tirar à mão', t => {
  const p = projeto(t);
  const alvo = path.join(p.env.AH_WORKTREES, 'carrinho');
  fs.mkdirSync(alvo, { recursive: true });
  fs.writeFileSync(path.join(alvo, 'ocupado.txt'), 'x');
  // leituras: 1ª (antes de escrever) e 2ª (releitura) passam; a 3ª (a da desistência) falha
  const r = p.ah(['open', 'carrinho', '--tickets', '1'], { env: { AH_GH: ghComFalhas(p, { falharViewDesde: 3 }) } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /O git não criou o worktree/);
  assert.match(r.erro, /gh issue edit 1 --remove-assignee ana-souza --remove-label em-andamento/);
  const tk = p.ghTicket(1);
  assert.deepEqual([tk.assignees, tk.labels], [['ana-souza'], ['em-andamento']]);
  assert.ok(fs.readFileSync(path.join(dirDoTeste(p), 'pendentes.jsonl'), 'utf8').includes('ah:desistencia id=as-1'));
  assert.ok(!fs.readFileSync(path.join(dirDoTeste(p), 'pendentes.jsonl'), 'utf8').includes('--remove-label'));
});
