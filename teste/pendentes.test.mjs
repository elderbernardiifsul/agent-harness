import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, criarRepo, dirDoTeste } from './apoio/repo.mjs';
import { MAX_TENTATIVAS, comentarOuEnfileirar, contarPendentes, editarOuEnfileirar, enfileirar, reenviarComAviso, reenviarPendentes } from '../nucleo/lib/pendentes.mjs';
import { criarRotulo, editarTicket } from '../nucleo/lib/github.mjs';

const eventos = p => fs.readFileSync(path.join(dirDoTeste(p), 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const lerFila = dir => fs.readFileSync(path.join(dir, 'pendentes.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const preparar = () => {
  const p = criarRepo();
  return { p, dir: dirDoTeste(p), o: { cwd: p.raiz, env: p.env }, fora: { cwd: p.raiz, env: { ...p.env, GH_FALSO_FORA: '1' } } };
};

test('editarTicket e criarRotulo chamam o gh com os argumentos do desenho', () => {
  const { p, o, fora } = preparar();
  assert.equal(editarTicket(2, ['--add-label', 'em-andamento'], o), false); // rótulo que não existe
  assert.equal(criarRotulo('em-andamento', o), true);
  assert.equal(editarTicket(2, ['--add-assignee', '@me', '--add-label', 'em-andamento'], o), true);
  assert.deepEqual(p.ghTicket(2).assignees, ['ana-souza']);
  assert.equal(criarRotulo('em-andamento', o), true);
  assert.deepEqual(p.ghChamadas().at(-1).argv, ['label', 'create', 'em-andamento', '--color', 'FBCA04', '--description', 'reservado por uma frente do agent-harness', '--force']);
  assert.equal(editarTicket(2, ['--add-label', 'x'], fora), false);
  assert.equal(criarRotulo('em-andamento', fora), false);
  p.limpar();
});

test('comentário com rede sai na hora e não entra na fila', () => {
  const { p, dir, o } = preparar();
  assert.equal(comentarOuEnfileirar(dir, 1, 'a', o), 'enviado');
  assert.equal(contarPendentes(dir), 0);
  assert.equal(p.ghTicket(1).comments[0].body, 'a');
  p.limpar();
});

test('comentário sem rede vai para a fila e sai no reenvio', async () => {
  const { p, dir, o, fora } = preparar();
  assert.equal(comentarOuEnfileirar(dir, 1, 'a', fora), 'na-fila');
  assert.equal(contarPendentes(dir), 1);
  assert.ok(eventos(p).some(e => e.tipo === 'comentario-falhou' && e.ticket === 1));
  assert.deepEqual(p.ghTicket(1).comments, []);
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 1, restam: 0, descartados: 0 });
  assert.equal(p.ghTicket(1).comments[0].body, 'a');
  assert.equal(contarPendentes(dir), 0);
  p.limpar();
});

test('edição sem rede vai para a fila e sai no reenvio', async () => {
  const { p, dir, o, fora } = preparar();
  assert.equal(criarRotulo('em-andamento', o), true);
  assert.equal(editarOuEnfileirar(dir, 2, ['--add-assignee', '@me', '--add-label', 'em-andamento'], fora), 'na-fila');
  assert.ok(eventos(p).some(e => e.tipo === 'edicao-falhou' && e.ticket === 2));
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 1, restam: 0, descartados: 0 });
  assert.deepEqual(p.ghTicket(2), { state: 'OPEN', assignees: ['ana-souza'], labels: ['em-andamento'], comments: [] });
  assert.equal(editarOuEnfileirar(dir, 2, ['--remove-label', 'em-andamento'], o), 'enviado');
  assert.deepEqual(p.ghTicket(2).labels, []);
  p.limpar();
});

test('reenvio para no primeiro erro passageiro e mantém a ordem', async () => {
  const { p, dir, o, fora } = preparar();
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'primeiro' });
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'segundo' });
  assert.deepEqual(await reenviarPendentes(dir, fora), { enviados: 0, restam: 2, descartados: 0 });
  assert.equal(contarPendentes(dir), 2);
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 2, restam: 0, descartados: 0 });
  assert.deepEqual(p.ghTicket(1).comments.map(c => c.body), ['primeiro', 'segundo']);
  p.limpar();
});

test('com comentário do mesmo ticket na fila, o novo entra atrás dele para não passar na frente', async () => {
  const { p, dir, o } = preparar();
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'antigo' });
  assert.equal(comentarOuEnfileirar(dir, 1, 'novo', o), 'na-fila');
  assert.equal(comentarOuEnfileirar(dir, 2, 'outro ticket', o), 'enviado');
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 2, restam: 0, descartados: 0 });
  assert.deepEqual(p.ghTicket(1).comments.map(c => c.body), ['antigo', 'novo']);
  p.limpar();
});

test('erro permanente vai para os descartados e não trava a fila', async () => {
  const { p, dir, o } = preparar();
  p.ghSemear(8, { apagado: true });
  enfileirar(dir, { tipo: 'comentario', ticket: 8, corpo: 'x' });
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'y' });
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 1, restam: 0, descartados: 1 });
  const arq = path.join(dir, 'pendentes-descartados.jsonl');
  assert.ok(fs.existsSync(arq));
  const desc = JSON.parse(fs.readFileSync(arq, 'utf8').trim());
  assert.equal(desc.ticket, 8);
  assert.match(desc.erro, /Could not resolve to an issue/);
  assert.ok(eventos(p).some(e => e.tipo === 'pendente-descartado' && e.ticket === 8));
  assert.equal(p.ghTicket(1).comments[0].body, 'y');
  p.limpar();
});

test('linha ilegível na fila vai para os descartados', async () => {
  const { p, dir, o } = preparar();
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'a' });
  fs.appendFileSync(path.join(dir, 'pendentes.jsonl'), '{quebrada\n');
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'b' });
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 2, restam: 0, descartados: 1 });
  assert.deepEqual(p.ghTicket(1).comments.map(c => c.body), ['a', 'b']);
  p.limpar();
});

test('reenvio com outro reenvio em andamento não espera nem envia', async () => {
  const { p, dir, o } = preparar();
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'a' });
  const trava = path.join(dir, 'travas', 'pendentes-reenvio');
  fs.mkdirSync(trava, { recursive: true });
  fs.writeFileSync(path.join(trava, 'dono.json'), JSON.stringify({ pid: 1, em: new Date().toISOString(), marca: 'outra' }));
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 0, restam: 1, descartados: 0 });
  fs.rmSync(trava, { recursive: true });
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 1, restam: 0, descartados: 0 });
  p.limpar();
});

test('fila vazia: nada a reenviar', async () => {
  const { p, dir, o } = preparar();
  assert.equal(contarPendentes(dir), 0);
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 0, restam: 0, descartados: 0 });
  p.limpar();
});

function comFrente(nome = 'carrinho') {
  const p = criarProjeto();
  assert.equal(p.ah(['open', nome, '--tickets', '1']).codigo, 0);
  const f = JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'frentes', `${nome}.json`), 'utf8'));
  fs.writeFileSync(path.join(f.worktree, 'a.txt'), 'a');
  p.git(['add', 'a.txt'], { cwd: f.worktree });
  p.git(['commit', '-m', 'feat: a'], { cwd: f.worktree });
  assert.equal(p.git(['merge', '--no-ff', `feat/${nome}`, '-m', 'merge']).codigo, 0);
  return p;
}

test('close sem rede deixa o comentário na fila; o próximo comando com rede envia', () => {
  const p = comFrente();
  const r = p.ah(['close'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /fila/);
  assert.match(r.erro, /próximo comando com rede/);
  const dir = dirDoTeste(p);
  // comentário de fechamento e a edição que tira responsável e rótulo (tarefa 5)
  assert.equal(contarPendentes(dir), 2);
  assert.equal(p.ah(['whoami']).codigo, 0);
  assert.equal(p.ah(['board']).codigo, 0);
  assert.equal(contarPendentes(dir), 2);
  assert.doesNotMatch(p.ghTicket(1).comments.at(-1).body, /fechada/);
  // O reenvio vem antes de tudo: mesmo um open recusado (nome curto demais) envia a fila.
  const o = p.ah(['open', 'x']);
  assert.match(o.erro, /Nome de frente inválido/);
  assert.equal(contarPendentes(dir), 0);
  assert.match(p.ghTicket(1).comments.at(-1).body, /fechada/);
  assert.deepEqual([p.ghTicket(1).assignees, p.ghTicket(1).labels], [[], []]);
  p.limpar();
});

// Desde a tarefa 5 o open com tickets e sem rede recusa (reserva); a fila é semeada à mão.
test('comentário na fila sai antes do fechamento do close', () => {
  const p = criarProjeto();
  const r = p.ah(['open', 'carrinho', '--tickets', '1']);
  assert.equal(r.codigo, 0, r.erro);
  enfileirar(dirDoTeste(p), { tipo: 'comentario', ticket: 1, corpo: 'Nota pendente.\n' });
  const f = JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'frentes', 'carrinho.json'), 'utf8'));
  fs.writeFileSync(path.join(f.worktree, 'a.txt'), 'a');
  p.git(['add', 'a.txt'], { cwd: f.worktree });
  p.git(['commit', '-m', 'feat: a'], { cwd: f.worktree });
  assert.equal(p.git(['merge', '--no-ff', 'feat/carrinho', '-m', 'merge']).codigo, 0);
  const c = p.ah(['close']);
  assert.equal(c.codigo, 0, c.erro);
  assert.deepEqual(p.ghTicket(1).comments.map(x => x.body.split('\n')[0]), [`Frente ${f.id} (carrinho) aberta por @ana-souza.`, 'Nota pendente.', `Frente ${f.id} (carrinho) fechada.`]);
  p.limpar();
});

test('falha do reenvio não vira recusa do open', () => {
  const p = criarProjeto();
  const dir = dirDoTeste(p);
  fs.mkdirSync(dir, { recursive: true });
  // Arquivo da fila no lugar errado: uma pasta. O reenvio falha; o open segue.
  fs.mkdirSync(path.join(dir, 'pendentes.jsonl'));
  const r = p.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /Aviso: não consegui reenviar/);
  p.limpar();
});

const TRANCADO = 'GraphQL: Unable to create comment because issue is locked (addComment)';

test('erro em que o GitHub respondeu segura só o ticket dele, conta tentativas e avisa o que ficou', async () => {
  const { p, dir, o } = preparar();
  p.ghResponder([{ prefixo: ['issue', 'comment', '1'], codigo: 1, erro: `${TRANCADO}\n` }]);
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'a' });
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'b' });
  enfileirar(dir, { tipo: 'comentario', ticket: 2, corpo: 'c' });
  const avisos = [];
  const r = await reenviarComAviso(dir, o, t => avisos.push(t));
  assert.deepEqual(r, { enviados: 1, restam: 2, descartados: 0 });
  assert.equal(p.ghTicket(2).comments[0].body, 'c');
  // O segundo do ticket 1 nem foi tentado: a ordem do ticket fica.
  assert.equal(p.ghChamadas().filter(c => c.argv[1] === 'comment' && c.argv[2] === '1').length, 1);
  assert.deepEqual(lerFila(dir).map(l => [l.corpo, l.tentativas]), [['a', 1], ['b', undefined]]);
  assert.match(lerFila(dir)[0].ultimoErro, /locked/);
  const texto = avisos.join('');
  assert.match(texto, /2 operações pendentes para o GitHub; a primeira falha com: GraphQL: Unable to create comment because issue is locked/);
  assert.match(texto, /Próximo passo: /);
  p.limpar();
});

test(`depois de ${MAX_TENTATIVAS} falhas com resposta do GitHub a operação é estacionada nos descartados, com aviso`, async () => {
  const { p, dir, o } = preparar();
  p.ghResponder([{ prefixo: ['issue', 'comment', '1'], codigo: 1, erro: `${TRANCADO}\n` }]);
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'a' });
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'b' });
  for (let i = 1; i < MAX_TENTATIVAS; i++) {
    assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 0, restam: 2, descartados: 0 });
  }
  const avisos = [];
  assert.deepEqual(await reenviarComAviso(dir, o, t => avisos.push(t)), { enviados: 0, restam: 1, descartados: 1 });
  assert.match(avisos.join(''), new RegExp(`desisti de reenviar um comentário do ticket #1 depois de ${MAX_TENTATIVAS} falhas`));
  const desc = JSON.parse(fs.readFileSync(path.join(dir, 'pendentes-descartados.jsonl'), 'utf8').trim());
  assert.equal(desc.corpo, 'a');
  assert.equal(desc.tentativas, MAX_TENTATIVAS);
  assert.match(desc.erro, /locked/);
  // Com o ticket destrancado, a fila anda.
  p.ghResponder([]);
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 1, restam: 0, descartados: 0 });
  assert.equal(p.ghTicket(1).comments[0].body, 'b');
  p.limpar();
});

test('falta de rede não conta tentativa', async () => {
  const { p, dir, fora } = preparar();
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'a' });
  for (let i = 0; i < MAX_TENTATIVAS + 1; i++) await reenviarPendentes(dir, fora);
  assert.equal(contarPendentes(dir), 1);
  assert.equal(lerFila(dir)[0].tentativas, undefined);
  const avisos = [];
  await reenviarComAviso(dir, fora, t => avisos.push(t));
  assert.match(avisos.join(''), /1 operação pendente para o GitHub; a primeira falha com: sem rede/);
  p.limpar();
});

test('a trava do reenvio é renovada a cada item e vence em 1 min sem renovação', async () => {
  const { p, dir, o } = preparar();
  const dono = path.join(dir, 'travas', 'pendentes-reenvio', 'dono.json');
  // Trava de um ah morto há 2 min: vencida, o reenvio a toma.
  fs.mkdirSync(path.dirname(dono), { recursive: true });
  fs.writeFileSync(dono, JSON.stringify({ pid: 1, em: new Date(Date.now() - 120000).toISOString(), marca: 'morta' }));
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'a' });
  enfileirar(dir, { tipo: 'comentario', ticket: 2, corpo: 'b' });
  p.env.GH_FALSO_ESPIA = dono;
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 2, restam: 0, descartados: 0 });
  const vistos = p.ghChamadas().filter(c => c.argv[1] === 'comment').map(c => JSON.parse(c.espia));
  assert.equal(vistos.length, 2);
  assert.notEqual(vistos[0].marca, 'morta');
  assert.ok(Date.parse(vistos[1].em) > Date.parse(vistos[0].em), 'o em do dono.json foi renovado entre os itens');
  p.limpar();
});

test('com a trava da fila presa, comentar e editar não lançam: avisam que nada foi guardado', () => {
  const { p, dir, fora } = preparar();
  const trava = path.join(dir, 'travas', 'pendentes');
  fs.mkdirSync(trava, { recursive: true });
  fs.writeFileSync(path.join(trava, 'dono.json'), JSON.stringify({ pid: 1, em: new Date().toISOString(), marca: 'outra' }));
  const avisos = [];
  assert.equal(comentarOuEnfileirar(dir, 1, 'a', { ...fora, avisar: t => avisos.push(t) }), 'perdido');
  assert.match(avisos.join(''), /comentário no ticket #1 não foi enviada nem guardada na fila .*Faça à mão: gh issue comment 1/);
  assert.equal(contarPendentes(dir), 0);
  assert.ok(eventos(p).some(e => e.tipo === 'comentario-falhou' && e.ticket === 1 && e.guardada === false));
  fs.rmSync(trava, { recursive: true });
  // Arquivo da fila inacessível (uma pasta no lugar): a edição também só avisa.
  fs.mkdirSync(path.join(dir, 'pendentes.jsonl'));
  const avisos2 = [];
  assert.equal(editarOuEnfileirar(dir, 2, ['--add-label', 'x'], { ...fora, avisar: t => avisos2.push(t) }), 'perdido');
  assert.match(avisos2.join(''), /edição no ticket #2 não foi enviada nem guardada.*gh issue edit 2 --add-label x/);
  p.limpar();
});

test('o reenvio do começo do comando usa prazo curto por chamada do gh', async (t) => {
  const { p, dir } = preparar();
  t.after(() => p.limpar());
  const lento = path.join(path.dirname(p.raiz), 'gh-lento.mjs');
  fs.writeFileSync(lento, 'setTimeout(() => process.exit(0), 30000);\n');
  enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'a' });
  const inicio = Date.now();
  const avisos = [];
  const r = await reenviarComAviso(dir, { cwd: p.raiz, env: { ...p.env, AH_GH: lento } }, x => avisos.push(x));
  const demorou = Date.now() - inicio;
  assert.ok(demorou < 10000, `demorou ${demorou} ms`);
  assert.deepEqual(r, { enviados: 0, restam: 1, descartados: 0 });
  assert.equal(lerFila(dir)[0].tentativas, undefined);
  assert.match(avisos.join(''), /1 operação pendente/);
});
