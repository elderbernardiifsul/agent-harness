import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { amb, criarProjeto, dirDoTeste, envelhecerSinal } from './apoio/repo.mjs';
import { tratar } from '../nucleo/adaptadores/contrato.mjs';
import { resolverSessao } from '../nucleo/lib/sessao.mjs';

const eventos = p => fs.readFileSync(path.join(dirDoTeste(p), 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const lerSessaoDoTeste = (p, id) => JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'sessoes', `${id}.json`), 'utf8'));

test('papel mostra, troca e registra', () => {
  const p = criarProjeto();
  assert.match(p.ah(['papel']).saida, /Sessão sessao-t: executor\./);
  assert.equal(p.ah(['papel', 'orquestrador']).codigo, 0);
  assert.match(p.ah(['papel']).saida, /Sessão sessao-t: orquestrador\./);
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).papel, 'orquestrador');
  assert.ok(eventos(p).some(e => e.tipo === 'papel' && e.papel === 'orquestrador' && e.sessao === 'sessao-teste-0001'));
  p.limpar();
});

test('papel inválido recusa com a saída', () => {
  const p = criarProjeto();
  const r = p.ah(['papel', 'chefe']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: .*ah papel (orquestrador|executor)/);
  assert.equal(p.ah(['papel', 'executor', 'outro']).codigo, 1);
  p.limpar();
});

test('orquestrador abre duas frentes e não volta a executor com as duas', () => {
  const p = criarProjeto();
  p.ah(['papel', 'orquestrador']);
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  assert.equal(p.ah(['open', 'frete']).codigo, 0);
  assert.equal(lerSessaoDoTeste(p, 'sessao-teste-0001').frente, 'frete');
  const r = p.ah(['papel', 'executor']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: .*(handoff|close).*carrinho/);
  assert.equal(lerSessaoDoTeste(p, 'sessao-teste-0001').papel, 'orquestrador');
  p.limpar();
});

test('executor com uma frente não abre outra; a regra olha a dona, não o foco', () => {
  const p = criarProjeto();
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const r = p.ah(['open', 'frete']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: .*ah close carrinho/);
  // Foco apagado à mão: a frente continua da sessão, e a recusa continua.
  const arq = path.join(dirDoTeste(p), 'sessoes', 'sessao-teste-0001.json');
  const s = JSON.parse(fs.readFileSync(arq, 'utf8'));
  s.frente = null;
  fs.writeFileSync(arq, JSON.stringify(s));
  assert.equal(p.ah(['open', 'frete']).codigo, 1);
  p.limpar();
});

test('board mostra a dona morta, a frente órfã e as sessões vivas', () => {
  const p = criarProjeto();
  p.ah(['open', 'carrinho']);
  p.ah(['whoami'], { env: { AH_SESSAO: 'sessao-b-0002' } });
  envelhecerSinal(p, 'sessao-teste-0001', 500);
  const s = p.ah(['board']).saida;
  assert.match(s, /as-1\s+carrinho\s+sessao-t \(morta\)\s+órfã/);
  assert.match(s, /Sessões vivas: sessao-b \(executor, —\)/);
  const j = JSON.parse(p.ah(['board', '--json']).saida);
  assert.equal(j.frentes[0].donaViva, false);
  assert.deepEqual(j.sessoes, [{ id: 'sessao-b-0002', curto: 'sessao-b', papel: 'executor', frente: null }]);
  p.limpar();
});

test('board com a dona viva: ativa, sessão com a frente em foco e passada sem dona', () => {
  const p = criarProjeto();
  p.ah(['papel', 'orquestrador']);
  p.ah(['open', 'carrinho']);
  p.ah(['open', 'frete']);
  const arq = path.join(dirDoTeste(p), 'frentes', 'carrinho.json');
  const f = JSON.parse(fs.readFileSync(arq, 'utf8'));
  f.estado = 'passada';
  f.dona = null;
  fs.writeFileSync(arq, JSON.stringify(f));
  const s = p.ah(['board']).saida;
  assert.match(s, /carrinho\s+—\s+passada/);
  assert.match(s, /frete\s+sessao-t\s+ativa/);
  assert.match(s, /Sessões vivas: sessao-t \(orquestrador, frete\)/);
  const j = JSON.parse(p.ah(['board', '--json']).saida);
  assert.deepEqual(j.frentes.map(x => x.donaViva), [false, true]);
  assert.equal(j.sessoes[0].frente, 'frete');
  p.limpar();
});

test('board sem sessão viva diz nenhuma', () => {
  const p = criarProjeto();
  p.ah(['open', 'carrinho']);
  envelhecerSinal(p, 'sessao-teste-0001', 500);
  assert.match(p.ah(['board']).saida, /Sessões vivas: nenhuma/);
  p.limpar();
});

test('recusa de comando vai para os eventos', () => {
  const p = criarProjeto();
  p.ah(['open', 'Errado']);
  const e = eventos(p).find(x => x.tipo === 'recusa-de-comando');
  assert.ok(e);
  assert.equal(e.comando, 'open');
  assert.equal(e.sessao, 'sessao-teste-0001');
  assert.match(e.motivo, /Nome de frente inválido/);
  p.limpar();
});

// ---- open --para (o orquestrador abre em nome de outra sessão) ----

const lerFrenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'frentes', `${nome}.json`), 'utf8'));
const temFrente = (p, nome) => fs.existsSync(path.join(dirDoTeste(p), 'frentes', `${nome}.json`));
const B = { env: { AH_SESSAO: 'sessao-b-0002' } };

function comOrquestradorEB(t) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  p.ah(['whoami'], B);
  assert.equal(p.ah(['papel', 'orquestrador']).codigo, 0);
  return p;
}

test('orquestrador abre frente para outra sessão viva pelo id curto', t => {
  const p = comOrquestradorEB(t);
  const r = p.ah(['open', 'carrinho', '--para', 'sessao-b']);
  assert.equal(r.codigo, 0, r.erro);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.dona, f.atribuidaPor, f.estado], ['sessao-b-0002', 'sessao-teste-0001', 'ativa']);
  assert.equal(JSON.parse(p.ah(['whoami', '--json'], B).saida).frente, 'carrinho');
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, null);
  assert.ok(eventos(p).some(e => e.tipo === 'atribuicao' && e.sessao === 'sessao-teste-0001' && e.para === 'sessao-b-0002' && e.frente === 'carrinho'));
  // A dona é a sessão b: o orquestrador abre outra, e b, executora, não.
  assert.equal(p.ah(['open', 'frete']).codigo, 0);
  const rb = p.ah(['open', 'cupom'], B);
  assert.equal(rb.codigo, 1);
  assert.match(rb.erro, /Faça: .*ah close carrinho/);
});

test('--para recusa: executor, id desconhecido, id ambíguo, destino morto, destino executor com frente', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  p.ah(['whoami'], B);
  const recusou = (r, saida) => {
    assert.equal(r.codigo, 1, r.saida);
    assert.match(r.erro, /Faça: /);
    assert.match(r.erro, saida);
  };
  // Quem chama é executor.
  recusou(p.ah(['open', 'carrinho', '--para', 'sessao-b']), /Faça: .*ah papel orquestrador/);
  assert.equal(p.ah(['papel', 'orquestrador']).codigo, 0);
  // Id que não existe.
  recusou(p.ah(['open', 'carrinho', '--para', 'zzz']), /Faça: confira o id em tools\/ah board/);
  // Id ambíguo: lista os ids inteiros.
  p.ah(['whoami'], { env: { AH_SESSAO: 'sessao-b-0009' } });
  const ambiguo = p.ah(['open', 'carrinho', '--para', 'sessao-b']);
  recusou(ambiguo, /Faça: use mais letras do id/);
  assert.match(ambiguo.erro, /sessao-b-0002/);
  assert.match(ambiguo.erro, /sessao-b-0009/);
  // Destino morto.
  envelhecerSinal(p, 'sessao-b-0009', 500);
  recusou(p.ah(['open', 'carrinho', '--para', 'sessao-b-0009']), /Faça: confira as sessões vivas em tools\/ah board/);
  // Destino executor com frente.
  assert.equal(p.ah(['open', 'frete'], B).codigo, 0);
  recusou(p.ah(['open', 'carrinho', '--para', 'sessao-b-0002']), /Faça: escolha outra sessão ou peça a ela ah handoff/);
  assert.equal(temFrente(p, 'carrinho'), false);
  // Destino orquestrador com frente recebe outra.
  assert.equal(p.ah(['papel', 'orquestrador'], B).codigo, 0);
  const r = p.ah(['open', 'carrinho', '--para', 'sessao-b-0002']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, 'sessao-b-0002');
});

test('--para a própria sessão é o open comum', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const r = p.ah(['open', 'carrinho', '--para', 'sessao-t']);
  assert.equal(r.codigo, 0, r.erro);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.equal(f.dona, 'sessao-teste-0001');
  assert.equal(f.atribuidaPor, undefined);
  assert.ok(!eventos(p).some(e => e.tipo === 'atribuicao'));
});

test('--para com --tickets: comentário e marcador da sessão destino; a destino continua dona da reserva', t => {
  const p = comOrquestradorEB(t);
  const r = p.ah(['open', 'carrinho', '--tickets', '1', '--para', 'sessao-b']);
  assert.equal(r.codigo, 0, r.erro);
  const corpo = p.ghTicket(1).comments.at(-1).body;
  assert.match(corpo, /aberta por @ana-souza para a sessão sessao-b\./);
  assert.match(corpo, /<!-- ah:frente id=as-1 nome=carrinho .*login=ana-souza sessao=sessao-b /);
  assert.deepEqual(p.ghTicket(1).assignees, ['ana-souza']);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.dona, f.reserva], ['sessao-b-0002', { logins: ['ana-souza'], tickets: [1] }]);
  // A destino passa a frente pelo caminho de sempre, e o orquestrador a retoma para ela de novo.
  assert.equal(p.ah(['handoff'], B).codigo, 0, 'handoff da destino');
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  const r2 = p.ah(['open', 'carrinho', '--para', 'sessao-b']);
  assert.equal(r2.codigo, 0, r2.erro);
  assert.match(r2.saida, /Frente as-1 carrinho retomada\./);
});

test('orquestrador retoma frente passada para outra sessão: marcador e foco da destino', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  assert.equal(p.ah(['open', 'carrinho', '--tickets', '1']).codigo, 0);
  assert.equal(p.ah(['handoff']).codigo, 0);
  p.ah(['whoami'], B);
  assert.equal(p.ah(['papel', 'orquestrador']).codigo, 0);
  const r = p.ah(['open', 'carrinho', '--para', 'sessao-b']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho retomada\./);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.dona, f.atribuidaPor, f.estado], ['sessao-b-0002', 'sessao-teste-0001', 'ativa']);
  assert.match(p.ghTicket(1).comments.at(-1).body, /retomada por @ana-souza para a sessão sessao-b\.[\s\S]*<!-- ah:retomada id=as-1 .*sessao=sessao-b /);
  assert.equal(JSON.parse(p.ah(['whoami', '--json'], B).saida).frente, 'carrinho');
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, null);
  assert.ok(eventos(p).some(e => e.tipo === 'atribuicao' && e.para === 'sessao-b-0002' && e.frente === 'carrinho'));
  // A destino fecha a frente como dona.
  assert.equal(p.ah(['close', 'carrinho', '--resumo', 'feito'], B).codigo, 0);
});

test('--para retomada de passada também recusa destino executor com frente', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  assert.equal(p.ah(['handoff']).codigo, 0);
  p.ah(['whoami'], B);
  assert.equal(p.ah(['open', 'frete'], B).codigo, 0);
  assert.equal(p.ah(['papel', 'orquestrador']).codigo, 0);
  const r = p.ah(['open', 'carrinho', '--para', 'sessao-b']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: escolha outra sessão ou peça a ela ah handoff/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
});

test('a sessão destino vê a frente no resumo do próximo começo', async t => {
  const p = comOrquestradorEB(t);
  assert.equal(p.ah(['open', 'carrinho', '--para', 'sessao-b']).codigo, 0);
  const r = await tratar({ tipo: 'inicio', sessao: 'sessao-b-0002', agente: 'claude-code', cwd: p.raiz, origem: 'novo' }, amb(p));
  assert.match(r.contexto, /Sua frente: as-1 carrinho/);
});

test('resolverSessao: prefixo único, exato, desconhecido e ambíguo', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const dir = dirDoTeste(p);
  p.ah(['whoami']);
  p.ah(['whoami'], B);
  p.ah(['whoami'], { env: { AH_SESSAO: 'sessao-b-0009' } });
  assert.equal(resolverSessao(dir, 'sessao-b-0002').id, 'sessao-b-0002');
  assert.equal(resolverSessao(dir, 'sessao-t').id, 'sessao-teste-0001');
  assert.throws(() => resolverSessao(dir, 'sessao-b'), e => e.name === 'ErroDeUso' && /use mais letras do id/.test(e.saida) && /sessao-b-0009/.test(e.saida));
  assert.throws(() => resolverSessao(dir, 'nada'), e => e.name === 'ErroDeUso' && /confira o id em tools\/ah board/.test(e.saida));
});
