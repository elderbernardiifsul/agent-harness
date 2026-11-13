import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, dirDoTeste } from './apoio/repo.mjs';
import { lerMarcadores, lerTicket, liberarTickets, marcarTickets, montarMarcador, situacaoDoTicket } from '../nucleo/lib/reserva.mjs';
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
  const corrida = { ticket: 1, autor: 'carla-dias', body: montarMarcador('frente', { id: 'cd-1', nome: 'frete', ramo: 'feat/frete', estado: 'ativa', login: 'carla-dias' }) };
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
  const corrida = { ticket: 2, autor: 'carla-dias', body: montarMarcador('frente', { id: 'cd-1', nome: 'frete', ramo: 'feat/frete', estado: 'ativa', login: 'carla-dias' }) };
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
