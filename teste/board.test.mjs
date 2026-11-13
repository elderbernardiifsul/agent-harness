import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto } from './apoio/repo.mjs';

const arquivoDaFrente = (p, nome) => path.join(p.estado, 'loja', 'frentes', `${nome}.json`);
const lerFrenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(arquivoDaFrente(p, nome), 'utf8'));
const gravarFrenteDoTeste = (p, f) => fs.writeFileSync(arquivoDaFrente(p, f.nome), JSON.stringify(f));
const SEM_SESSAO = { env: { AH_SESSAO: '' } };

test('board lista a frente; vazio diz que não há', () => {
  const vazio = criarProjeto();
  assert.match(vazio.ah(['board']).saida, /Nenhuma frente aberta\./);
  assert.deepEqual(JSON.parse(vazio.ah(['board', '--json']).saida), { frentes: [], sessoes: [], sessoesIlegiveis: [], sobreposicoes: [], sobreposicaoIncompleta: false });
  vazio.limpar();

  const p = criarProjeto();
  assert.equal(p.ah(['open', 'carrinho', '--tickets', '1,2']).codigo, 0);
  const r = p.ah(['board']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /as-1\s+carrinho\s+sessao-t\s+ativa\s+#1,#2\s+—\s+—\s+—/);
  assert.match(r.saida, /^ID\s+NOME\s+DONA\s+ESTADO\s+TICKETS\s+SOBREPÕE\s+PLANO\s+ÚLTIMA NOTA/m);
  assert.equal(JSON.parse(p.ah(['board', '--json']).saida).frentes[0].id, 'as-1');
  p.limpar();
});

test('board funciona sem id de sessão', () => {
  const p = criarProjeto();
  p.ah(['open', 'carrinho']);
  const r = p.ah(['board'], SEM_SESSAO);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /as-1\s+carrinho/);
  p.limpar();
});

test('board ordena por abertaEm e mostra frente sem dona com traço', () => {
  const p = criarProjeto();
  p.ah(['open', 'zeta']);
  p.ah(['open', 'alfa'], { env: { AH_SESSAO: 'sessao-teste-0002' } });
  const zeta = lerFrenteDoTeste(p, 'zeta');
  zeta.abertaEm = '2026-11-12T10:00:00-03:00';
  zeta.dona = null;
  gravarFrenteDoTeste(p, zeta);
  const alfa = lerFrenteDoTeste(p, 'alfa');
  alfa.abertaEm = '2026-11-12T09:00:00-03:00';
  gravarFrenteDoTeste(p, alfa);
  const linhas = p.ah(['board']).saida.split('\n');
  assert.ok(linhas.findIndex(l => l.includes('alfa')) < linhas.findIndex(l => l.includes('zeta')));
  assert.match(linhas.find(l => l.includes('zeta')), /zeta\s+—\s+órfã/); // ativa sem dona viva é órfã (revisão da tarefa 3)
  assert.deepEqual(JSON.parse(p.ah(['board', '--json']).saida).frentes.map(f => f.nome), ['alfa', 'zeta']);
  p.limpar();
});

test('board corta textos longos e notas com quebra de linha não quebram a tabela', () => {
  const p = criarProjeto();
  p.ah(['open', 'carrinho']);
  const f = lerFrenteDoTeste(p, 'carrinho');
  f.plano = `docs/${'p'.repeat(100)}.md`;
  f.notas = [{ em: 'x', sessao: 's', texto: 'primeira' }, { em: 'y', sessao: 's', texto: `linha um\nlinha dois\r\n${'n'.repeat(200)}` }];
  gravarFrenteDoTeste(p, f);
  const linhas = p.ah(['board']).saida.split('\n').filter(Boolean);
  assert.equal(linhas.length, 3, 'cabeçalho, uma linha e a das sessões vivas');
  assert.match(linhas[2], /^Sessões vivas: /);
  assert.match(linhas[1], /linha um linha dois/);
  assert.doesNotMatch(linhas[1], /primeira/);
  assert.ok(linhas[1].length < 200, `linha longa demais: ${linhas[1].length}`);
  assert.match(linhas[1], /…/);
  p.limpar();
});

test('board recusa opção desconhecida e argumento a mais', () => {
  const p = criarProjeto();
  const r = p.ah(['board', '--tudo']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Opção desconhecida/);
  assert.equal(p.ah(['board', 'x']).codigo, 1);
  p.limpar();
});

// ---- revisão da tarefa 3: sessão ilegível não derruba o quadro
const arquivoDaSessao = (p, id) => path.join(p.estado, 'loja', 'sessoes', `${id}.json`);

test('board com a dona ilegível: (ilegível), órfã e a linha das sessões ilegíveis, em texto e em JSON', () => {
  const p = criarProjeto();
  p.ah(['open', 'carrinho']);
  fs.writeFileSync(arquivoDaSessao(p, 'sessao-teste-0001'), '{ quebrado');
  const r = p.ah(['board']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /as-1\s+carrinho\s+sessao-t \(ilegível\)\s+órfã/);
  assert.match(r.saida, /^Sessões ilegíveis: sessao-t \(rode ah doctor\)$/m);
  const j = p.ah(['board', '--json']);
  assert.equal(j.codigo, 0, j.erro);
  const d = JSON.parse(j.saida);
  assert.equal(d.frentes[0].donaViva, false);
  assert.equal(d.frentes[0].donaIlegivel, true);
  assert.deepEqual(d.sessoesIlegiveis, ['sessao-teste-0001']);
  p.limpar();
});

test('board com sessão ilegível que não é dona: o quadro segue e acusa a sessão', () => {
  const p = criarProjeto();
  p.ah(['open', 'carrinho']);
  fs.writeFileSync(arquivoDaSessao(p, 'sessao-c-0003'), '{ quebrado');
  const r = p.ah(['board']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /as-1\s+carrinho\s+sessao-t\s+ativa/);
  assert.match(r.saida, /Sessões vivas: sessao-t \(executor, carrinho\)/);
  assert.match(r.saida, /^Sessões ilegíveis: sessao-c \(rode ah doctor\)$/m);
  const d = JSON.parse(p.ah(['board', '--json']).saida);
  assert.equal(d.frentes[0].donaViva, true);
  assert.equal(d.frentes[0].donaIlegivel, false);
  assert.deepEqual(d.sessoesIlegiveis, ['sessao-c-0003']);
  assert.deepEqual(d.sessoes.map(s => s.id), ['sessao-teste-0001']);
  p.limpar();
});
