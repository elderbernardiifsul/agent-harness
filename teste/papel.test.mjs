import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, dirDoTeste, envelhecerSinal } from './apoio/repo.mjs';

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
  assert.match(r.erro, /carrinho/);
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
