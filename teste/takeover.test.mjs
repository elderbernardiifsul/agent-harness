import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { amb, criarProjeto, dirDoTeste } from './apoio/repo.mjs';
import { processoVivo } from './apoio/processo.mjs';
import { tratar } from '../nucleo/adaptadores/contrato.mjs';
import { contarPendentes, enfileirar, pendentesDoTicket } from '../nucleo/lib/pendentes.mjs';
import { montarMarcador, sidDe } from '../nucleo/lib/reserva.mjs';
import { lerSessao } from '../nucleo/lib/sessao.mjs';

const arquivoDaFrente = (p, nome) => path.join(dirDoTeste(p), 'frentes', `${nome}.json`);
const lerFrenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(arquivoDaFrente(p, nome), 'utf8'));
const gravarFrenteDoTeste = (p, f) => fs.writeFileSync(arquivoDaFrente(p, f.nome), JSON.stringify(f, null, 2));
const eventos = p => fs.readFileSync(path.join(dirDoTeste(p), 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const A = 'sessao-a-0001';
const B = { env: { AH_SESSAO: 'sessao-b-0002' } };

// Projeto com a frente carrinho (ticket #1) aberta pela sessão A, cujo agente é um processo vivo.
function frenteDeOutra(t, { tickets = '1' } = {}) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const proc = processoVivo();
  t.after(() => proc.matar());
  const r = p.ah(['open', 'carrinho', ...(tickets ? ['--tickets', tickets] : [])], { env: { AH_SESSAO: A, AH_PID_AGENTE: String(proc.pid) } });
  assert.equal(r.codigo, 0, r.erro);
  return { p, proc };
}

function recusou(r, re) {
  assert.equal(r.codigo, 1, r.erro);
  assert.match(r.erro, /^Recusado: .*\nFaça: /m);
  assert.match(r.erro, re);
}

test('takeover sem --confirmado descreve e não muda nada', async t => {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  const comentarios = p.ghTicket(1).comments.length;
  const r = p.ah(['takeover', 'carrinho']);
  recusou(r, /A frente as-1 carrinho é da sessão sessao-a \(morta: processo não existe; último sinal há 0 min\)\./);
  assert.match(r.erro, /Faça: peça ao executivo que confirme e rode ah takeover carrinho --confirmado/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, A);
  assert.equal(p.ghTicket(1).comments.length, comentarios);
});

test('takeover de dona morta assume, comenta e registra', async t => {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  gravarFrenteDoTeste(p, { ...lerFrenteDoTeste(p, 'carrinho'), atribuidaPor: 'sessao-c-0003' });
  const r = p.ah(['takeover', 'carrinho', '--confirmado']);
  assert.equal(r.codigo, 0, r.erro);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.equal(r.saida, `Frente as-1 carrinho assumida.\nTrabalhe em: ${f.worktree}\n`);
  assert.deepEqual([f.dona, f.tomadaDe, f.estado], ['sessao-teste-0001', A, 'ativa']);
  assert.ok(f.tomadaEm);
  assert.equal(f.atribuidaPor, undefined);
  const corpo = p.ghTicket(1).comments.at(-1).body;
  assert.match(corpo, /^Frente as-1 \(carrinho\) assumida pela sessão sessao-t \(a anterior, sessao-a, processo não existe\)\./);
  assert.match(corpo, /assumida pela sessão sessao-t[\s\S]*ah:tomada id=as-1 .*estado=ativa/);
  assert.match(corpo, new RegExp(`sid=${sidDe('sessao-teste-0001')}`));
  assert.ok(eventos(p).some(e => e.tipo === 'tomada' && e.de === A && e.sessao === 'sessao-teste-0001' && e.frente === 'carrinho' && e.id === 'as-1'));
  assert.equal(lerSessao(dirDoTeste(p), A).frente, null);
  assert.equal(lerSessao(dirDoTeste(p), 'sessao-teste-0001').frente, 'carrinho');
  assert.equal(contarPendentes(dirDoTeste(p)), 0);
  // Mesmo login: a reserva não muda de responsáveis.
  assert.deepEqual(p.ghTicket(1).assignees, ['ana-souza']);
  assert.deepEqual(f.reserva.logins, ['ana-souza']);
});

test('takeover com outro login se põe de responsável e entra na reserva', async t => {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  const r = p.ah(['takeover', 'carrinho', '--confirmado'], { env: { GH_FALSO_LOGIN: 'carla-dias' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual(p.ghTicket(1).assignees, ['ana-souza', 'carla-dias']);
  assert.deepEqual(lerFrenteDoTeste(p, 'carrinho').reserva.logins, ['ana-souza', 'carla-dias']);
});

test('takeover recusa: dona viva, frente passada, frente própria, executor com frente, worktree sumido', async t => {
  const { p, proc } = frenteDeOutra(t);
  const intacta = () => assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, A);

  recusou(p.ah(['takeover']), /Faça: .*ah takeover <nome>/);
  recusou(p.ah(['takeover', 'frete']), /Faça: .*ah board/);
  recusou(p.ah(['takeover', 'carrinho', '--sem-isso']), /Opção desconhecida/);

  // Dona viva, com ou sem --confirmado.
  for (const extra of [[], ['--confirmado']]) {
    const r = p.ah(['takeover', 'carrinho', ...extra]);
    recusou(r, /sessão sessao-a, que está viva/);
    assert.match(r.erro, /Faça: peça à sessão sessao-a que rode ah handoff; ou espere o sinal dela vencer \(120 min\)/);
  }
  intacta();

  // A frente já é desta sessão.
  assert.equal(p.ah(['open', 'frete']).codigo, 0);
  recusou(p.ah(['takeover', 'frete', '--confirmado']), /Faça: a frente já é sua/);

  // Executor com frente ativa.
  await proc.matar();
  const r = p.ah(['takeover', 'carrinho', '--confirmado']);
  recusou(r, /Esta sessão já tem a frente frete/);
  assert.match(r.erro, /Faça: .*ah handoff frete.*ah close frete/);
  intacta();

  // Worktree sumido (sessão B, sem frente).
  const wt = lerFrenteDoTeste(p, 'carrinho').worktree;
  fs.renameSync(wt, `${wt}-fora`);
  recusou(p.ah(['takeover', 'carrinho', '--confirmado'], B), /worktree .*não existe[\s\S]*Faça: .*ah close carrinho.*ah open carrinho/);
  fs.renameSync(`${wt}-fora`, wt);
  intacta();

  // Frente passada.
  const f = lerFrenteDoTeste(p, 'carrinho');
  gravarFrenteDoTeste(p, { ...f, estado: 'passada', dona: null, passadaPor: A });
  recusou(p.ah(['takeover', 'carrinho', '--confirmado'], B), /está passada[\s\S]*Faça: ah open carrinho/);
  gravarFrenteDoTeste(p, f);

  // Abertura parada (processo do open morto) e em curso.
  gravarFrenteDoTeste(p, { ...f, nome: 'cesta', id: 'as-9', estado: 'abrindo', processo: { pid: proc.pid, inicio: null } });
  recusou(p.ah(['takeover', 'cesta', '--confirmado'], B), /Faça: ah open cesta para retomar a abertura parada, ou ah close cesta para desistir dela/);
  gravarFrenteDoTeste(p, { ...f, nome: 'cesta', id: 'as-9', estado: 'abrindo', processo: { pid: process.pid, inicio: null } });
  recusou(p.ah(['takeover', 'cesta', '--confirmado'], B), /em curso[\s\S]*Faça: espere esse ah open terminar/);
  assert.equal(lerFrenteDoTeste(p, 'cesta').estado, 'abrindo');

  assert.ok(!p.ghTicket(1).comments.some(c => /ah:tomada/.test(c.body)));
});

test('frente ativa sem dona (órfã) também se assume', async t => {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  gravarFrenteDoTeste(p, { ...lerFrenteDoTeste(p, 'carrinho'), dona: null });
  recusou(p.ah(['takeover', 'carrinho']), /A frente as-1 carrinho está sem dona\.[\s\S]*--confirmado/);
  const r = p.ah(['takeover', 'carrinho', '--confirmado'], B);
  assert.equal(r.codigo, 0, r.erro);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.dona, f.tomadaDe], ['sessao-b-0002', null]);
  assert.match(p.ghTicket(1).comments.at(-1).body, /assumida pela sessão sessao-b \(antes sem dona\)\./);
});

test('takeover recusa com operação desta máquina na fila para o ticket, sem mudar nada', async t => {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  enfileirar(dirDoTeste(p), { tipo: 'comentario', ticket: 1, corpo: 'pendente\n' });
  const r = p.ah(['takeover', 'carrinho', '--confirmado'], { env: { GH_FALSO_FORA: '1' } });
  recusou(r, /fila para #1[\s\S]*Faça: tente de novo com rede: ah takeover carrinho --confirmado/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, A);
  assert.equal(contarPendentes(dirDoTeste(p)), 1);
});

test('takeover recusa quando o GitHub mostra a frente com outra máquina', async t => {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  const f = lerFrenteDoTeste(p, 'carrinho');
  const marcador = montarMarcador('tomada', { id: f.id, nome: f.nome, ramo: f.ramo, estado: 'ativa', login: 'carla-dias', sessao: 'sessao-c', sid: sidDe('sessao-c-0003') });
  const tk = p.ghTicket(1);
  p.ghSemear(1, { comments: [...tk.comments, { author: 'carla-dias', body: `Frente tomada.\n\n${marcador}\n`, numero: 5000 }] });
  const r = p.ah(['takeover', 'carrinho', '--confirmado']);
  recusou(r, /ativa com @carla-dias em outra máquina[\s\S]*Faça: combine com @carla-dias/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, A);
  assert.ok(!p.ghTicket(1).comments.some(c => c.author === 'ana-souza' && /ah:tomada/.test(c.body)));
});

test('takeover sem rede assume pelo registro daqui e deixa o comentário na fila', async t => {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  const r = p.ah(['takeover', 'carrinho', '--confirmado'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /não consegui conferir no GitHub[\s\S]*#1; o comentário ficou na fila/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, 'sessao-teste-0001');
  assert.ok(pendentesDoTicket(dirDoTeste(p), 1).some(op => op.tipo === 'comentario' && /ah:tomada/.test(op.corpo)));
});

test('takeover de frente sem tickets não fala com o GitHub', async t => {
  const { p, proc } = frenteDeOutra(t, { tickets: '' });
  await proc.matar();
  const antes = p.ghChamadas().filter(c => c.argv[0] === 'issue').length;
  assert.equal(p.ah(['takeover', 'carrinho', '--confirmado']).codigo, 0);
  assert.equal(p.ghChamadas().filter(c => c.argv[0] === 'issue').length, antes);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, 'sessao-teste-0001');
});

// Foco 5 da revisão: a conversa de ontem retomada (--resume) depois do takeover.
async function retomadaDaAntiga(t) {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  assert.equal(p.ah(['takeover', 'carrinho', '--confirmado']).codigo, 0);
  const novo = processoVivo();
  t.after(() => novo.matar());
  const r = await tratar({ tipo: 'inicio', sessao: A, agente: 'claude-code', cwd: p.raiz, origem: 'continuacao' }, { ...amb(p), pid: novo.pid });
  return { p, novo, r };
}

test('sessão antiga retomada depois do takeover não recupera a frente', async t => {
  const { p, r } = await retomadaDaAntiga(t);
  assert.match(r.contexto, /Sua frente as-1 carrinho está com a sessão sessao-t/);
  assert.equal(lerSessao(dirDoTeste(p), A).frente, null);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, 'sessao-teste-0001');
});

test('sessão antiga retomada depois do takeover: o T4 protege a nova dona', async t => {
  const { p, novo } = await retomadaDaAntiga(t);
  const wt = lerFrenteDoTeste(p, 'carrinho').worktree;
  const e = await tratar({ tipo: 'antes', sessao: A, cwd: p.raiz, acao: { tipo: 'edicao', arquivo: path.join(wt, 'a.txt') } }, { ...amb(p), pid: novo.pid });
  assert.equal(e.decisao, 'recusa');
  assert.match(e.mensagem, /^Recusado \(T4\): .* da sessão sessao-t, que está viva/);
});

// ---- Consertos da revisão, rodada 1

test('registro da dona que não se lê recusa em vez de contar como sem dona', t => {
  const { p } = frenteDeOutra(t);
  const arq = path.join(dirDoTeste(p), 'sessoes', `${A}.json`);
  fs.writeFileSync(arq, JSON.stringify({ ...JSON.parse(fs.readFileSync(arq, 'utf8')), esquema: 3 }));
  for (const extra of [[], ['--confirmado']]) {
    const r = p.ah(['takeover', 'carrinho', ...extra], B);
    recusou(r, /esquema 3[\s\S]*Faça: atualize o harness/);
  }
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, A);
});

test('GitHub com a passagem de outra máquina: recusa nomeando quem passou, sem mandar fechar', async t => {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  const f = lerFrenteDoTeste(p, 'carrinho');
  const marcador = montarMarcador('passagem', { id: f.id, nome: f.nome, ramo: f.ramo, estado: 'passada', login: 'carla-dias', sessao: 'sessao-c', tickets: '1' });
  p.ghSemear(1, { comments: [...p.ghTicket(1).comments, { author: 'carla-dias', body: `Passagem.\n\n${marcador}\n`, numero: 5000 }] });
  const r = p.ah(['takeover', 'carrinho', '--confirmado']);
  recusou(r, /passada por @carla-dias/);
  assert.match(r.erro, /Faça: .*@carla-dias.*ah open carrinho/);
  assert.doesNotMatch(r.erro, /ah close/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, A);
});

test('aviso da tomada sai uma vez só para a sessão antiga', async t => {
  const { p, novo } = await retomadaDaAntiga(t);
  const r = await tratar({ tipo: 'inicio', sessao: A, agente: 'claude-code', cwd: p.raiz, origem: 'continuacao' }, { ...amb(p), pid: novo.pid });
  assert.doesNotMatch(r.contexto, /está com a sessão/);
});

test('handoff e retomada pelo open limpam tomadaDe e tomadaEm; a sessão antiga não é avisada', async t => {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  assert.equal(p.ah(['takeover', 'carrinho', '--confirmado']).codigo, 0);
  const h = p.ah(['handoff']);
  assert.equal(h.codigo, 0, h.erro);
  let f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.tomadaDe, f.tomadaEm], [undefined, undefined]);
  const o = p.ah(['open', 'carrinho'], B);
  assert.equal(o.codigo, 0, o.erro);
  f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.dona, f.tomadaDe, f.tomadaEm], ['sessao-b-0002', undefined, undefined]);
  const novo = processoVivo();
  t.after(() => novo.matar());
  const r = await tratar({ tipo: 'inicio', sessao: A, agente: 'claude-code', cwd: p.raiz, origem: 'continuacao' }, { ...amb(p), pid: novo.pid });
  assert.doesNotMatch(r.contexto, /está com a sessão/);
});

test('retomada pelo open de frente passada com tomadaDe velho (registro antigo) limpa os campos', async t => {
  const { p, proc } = frenteDeOutra(t, { tickets: '' });
  await proc.matar();
  gravarFrenteDoTeste(p, { ...lerFrenteDoTeste(p, 'carrinho'), estado: 'passada', dona: null, tomadaDe: A, tomadaEm: '2026-01-01T00:00:00Z' });
  assert.equal(p.ah(['open', 'carrinho'], B).codigo, 0);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.tomadaDe, f.tomadaEm], [undefined, undefined]);
});

// ---- Onda final
test('tomadasAvisadas guarda só as 50 mais recentes', async t => {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  assert.equal(p.ah(['takeover', 'carrinho', '--confirmado']).codigo, 0);
  const arq = path.join(dirDoTeste(p), 'sessoes', `${A}.json`);
  const velhas = Array.from({ length: 60 }, (_, i) => `as-x${i}@2026-01-01T00:00:00Z`);
  fs.writeFileSync(arq, JSON.stringify({ ...JSON.parse(fs.readFileSync(arq, 'utf8')), tomadasAvisadas: velhas }));
  const novo = processoVivo();
  t.after(() => novo.matar());
  const r = await tratar({ tipo: 'inicio', sessao: A, agente: 'claude-code', cwd: p.raiz, origem: 'continuacao' }, { ...amb(p), pid: novo.pid });
  assert.match(r.contexto, /está com a sessão sessao-t/);
  const lista = lerSessao(dirDoTeste(p), A).tomadasAvisadas;
  assert.equal(lista.length, 50);
  assert.match(lista.at(-1), /^as-1@/);
  assert.equal(lista[0], 'as-x11@2026-01-01T00:00:00Z');
});

test('takeover sem --confirmado só lê: não registra sessão nem toca sinal; grava só o evento de recusa', async t => {
  const { p, proc } = frenteDeOutra(t);
  await proc.matar();
  const dir = dirDoTeste(p);
  const listarTudo = () => fs.readdirSync(dir, { recursive: true }).filter(n => !String(n).startsWith('eventos')).sort();
  const antes = listarTudo();
  const mtimes = () => antes.map(n => { try { return fs.statSync(path.join(dir, n)).mtimeMs; } catch { return null; } });
  const m0 = mtimes();
  const n0 = eventos(p).length;
  await new Promise(r => setTimeout(r, 20));
  recusou(p.ah(['takeover', 'carrinho'], B), /--confirmado/);
  assert.deepEqual(listarTudo(), antes, 'nenhum arquivo novo');
  assert.deepEqual(mtimes(), m0, 'nada regravado');
  assert.equal(fs.existsSync(path.join(dir, 'sessoes', 'sessao-b-0002.json')), false);
  const novos = eventos(p).slice(n0);
  assert.deepEqual(novos.map(e => e.tipo), ['recusa-de-comando']);
});
