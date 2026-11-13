import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, dirDoTeste, outraMaquina } from './apoio/repo.mjs';
import { acharPassagem, montarMarcador } from '../nucleo/lib/reserva.mjs';
import { reenviarPendentes } from '../nucleo/lib/pendentes.mjs';
import { encerrarSessao, lerSessao, registrarSessao } from '../nucleo/lib/sessao.mjs';
import { continuarSessao } from '../nucleo/lib/heranca.mjs';
import { processoVivo } from './apoio/processo.mjs';

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
  assert.deepEqual([a.ok, a.passagem, a.ativa.id, a.ativa.login, a.ativa.sessao], [true, null, 'as-1', 'ana-souza', 'sessao-d']);
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
  const a = acharPassagem({ nome: 'frete', tickets: [4], rotulo: 'em-andamento' }, o);
  assert.deepEqual([a.passagem, a.ativa.id, a.ativa.login, a.ativa.logins, a.ativa.frente.tickets], [null, 'as-2', 'carla-dias', ['ana-souza', 'carla-dias'], [4]]);
  assert.equal(typeof a.ativa.numero, 'number');
  p.ghSemear(4, { comments: [...p.ghTicket(4).comments, { author: 'ana-souza', body: montarMarcador('tomada', { id: 'as-2', nome: 'frete', login: 'ana-souza' }) }] });
  assert.equal(acharPassagem({ nome: 'frete', tickets: [4], rotulo: 'em-andamento' }, o).ativa.login, 'ana-souza');
  assert.deepEqual(acharPassagem({ nome: 'outra', rotulo: 'em-andamento' }, o), { ok: true, passagem: null });
  p.ghSemear(3, { comments: [...p.ghTicket(3).comments, m('fechamento', 'carla-dias')] });
  assert.deepEqual(acharPassagem({ nome: 'carrinho', tickets: [3], rotulo: 'em-andamento' }, o), { ok: true, passagem: null });
  r = acharPassagem({ nome: 'carrinho', rotulo: 'em-andamento' }, { ...o, env: { ...p.env, GH_FALSO_FORA: '1' } });
  assert.equal(r.ok, false);
  assert.ok(r.motivo);
});

// ---- Consertos da revisão da tarefa 8 ----

const B = { env: { AH_SESSAO: 'sessao-b-0002' } };
const tiposNoTicket = (p, n) => p.ghTicket(n).comments.map(c => c.body.match(/<!-- ah:([a-z]+)/)?.[1]).filter(Boolean);
const commitar = (p, wt, arquivo) => {
  fs.writeFileSync(path.join(wt, arquivo), arquivo);
  p.git(['add', arquivo], { cwd: wt });
  p.git(['commit', '-m', `feat: ${arquivo}`], { cwd: wt });
};

test('item 1: a máquina que passou não retoma o que a outra já retomou; o recado aponta ah close', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Não retomei carrinho: a frente as-1 está ativa com @carla-dias em outra máquina/);
  assert.match(r.erro, /Faça: .*combine com @carla-dias.*ah close carrinho/);
  assert.deepEqual([lerFrenteDoTeste(p, 'carrinho').estado, lerFrenteDoTeste(p, 'carrinho').dona], ['passada', null]);
  assert.equal(tiposNoTicket(p, 1).at(-1), 'retomada');
  assert.deepEqual(p.ghTicket(1).assignees.sort(), ['ana-souza', 'carla-dias']);
});

test('item 1: depois que a outra máquina passa de volta, retoma aqui e o worktree avança até os commits dela', t => {
  const { p, wt } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  commitar(q, lerFrenteDoTeste(q, 'carrinho').worktree, 'b.txt');
  assert.equal(q.ah(['handoff']).codigo, 0);
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /avançou até origin\/feat\/carrinho/);
  assert.ok(fs.existsSync(path.join(wt, 'b.txt')));
  assert.deepEqual(tiposNoTicket(p, 1).slice(-1), ['retomada']);
  // E a outra máquina, com o registro passado dela, agora ouve que a frente está com quem retomou.
  const r2 = q.ah(['open', 'carrinho']);
  assert.equal(r2.codigo, 1);
  assert.match(r2.erro, /ativa com @ana-souza em outra máquina/);
});

test('item 1: ramos divergentes recusam a retomada sem mudar nada', t => {
  const { p, wt } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  commitar(q, lerFrenteDoTeste(q, 'carrinho').worktree, 'b.txt');
  assert.equal(q.ah(['handoff']).codigo, 0);
  commitar(p, wt, 'c.txt');
  const antes = p.ghTicket(1).comments.length;
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /divergiram[\s\S]*Faça: .*pull --rebase/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  assert.equal(p.ghTicket(1).comments.length, antes);
});

test('item 1: sem rede, a retomada local de frente com tickets recusa; sem tickets, retoma', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const r = p.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002', GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /preciso do GitHub para confirmar que ninguém retomou carrinho/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  const { p: s } = comFrente(t, { tickets: '' });
  assert.equal(s.ah(['handoff']).codigo, 0);
  assert.equal(s.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002', GH_FALSO_FORA: '1' } }).codigo, 0);
});

test('item 1: retomada local que perde a corrida volta o registro a passada e mantém o worktree', t => {
  const { p, wt } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const corrida = { ticket: 1, autor: 'carla-dias', body: `x\n\n${montarMarcador('retomada', { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', estado: 'ativa', login: 'carla-dias', sessao: 'sessao-c' })}\n` };
  const r = p.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002', GH_FALSO_CORRIDA: JSON.stringify(corrida) } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /retomada antes por @carla-dias/);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.estado, f.dona], ['passada', null]);
  assert.ok(fs.existsSync(path.join(wt, 'a.txt')));
  assert.equal(JSON.parse(p.ah(['whoami', '--json'], B).saida).frente, null);
});

test('item 2: close da frente passada que outra máquina retomou fecha só o registro local', t => {
  const { p, wt } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  const antes = p.ghTicket(1);
  const r = p.ah(['close', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Registro local da frente as-1 carrinho fechado: a frente as-1 está ativa com @carla-dias em outra máquina\. Não comentei nem mexi nos tickets/);
  assert.deepEqual(p.ghTicket(1), antes);
  assert.equal(temFrente(p, 'carrinho'), false);
  assert.equal(fs.existsSync(wt), false);
  assert.doesNotMatch(p.git(['log', '-1', '--format=%s']).saida, /fecha as-1/);
});

test('item 2: close de frente passada com tickets, sem rede, recusa sem apagar nada', t => {
  const { p, wt } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const r = p.ah(['close', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002', GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /preciso do GitHub para confirmar que ninguém retomou carrinho/);
  assert.ok(temFrente(p, 'carrinho'));
  assert.ok(fs.existsSync(wt));
});

test('item 3: falha no meio da retomada remota devolve a passagem; a próxima tentativa retoma', t => {
  const { p } = comFrente(t, { tickets: '1,2' });
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  q.ghResponder([{ prefixo: ['issue', 'comment', '2'], codigo: 1, erro: 'falhou\n' }]);
  let r = q.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /não consegui comentar a retomada em #2/);
  assert.equal(temFrente(q, 'carrinho'), false);
  assert.deepEqual(tiposNoTicket(p, 1).slice(-2), ['retomada', 'passagem']);
  assert.match(p.ghTicket(1).comments.at(-1).body, /desfeita[\s\S]*ah:passagem id=as-1 .*login=carla-dias/);
  assert.ok(!tiposNoTicket(p, 2).includes('retomada'));
  q.ghResponder([]);
  r = q.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual(lerFrenteDoTeste(q, 'carrinho').tickets, [1, 2]);
});

test('item 3: retomada desta sessão que parou no meio (sem registro local) é reconhecida e continua', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  const meu = montarMarcador('retomada', { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', estado: 'ativa', login: 'carla-dias', sessao: 'sessao-c', tickets: '1', abertaPor: 'ana-souza' });
  p.ghSemear(1, { comments: [...p.ghTicket(1).comments, { author: 'carla-dias', body: `x\n\n${meu}`, numero: 5000 }] });
  const r = q.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 0, r.erro);
  const f = lerFrenteDoTeste(q, 'carrinho');
  assert.deepEqual([f.id, f.tickets, f.dona, f.abertaPor], ['as-1', [1], 'sessao-c-0003', 'ana-souza']);
  assert.ok(p.ghTicket(1).assignees.includes('carla-dias'));
});

test('item 3: comentário que falha não entra na lista do que desfazer', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  q.ghResponder([{ prefixo: ['issue', 'comment', '1'], codigo: 1, erro: 'falhou\n' }]);
  const r = q.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 1);
  const fila = path.join(dirDoTeste(q), 'pendentes.jsonl');
  const ops = fs.existsSync(fila) ? fs.readFileSync(fila, 'utf8').split('\n').filter(Boolean) : [];
  assert.ok(!ops.some(l => /desfeita/.test(l)), ops.join('\n'));
});

test('item 4: o próprio comentário se reconhece pelo número, não por login e sessão curta', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  // Mesmo login e mesmo prefixo de sessão (outra sessão), retomando antes.
  const corrida = { ticket: 1, autor: 'carla-dias', body: `x\n\n${montarMarcador('retomada', { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', estado: 'ativa', login: 'carla-dias', sessao: 'sessao-c' })}\n` };
  const r = q.ah(['open', 'carrinho'], { env: { GH_FALSO_CORRIDA: JSON.stringify(corrida) } });
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /retomada antes por @carla-dias/);
  assert.equal(temFrente(q, 'carrinho'), false);
});

test('item 5: sem --tickets, a lista só aponta; a decisão relê cada ticket', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  const desde = p.ghChamadas().length;
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  const chamadas = p.ghChamadas().slice(desde).map(c => c.argv.slice(0, 3).join(' '));
  const lista = chamadas.indexOf('issue list --label');
  assert.ok(lista >= 0, chamadas.join('\n'));
  const comentario = chamadas.indexOf('issue comment 1');
  assert.ok(chamadas.slice(lista + 1, comentario).includes('issue view 1'), chamadas.join('\n'));
});

test('item 6: ticket de --tickets que não existe tem erro próprio', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  p.ghSemear(9, { apagado: true });
  const q = maquina(t, p);
  const r = q.ah(['open', 'carrinho', '--tickets', '9']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Não achei o ticket #9/);
  assert.doesNotMatch(r.erro, /preciso do GitHub/);
});

// ---- Consertos da revisão da tarefa 8, rodada 2 ----

const esperarArquivo = async (arquivo, ms = 15000) => {
  const ate = Date.now() + ms;
  while (!fs.existsSync(arquivo)) {
    if (Date.now() > ate) throw new Error(`não apareceu: ${arquivo}`);
    await new Promise(r => setTimeout(r, 25));
  }
};
// Roda `ah <args>` em `p` ao fundo, parado no comentário cujo corpo tem `texto`. Devolve o fim e o soltar.
async function paradoNoComentario(t, p, args, texto, extra = {}) {
  const pausa = path.join(path.dirname(dirDoTeste(p)), `pausa-${texto.replace(/\W/g, '')}`);
  const h = p.ahAoFundo(args, { env: { ...extra, GH_FALSO_PAUSA_COMENTARIO: pausa, GH_FALSO_PAUSA_TEXTO: texto } });
  t.after(() => { h.processo.kill('SIGKILL'); try { fs.writeFileSync(`${pausa}.solta`, ''); } catch { /* pasta já limpa */ } });
  await esperarArquivo(`${pausa}.chegou`);
  return { soltar: async () => { fs.writeFileSync(`${pausa}.solta`, ''); return h.fim; } };
}

test('Q1: retomada local parada no comentário enquanto outra máquina retoma: só uma fica', async t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  const a = await paradoNoComentario(t, p, ['open', 'carrinho'], 'ah:retomada', { AH_SESSAO: 'sessao-b-0002' });
  const rq = q.ah(['open', 'carrinho']);
  const ra = await a.soltar();
  const ficaram = [rq.codigo, ra.codigo].filter(c => c === 0).length;
  assert.equal(ficaram, 1, `q: ${rq.erro}\np: ${ra.erro}`);
  // q comentou primeiro (p estava parado antes de gravar): q fica, p desfaz e volta a passada.
  assert.equal(rq.codigo, 0, rq.erro);
  assert.match(ra.erro, /retomada antes por @carla-dias/);
  assert.deepEqual([lerFrenteDoTeste(p, 'carrinho').estado, lerFrenteDoTeste(p, 'carrinho').dona], ['passada', null]);
});

test('Q1: não existe mais o atalho da fila: passagem na fila recusa a retomada local', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff'], { env: { GH_FALSO_FORA: '1' } }).codigo, 0);
  const r = p.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002', GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /há operações desta máquina na fila para #1 que precisam sair antes/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
});

test('Q2: close parado no comentário de fechamento: a outra máquina não retoma (o close tomou antes)', async t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  const a = await paradoNoComentario(t, p, ['close', 'carrinho'], 'ah:fechamento', { AH_SESSAO: 'sessao-b-0002' });
  const rq = q.ah(['open', 'carrinho']);
  const ra = await a.soltar();
  assert.equal(rq.codigo, 1, rq.saida);
  assert.match(rq.erro, /ativa com @ana-souza em outra máquina/);
  assert.equal(ra.codigo, 0, ra.erro);
  assert.match(ra.saida, /Frente as-1 carrinho fechada\./);
  assert.deepEqual(tiposNoTicket(p, 1).slice(-2), ['retomada', 'fechamento']);
  assert.equal(temFrente(q, 'carrinho'), false);
});

test('Q2: close parado na própria retomada enquanto outra máquina retoma: fecha só o local', async t => {
  const { p, wt } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  const a = await paradoNoComentario(t, p, ['close', 'carrinho'], 'ah:retomada', { AH_SESSAO: 'sessao-b-0002' });
  const rq = q.ah(['open', 'carrinho']);
  const ra = await a.soltar();
  assert.equal(rq.codigo, 0, rq.erro);
  assert.equal(ra.codigo, 0, ra.erro);
  assert.match(ra.saida, /Registro local da frente as-1 carrinho fechado: a frente as-1 foi retomada antes por @carla-dias/);
  assert.ok(!tiposNoTicket(p, 1).includes('fechamento'));
  assert.ok(p.ghTicket(1).assignees.includes('carla-dias'));
  assert.equal(fs.existsSync(wt), false);
});

test('item 4: mesmo login e mesmo prefixo de sessão em outra máquina não é "a mesma sessão"', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  const c = maquina(t, p, { sessao: 'sessao-c-0004', login: 'carla-dias', sigla: 'cd' });
  const r = c.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /ativa com @carla-dias em outra máquina/);
  assert.equal(temFrente(c, 'carrinho'), false);
});

test('item 4: quem passou não retoma o que a mesma pessoa retomou em outra máquina com sessão de mesmo prefixo', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const m = maquina(t, p, { sessao: 'sessao-teste-0009', login: 'ana-souza', sigla: 'as' });
  assert.equal(m.ah(['open', 'carrinho']).codigo, 0);
  const r = p.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /ativa com @ana-souza em outra máquina/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
});

test('item 4: os marcadores que seguram a frente levam sid; a passagem não', t => {
  const { p } = comFrente(t);
  assert.match(p.ghTicket(1).comments[0].body, /<!-- ah:frente .* sid=[0-9a-f]{16} v=1 -->/);
  assert.equal(p.ah(['handoff']).codigo, 0);
  assert.doesNotMatch(p.ghTicket(1).comments.at(-1).body, /sid=/);
  assert.equal(p.ah(['open', 'carrinho'], B).codigo, 0);
  assert.match(p.ghTicket(1).comments.at(-1).body, /<!-- ah:retomada .* sid=[0-9a-f]{16} v=1 -->/);
});

test('frente passada aqui sem passagem nos tickets (continuação sem vínculo): retoma como tomada', t => {
  const { p } = comFrente(t);
  const f = lerFrenteDoTeste(p, 'carrinho');
  fs.writeFileSync(path.join(dirDoTeste(p), 'frentes', 'carrinho.json'), JSON.stringify({ ...f, estado: 'passada', dona: null, passadaPor: 'continuacao-sem-vinculo' }));
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(tiposNoTicket(p, 1).at(-1), 'tomada');
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, 'sessao-b-0002');
});

test('Q1 (reprodução da revisão): handoff parado na passagem, retomada local e outra máquina: nunca duas ativas', async t => {
  const { p } = comFrente(t);
  const h = await paradoNoComentario(t, p, ['handoff'], 'ah:passagem');
  const ra = p.ah(['open', 'carrinho'], B); // a passagem ainda na fila, com o reenvio preso no handoff
  const fim = await h.soltar();
  assert.equal(fim.codigo, 0, fim.erro);
  const q = maquina(t, p);
  const rq = q.ah(['open', 'carrinho']);
  // O que a retomada local deixou na fila sai agora (como sairia no próximo comando).
  await reenviarPendentes(dirDoTeste(p), { cwd: p.raiz, env: p.env });
  const ativas = [ra.codigo === 0 && lerFrenteDoTeste(p, 'carrinho').estado === 'ativa', rq.codigo === 0].filter(Boolean).length;
  assert.equal(ativas, 1, `p: ${ra.codigo} ${ra.erro}\nq: ${rq.codigo} ${rq.erro}`);
  assert.equal(ra.codigo, 1);
  assert.match(ra.erro, /na fila para #1 que precisam sair antes/);
  assert.equal(rq.codigo, 0, rq.erro);
});

// ---- Consertos da revisão da tarefa 8, rodada 3 ----

test('rodada 3, item 1: retomada que chega depois de um fechamento perde, desfaz e deixa o ticket livre', async t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  assert.equal(q.ah(['handoff']).codigo, 0);
  const a = await paradoNoComentario(t, p, ['open', 'carrinho'], 'ah:retomada', { AH_SESSAO: 'sessao-b-0002' });
  const rq = q.ah(['close', 'carrinho']);
  assert.equal(rq.codigo, 0, rq.erro);
  const ra = await a.soltar();
  assert.equal(ra.codigo, 1, ra.saida);
  assert.match(ra.erro, /foi fechada/);
  assert.match(ra.erro, /Faça: .*ah close carrinho/);
  assert.deepEqual([lerFrenteDoTeste(p, 'carrinho').estado, lerFrenteDoTeste(p, 'carrinho').dona], ['passada', null]);
  const tk = p.ghTicket(1);
  assert.deepEqual(tk.assignees, []);
  assert.ok(!tk.labels.includes('em-andamento'), tk.labels.join(','));
  assert.deepEqual(acharPassagem({ nome: 'carrinho', tickets: [1], rotulo: 'em-andamento' }, { cwd: p.raiz, env: p.env }), { ok: true, passagem: null });
});

test('rodada 3, item 1: quem retoma volta a ser responsável pelo que o ticket mostra, não pela reserva local', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  p.ghSemear(1, { assignees: [], labels: [] });
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual(p.ghTicket(1).assignees, ['ana-souza']);
  assert.ok(p.ghTicket(1).labels.includes('em-andamento'));
});

test('rodada 3, item 2: sessão registrada aqui que trabalha em outra frente não faz a frente "daqui"', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  assert.equal(p.ah(['whoami'], { env: { AH_SESSAO: 'sessao-c-0003' } }).codigo, 0);
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /ativa com @carla-dias em outra máquina/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
});

test('rodada 3, item 3: close depois de ida e volta tira todos os responsáveis que os marcadores mostram', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  assert.equal(q.ah(['handoff']).codigo, 0);
  assert.deepEqual(p.ghTicket(1).assignees.sort(), ['ana-souza', 'carla-dias']);
  const r = p.ah(['close', 'carrinho']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho fechada\./);
  assert.deepEqual(p.ghTicket(1).assignees, []);
  assert.equal(tiposNoTicket(p, 1).at(-1), 'fechamento');
});

// ---- Consertos da revisão da tarefa 8, rodada 4 ----

const marcadorDe = (tipo, n, login, sessao, extra = {}) => ({
  ticket: n, autor: login,
  body: `x\n\n${montarMarcador(tipo, { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', login, sessao, ...extra })}\n`,
});

test('rodada 4, item 1: com dois tickets, fechamento entre as retomadas desta (c1 c2 r1 f1 f2 r2) perde', t => {
  const { p } = comFrente(t, { tickets: '1,2' });
  assert.equal(p.ah(['handoff']).codigo, 0);
  const corrida = [
    { ...marcadorDe('retomada', 1, 'carla-dias', 'sessao-c'), antesDe: 1 },
    { ...marcadorDe('retomada', 2, 'carla-dias', 'sessao-c'), antesDe: 1 },
    { ...marcadorDe('fechamento', 1, 'carla-dias', 'sessao-c'), depoisDe: 1 },
    { ...marcadorDe('fechamento', 2, 'carla-dias', 'sessao-c'), depoisDe: 1 },
  ];
  const r = p.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002', GH_FALSO_CORRIDA: JSON.stringify(corrida) } });
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /foi fechada/);
  assert.deepEqual([lerFrenteDoTeste(p, 'carrinho').estado, lerFrenteDoTeste(p, 'carrinho').dona], ['passada', null]);
  for (const n of [1, 2]) assert.ok(['fechamento', 'desistencia'].includes(tiposNoTicket(p, n).at(-1)), `#${n}: ${tiposNoTicket(p, n)}`);
  assert.deepEqual(acharPassagem({ nome: 'carrinho', tickets: [1, 2], rotulo: 'em-andamento' }, { cwd: p.raiz, env: p.env }), { ok: true, passagem: null });
});

test('rodada 4, item 1a: com um ticket (c1 r1 f1) a recusa diz que a frente foi fechada', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const corrida = [{ ...marcadorDe('retomada', 1, 'carla-dias', 'sessao-c'), antesDe: 1 }, { ...marcadorDe('fechamento', 1, 'carla-dias', 'sessao-c'), depoisDe: 1 }];
  const r = p.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002', GH_FALSO_CORRIDA: JSON.stringify(corrida) } });
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /foi fechada/);
  assert.doesNotMatch(r.erro, /não consegui confirmar/);
});

test('rodada 4, item 1b: o desfazer de retomada fechada não tira o login que outra frente segura', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  p.ghSemear(1, { assignees: [] });
  const corrida = [
    { ...marcadorDe('fechamento', 1, 'carla-dias', 'sessao-c'), depoisDe: 1 },
    { ticket: 1, autor: 'ana-souza', depoisDe: 1, body: `x\n\n${montarMarcador('frente', { id: 'as-9', nome: 'frete', ramo: 'feat/frete', estado: 'ativa', login: 'ana-souza', sessao: 'sessao-d' })}\n` },
  ];
  const r = p.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002', GH_FALSO_CORRIDA: JSON.stringify(corrida) } });
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /foi fechada/);
  assert.ok(p.ghTicket(1).assignees.includes('ana-souza'), p.ghTicket(1).assignees.join(','));
  assert.ok(p.ghTicket(1).labels.includes('em-andamento'));
});

test('rodada 4, item 2: sessão encerrada desta máquina, de outra frente, não faz a frente "daqui"', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = maquina(t, p);
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  registrarSessao(dirDoTeste(p), { id: 'sessao-c-0003', agente: 'desconhecido', pid: null, pidInicio: null });
  encerrarSessao(dirDoTeste(p), 'sessao-c-0003', 'fim');
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /ativa com @carla-dias em outra máquina/);
});

test('rodada 4, item 2: a continuação sem vínculo guarda de que sessão a frente ficou solta, e ela retoma como tomada', t => {
  const { p } = comFrente(t);
  const f = lerFrenteDoTeste(p, 'carrinho');
  fs.writeFileSync(path.join(dirDoTeste(p), 'frentes', 'carrinho.json'), JSON.stringify({ ...f, estado: 'passada', dona: null, passadaPor: 'continuacao-sem-vinculo', passadaDe: 'sessao-teste-0001' }));
  const s = JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'sessoes', 'sessao-teste-0001.json'), 'utf8'));
  fs.writeFileSync(path.join(dirDoTeste(p), 'sessoes', 'sessao-teste-0001.json'), JSON.stringify({ ...s, frente: null, fim: new Date().toISOString(), motivoFim: 'substituida' }));
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(tiposNoTicket(p, 1).at(-1), 'tomada');
});

test('rodada 4, item 3: o fechamento não tira o rótulo com outra frente ativa no ticket', t => {
  const { p } = comFrente(t);
  assert.equal(p.git(['merge', '--no-ff', 'feat/carrinho', '-m', 'merge']).codigo, 0);
  const outra = { author: 'carla-dias', body: `x\n\n${montarMarcador('frente', { id: 'cd-1', nome: 'frete', ramo: 'feat/frete', estado: 'ativa', login: 'carla-dias', sessao: 'sessao-c' })}` };
  p.ghSemear(1, { comments: [...p.ghTicket(1).comments, outra], assignees: ['ana-souza', 'carla-dias'] });
  const r = p.ah(['close', 'carrinho']);
  assert.equal(r.codigo, 0, r.erro);
  assert.ok(p.ghTicket(1).labels.includes('em-andamento'), p.ghTicket(1).labels.join(','));
  assert.deepEqual(p.ghTicket(1).assignees, ['carla-dias']);
});

// ---- Consertos da revisão da tarefa 8, rodada 5 ----

// A abre carrinho (#1) com o agente num processo vivo; um /clear (continuação com vínculo) passa a frente para Y.
async function comClear(t) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const proc = processoVivo();
  t.after(() => proc.matar());
  const X = 'sessao-x-0005';
  const Y = 'sessao-y-0006';
  assert.equal(p.ah(['open', 'carrinho', '--tickets', '1'], { env: { AH_SESSAO: X, AH_PID_AGENTE: String(proc.pid) } }).codigo, 0);
  const dir = dirDoTeste(p);
  const { pid, pidInicio } = lerSessao(dir, X);
  registrarSessao(dir, { id: Y, agente: 'desconhecido', pid, pidInicio });
  const r = await continuarSessao(dir, { sessao: Y, pid, pidInicio, origem: 'continuacao' });
  assert.deepEqual(r.herdadas, ['carrinho']);
  assert.deepEqual([lerSessao(dir, X).frente, lerSessao(dir, X).motivoFim, lerFrenteDoTeste(p, 'carrinho').dona], [null, 'substituida', Y]);
  return { p, proc, dir, X, Y, pid, pidInicio };
}

test('rodada 5: a herança com vínculo deixa a sessão substituída em sessoesAnteriores', async t => {
  const { p, X } = await comClear(t);
  assert.deepEqual(lerFrenteDoTeste(p, 'carrinho').sessoesAnteriores, [X]);
});

test('rodada 5, reprodução A: takeover depois de um /clear reconhece o marcador da sessão substituída', async t => {
  const { p, proc } = await comClear(t);
  await proc.matar();
  const r = p.ah(['takeover', 'carrinho', '--confirmado'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, 'sessao-b-0002');
});

test('rodada 5, reprodução B: /clear e depois começo sem vínculo: a frente passada se retoma aqui', async t => {
  const { p, dir, X, Y, pid, pidInicio } = await comClear(t);
  const Z = 'sessao-z-0007';
  registrarSessao(dir, { id: Z, agente: 'desconhecido', pid, pidInicio });
  const r1 = await continuarSessao(dir, { sessao: Z, pid, pidInicio, origem: 'novo' });
  assert.deepEqual(r1.soltas, ['carrinho']);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.estado, f.passadaDe, f.sessoesAnteriores, lerSessao(dir, Y).frente], ['passada', Y, [X, Y], null]);
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(tiposNoTicket(p, 1).at(-1), 'tomada');
});

test('rodada 5: close de frente fechada durante a tomada não diz que não mexeu nos tickets', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const corrida = [{ ...marcadorDe('fechamento', 1, 'carla-dias', 'sessao-c'), depoisDe: 1 }];
  const r = p.ah(['close', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002', GH_FALSO_CORRIDA: JSON.stringify(corrida) } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Registro local da frente as-1 carrinho fechado: a frente as-1 foi fechada durante esta retomada/);
  assert.doesNotMatch(r.saida, /Não comentei nem mexi nos tickets/);
  assert.match(r.saida, /Nos tickets, desfiz a retomada deste close/);
});
