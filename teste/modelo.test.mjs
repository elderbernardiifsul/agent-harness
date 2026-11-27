import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarProjeto, dirDoTeste } from './apoio/repo.mjs';
import { carregarParaTeste } from '../nucleo/lib/extensoes-teste.mjs';
import { registrarSessao } from '../nucleo/lib/sessao.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSAO = path.join(RAIZ, 'nucleo', 'extensoes', 'modelo', 'extensao.mjs');
const PADROES = JSON.parse(fs.readFileSync(path.join(RAIZ, 'nucleo', 'extensoes', 'modelo', 'padroes.json'), 'utf8'));
const NIVEIS = ['alto', 'medio', 'leve'];
const AGENTES = ['claude-code', 'codex', 'opencode'];
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };

// Projeto com a extensão modelo ligada (`config`: true ou a seção dela), commitado.
function projeto(t, config = true) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const arquivo = path.join(p.raiz, '.harness', 'config.json');
  const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  c.extensoes = { modelo: config };
  fs.writeFileSync(arquivo, JSON.stringify(c, null, 2));
  for (const args of [['add', '--', '.harness/config.json'], ['commit', '-q', '-m', 'liga modelo']]) assert.equal(p.git(args).codigo, 0);
  return p;
}
const linhaEsperada = (nivel, agente, { modelo, esforco }) => `${nivel} (${agente}): modelo ${modelo}, esforço ${esforco ?? 'padrão do agente'}`;

test('os padrões têm data, fontes e os três níveis para os três agentes', () => {
  assert.match(PADROES.data, /^\d{4}-\d{2}-\d{2}$/);
  for (const a of AGENTES) {
    assert.ok(PADROES.fontes[a].length > 0, a);
    assert.equal(typeof PADROES.agentes[a].uso, 'string');
    for (const n of NIVEIS) assert.equal(typeof PADROES.agentes[a][n].modelo, 'string', `${a} ${n}`);
  }
});

test('ah modelo <nível> --agente <nome> traduz pelo padrão, em texto e em JSON', t => {
  const p = projeto(t);
  for (const a of AGENTES) {
    for (const n of NIVEIS) {
      const r = ok(p.ah(['modelo', n, '--agente', a]));
      assert.equal(r.saida.split('\n')[0], linhaEsperada(n, a, PADROES.agentes[a][n]));
      assert.match(r.saida, new RegExp(`^Como usar: ${PADROES.agentes[a].uso.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    }
  }
  const j = JSON.parse(ok(p.ah(['modelo', 'leve', '--json'])).saida);
  assert.equal(j.nivel, 'leve');
  assert.equal(j.padroesDe, PADROES.data);
  assert.deepEqual(j.traducoes.map(x => [x.agente, x.nivel, x.modelo, x.esforco, x.origem]),
    AGENTES.map(a => [a, 'leve', PADROES.agentes[a].leve.modelo, PADROES.agentes[a].leve.esforco, 'padrao']));
  assert.equal(JSON.parse(ok(p.ah(['modelo', 'alto', '--agente', 'codex', '--json'])).saida).traducoes.length, 1);
});

test('ah modelo sem nível mostra a tabela e aponta os critérios', t => {
  const p = projeto(t);
  const r = ok(p.ah(['modelo']));
  for (const a of AGENTES) for (const n of NIVEIS) assert.ok(r.saida.includes(linhaEsperada(n, a, PADROES.agentes[a][n])), `${n} ${a}`);
  assert.match(r.saida, new RegExp(`padrões de ${PADROES.data}`));
  assert.match(r.saida, /^Critérios: docs\/agents\/metodo\.md \(nível de modelo\)\.$/m);
  const j = JSON.parse(ok(p.ah(['modelo', '--json'])).saida);
  assert.equal(j.padroesDe, PADROES.data);
  assert.equal(j.traducoes.length, 9);
});

test('a configuração do projeto muda campo a campo e pode acrescentar um agente', t => {
  const p = projeto(t, { agentes: { codex: { leve: { modelo: 'modelo-da-loja' } }, 'agente-da-loja': { alto: { modelo: 'grande', esforco: 'max' } } } });
  const j = JSON.parse(ok(p.ah(['modelo', 'leve', '--json'])).saida);
  const codex = j.traducoes.find(x => x.agente === 'codex');
  assert.deepEqual([codex.modelo, codex.esforco, codex.origem], ['modelo-da-loja', PADROES.agentes.codex.leve.esforco, 'projeto']);
  assert.equal(j.traducoes.find(x => x.agente === 'claude-code').origem, 'padrao');
  assert.equal(ok(p.ah(['modelo', 'alto', '--agente', 'agente-da-loja'])).saida.split('\n')[0], 'alto (agente-da-loja): modelo grande, esforço max');
  // Nível que o agente novo não traduz: aparece sem modelo, sem recusar.
  assert.equal(ok(p.ah(['modelo', 'leve', '--agente', 'agente-da-loja'])).saida.split('\n')[0], 'leve (agente-da-loja): sem tradução (acrescente em extensoes.modelo.agentes)');
  assert.equal(JSON.parse(ok(p.ah(['modelo', 'leve', '--agente', 'agente-da-loja', '--json'])).saida).traducoes[0].origem, null);
});

test('nível ou agente desconhecido é erro de uso, com o próximo passo', t => {
  const p = projeto(t);
  const r = p.ah(['modelo', 'altissimo']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: Nível desconhecido: altissimo\.\nFaça: use alto, medio ou leve \(tools\/ah modelo mostra a tabela\)\n$/);
  const a = p.ah(['modelo', 'alto', '--agente', 'cursor']);
  assert.equal(a.codigo, 1);
  assert.match(a.erro, /^Recusado: Agente desconhecido: cursor\.\nFaça: use claude-code, codex ou opencode, ou acrescente o agente em extensoes\.modelo\.agentes\n$/);
  assert.equal(p.ah(['modelo', 'alto', '--agente']).codigo, 1);
  assert.equal(p.ah(['modelo', 'alto', 'leve']).codigo, 1);
  assert.equal(p.ah(['modelo', '--x']).codigo, 1);
});

test('o comando roda sem sessão', t => {
  const p = projeto(t);
  ok(p.ah(['modelo'], { env: { AH_SESSAO: '' } }));
});

test('validarConfig recusa nível fora dos três e campo que não é texto', async () => {
  await carregarParaTeste(EXTENSAO, {});
  await carregarParaTeste(EXTENSAO, { agentes: { codex: { leve: { modelo: 'x', esforco: null } } } });
  await assert.rejects(carregarParaTeste(EXTENSAO, { agentes: { codex: { altissimo: { modelo: 'x' } } } }), /nível altissimo/);
  await assert.rejects(carregarParaTeste(EXTENSAO, { agentes: { codex: { leve: { modelo: 3 } } } }), /modelo deve ser um texto/);
  await assert.rejects(carregarParaTeste(EXTENSAO, { agentes: { codex: { leve: { cor: 'x' } } } }), /campo desconhecido/);
  await assert.rejects(carregarParaTeste(EXTENSAO, { agentes: [] }), /agentes deve ser um objeto/);
  await assert.rejects(carregarParaTeste(EXTENSAO, { outra: 1 }), /campo desconhecido/);
});

test('a coluna MODELO do quadro mostra o modelo da sessão dona', t => {
  const p = projeto(t);
  registrarSessao(dirDoTeste(p), { id: 'sessao-teste-0001', agente: 'claude-code', modelo: 'modelo-de-teste' });
  ok(p.ah(['open', 'carrinho']));
  ok(p.ah(['open', 'frete'], { env: { AH_SESSAO: 'sessao-b-0002' } }));
  const j = JSON.parse(ok(p.ah(['board', '--json'])).saida);
  const coluna = nome => j.frentes.find(f => f.nome === nome).colunas.modelo.MODELO;
  assert.equal(coluna('carrinho'), 'modelo-de-teste');
  assert.equal(coluna('frete'), '—');
  assert.match(ok(p.ah(['board'])).saida, /^ID .*MODELO$/m);
});
