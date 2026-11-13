import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, dirDoTeste, outraMaquina } from './apoio/repo.mjs';
import { acharPassagem, montarMarcador } from '../nucleo/lib/reserva.mjs';

const lerFrenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'frentes', `${nome}.json`), 'utf8'));
const temFrente = (p, nome) => fs.existsSync(path.join(dirDoTeste(p), 'frentes', `${nome}.json`));
const eventos = p => fs.readFileSync(path.join(dirDoTeste(p), 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const CARLA = { sessao: 'sessao-c-0003', login: 'carla-dias', sigla: 'cd' };

// Projeto com a frente carrinho aberta (ticket #1) e um commit nela.
function comFrente(t, { tickets = '1' } = {}) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const r = p.ah(['open', 'carrinho', ...(tickets ? ['--tickets', tickets] : [])]);
  assert.equal(r.codigo, 0, r.erro);
  const wt = lerFrenteDoTeste(p, 'carrinho').worktree;
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a');
  p.git(['add', 'a.txt'], { cwd: wt });
  p.git(['commit', '-m', 'feat: a'], { cwd: wt });
  return { p, wt };
}

function maquina(t, p, dados = CARLA) {
  const q = outraMaquina(p, dados);
  t.after(() => q.limpar());
  return q;
}

test('outraMaquina: clone novo com estado, worktrees, sessão e login próprios e os mesmos tickets', t => {
  const { p } = comFrente(t);
  const q = maquina(t, p);
  assert.notEqual(q.raiz, p.raiz);
  assert.notEqual(q.estado, p.estado);
  assert.equal(q.env.AH_SESSAO, 'sessao-c-0003');
  assert.equal(q.env.GH_FALSO_LOGIN, 'carla-dias');
  assert.equal(q.env.GH_FALSO_TICKETS, p.env.GH_FALSO_TICKETS);
  assert.equal(q.env.GH_FALSO_LOG, p.env.GH_FALSO_LOG);
  assert.notEqual(q.env.AH_WORKTREES, p.env.AH_WORKTREES);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(q.estado, 'maquina.json'), 'utf8')), { sigla: 'cd', login: 'carla-dias' });
  assert.ok(fs.existsSync(path.join(q.raiz, '.harness', 'config.json')));
  assert.equal(q.git(['branch', '--show-current']).saida.trim(), 'dev');
  assert.deepEqual(q.ghTicket(1).assignees, ['ana-souza']);
});

test('outra máquina retoma pelo ramo remoto e pela passagem no ticket, com o mesmo ID', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff', '--nota', 'falta o frete']).codigo, 0);
  const q = maquina(t, p);
  const r = q.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho retomada\./);
  const f = lerFrenteDoTeste(q, 'carrinho');
  assert.deepEqual([f.id, f.tickets, f.abertaPor, f.dona], ['as-1', [1], 'ana-souza', 'sessao-c-0003']);
  assert.equal(f.abertaEm, lerFrenteDoTeste(p, 'carrinho').abertaEm);
  assert.equal(f.estado, 'ativa');
  assert.deepEqual(f.reserva, { logins: ['ana-souza', 'carla-dias'], tickets: [1] });
  assert.ok(fs.existsSync(path.join(f.worktree, 'a.txt')));
  assert.equal(q.git(['rev-parse', '--abbrev-ref', 'feat/carrinho@{upstream}']).saida.trim(), 'origin/feat/carrinho');
  assert.deepEqual(p.ghTicket(1).assignees.sort(), ['ana-souza', 'carla-dias']);
  assert.match(p.ghTicket(1).comments.at(-1).body, /retomada por @carla-dias[\s\S]*<!-- ah:retomada id=as-1 nome=carrinho .*login=carla-dias/);
  assert.equal(JSON.parse(q.ah(['whoami', '--json']).saida).frente, 'carrinho');
  assert.ok(eventos(q).some(e => e.tipo === 'retomada' && e.id === 'as-1' && e.frente === 'carrinho' && e.sessao === 'sessao-c-0003'));
});

test('o marcador da passagem leva tickets, plano, abertaPor e abertaEm', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const corpo = p.ghTicket(1).comments.at(-1).body;
  assert.match(corpo, /<!-- ah:passagem id=as-1 .*tickets=1 .*abertaPor=ana-souza abertaEm=\S+ v=1 -->/);
});

test('ramo remoto sem passagem recusa sem criar worktree', t => {
  const { p } = comFrente(t, { tickets: '' });
  const q = maquina(t, p);
  assert.equal(q.git(['push', 'origin', 'dev:feat/solto']).codigo, 0);
  const r = q.ah(['open', 'solto']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Já existe ramo remoto com o nome solto, sem passagem de bastão achada\./);
  assert.match(r.erro, /Faça: .*ah open solto --tickets <n>/);
  assert.equal(temFrente(q, 'solto'), false);
  assert.equal(fs.existsSync(path.join(q.env.AH_WORKTREES, 'solto')), false);
  assert.equal(q.git(['branch', '--list', 'feat/solto']).saida.trim(), '');
});

test('passagem já retomada em outra máquina: recusa dizendo quem está com ela', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  const terceira = maquina(t, p, { sessao: 'sessao-d-0004', login: 'ana-souza', sigla: 'as' });
  const r = terceira.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /a frente as-1 está ativa com @carla-dias em outra máquina/);
  assert.match(r.erro, /Faça: .*combine com @carla-dias/);
  assert.equal(temFrente(terceira, 'carrinho'), false);
});

test('--tickets aponta onde procurar quando o ticket perdeu o rótulo', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  p.ghSemear(1, { labels: [] });
  const q = maquina(t, p);
  let r = q.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /sem passagem de bastão achada/);
  r = q.ah(['open', 'carrinho', '--tickets', '1']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho retomada\./);
  assert.deepEqual(lerFrenteDoTeste(q, 'carrinho').tickets, [1]);
});

test('sem rede, com o ramo remoto, recusa pedindo o GitHub', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  const r = q.ah(['open', 'carrinho'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /preciso do GitHub para achar a passagem de carrinho/);
  assert.equal(temFrente(q, 'carrinho'), false);
});

test('ID da passagem igual ao de uma frente local com outro nome: recusa sem sobrescrever', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const outra = maquina(t, p, { sessao: 'sessao-d-0004', login: 'ana-souza', sigla: 'as' });
  assert.equal(outra.ah(['papel', 'orquestrador']).codigo, 0);
  assert.equal(outra.ah(['open', 'frete']).codigo, 0); // mesma sigla: ganha o ID as-1 nesta máquina
  assert.equal(lerFrenteDoTeste(outra, 'frete').id, 'as-1');
  const r = outra.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /já existe aqui a frente as-1 frete/);
  assert.equal(lerFrenteDoTeste(outra, 'frete').nome, 'frete');
  assert.equal(temFrente(outra, 'carrinho'), false);
  assert.equal(fs.existsSync(path.join(outra.env.AH_WORKTREES, 'carrinho')), false);
});

test('duas máquinas retomam a mesma passagem: a de retomada mais antiga fica, a outra desfaz e recusa', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  // Outra máquina (de ana-souza) comenta a retomada antes da de carla-dias.
  const corrida = { ticket: 1, autor: 'ana-souza', body: `Frente as-1 (carrinho) retomada por @ana-souza.\n\n${montarMarcador('retomada', { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', estado: 'ativa', login: 'ana-souza', sessao: 'sessao-d' })}\n` };
  const r = q.ah(['open', 'carrinho'], { env: { GH_FALSO_CORRIDA: JSON.stringify(corrida) } });
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /a frente as-1 foi retomada antes por @ana-souza/);
  assert.match(r.erro, /Faça: .*combine com @ana-souza/);
  assert.equal(temFrente(q, 'carrinho'), false);
  assert.equal(fs.existsSync(path.join(q.env.AH_WORKTREES, 'carrinho')), false);
  assert.equal(q.git(['branch', '--list', 'feat/carrinho']).saida.trim(), '');
  assert.equal(JSON.parse(q.ah(['whoami', '--json']).saida).frente, null);
  const tk = p.ghTicket(1);
  assert.deepEqual(tk.assignees, ['ana-souza']);
  assert.match(tk.comments.at(-1).body, /desfeita/);
  assert.doesNotMatch(tk.comments.at(-1).body, /<!-- ah:/);
  // Quem procura agora vê a frente ativa com quem retomou primeiro.
  const a = acharPassagem({ nome: 'carrinho', rotulo: 'em-andamento' }, { cwd: q.raiz, env: q.env });
  assert.deepEqual(a, { ok: true, passagem: null, ativa: { id: 'as-1', login: 'ana-souza' } });
});

test('acharPassagem: último marcador com o nome decide; fechamento solta; logins dos marcadores ativos', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const o = { cwd: p.raiz, env: p.env };
  const m = (tipo, login, extra = {}) => ({ author: login, body: `x\n\n${montarMarcador(tipo, { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', login, ...extra })}` });
  p.ghSemear(3, { labels: ['em-andamento'], comments: [
    m('frente', 'ana-souza', { tickets: '3', abertaPor: 'ana-souza', abertaEm: '2026-11-13T10:00:00-03:00' }),
    m('passagem', 'ana-souza'),
    m('retomada', 'carla-dias'),
    m('retomada', 'ana-souza', { sessao: 'sessao-d' }), // perdeu a corrida: não conta em logins
    { author: 'carla-dias', body: `citação\n\n${montarMarcador('passagem', { id: 'zz-9', nome: 'carrinho', login: 'ana-souza' })}` }, // autor ≠ login: não vale
    m('passagem', 'carla-dias', { tickets: '3', plano: 'docs/p.md', abertaPor: 'ana-souza', abertaEm: '2026-11-13T10:00:00-03:00' }),
  ] });
  let r = acharPassagem({ nome: 'carrinho', rotulo: 'em-andamento' }, o);
  assert.deepEqual(r, { ok: true, passagem: {
    id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', tickets: [3], plano: 'docs/p.md', abertaPor: 'ana-souza',
    abertaEm: '2026-11-13T10:00:00-03:00', logins: ['ana-souza', 'carla-dias'], login: 'carla-dias',
  } });
  // Uma tomada troca quem segura; uma retomada que perdeu a corrida não.
  p.ghSemear(4, { labels: ['em-andamento'], comments: [
    m('frente', 'ana-souza'), m('passagem', 'ana-souza'), m('retomada', 'carla-dias'), m('retomada', 'ana-souza'),
  ].map(c => ({ ...c, body: c.body.replace(/as-1/g, 'as-2').replace(/carrinho/g, 'frete') })) });
  assert.deepEqual(acharPassagem({ nome: 'frete', tickets: [4], rotulo: 'em-andamento' }, o), { ok: true, passagem: null, ativa: { id: 'as-2', login: 'carla-dias' } });
  p.ghSemear(4, { comments: [...p.ghTicket(4).comments, { author: 'ana-souza', body: montarMarcador('tomada', { id: 'as-2', nome: 'frete', login: 'ana-souza' }) }] });
  assert.deepEqual(acharPassagem({ nome: 'frete', tickets: [4], rotulo: 'em-andamento' }, o).ativa, { id: 'as-2', login: 'ana-souza' });
  assert.deepEqual(acharPassagem({ nome: 'outra', rotulo: 'em-andamento' }, o), { ok: true, passagem: null });
  p.ghSemear(3, { comments: [...p.ghTicket(3).comments, m('fechamento', 'carla-dias')] });
  assert.deepEqual(acharPassagem({ nome: 'carrinho', tickets: [3], rotulo: 'em-andamento' }, o), { ok: true, passagem: null });
  r = acharPassagem({ nome: 'carrinho', rotulo: 'em-andamento' }, { ...o, env: { ...p.env, GH_FALSO_FORA: '1' } });
  assert.equal(r.ok, false);
  assert.ok(r.motivo);
});
