// Extração dos literais de alto sinal de um artigo da wiki (nucleo/extensoes/wiki/evidencia.mjs), sem disco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatos, contem, linksDeFontes, normalizar, arquivado, lerArtigo } from '../nucleo/extensoes/wiki/evidencia.mjs';

const pares = cs => cs.map(c => [c.tipo, c.valor]);

test('literais no formato brasileiro e ISO viram candidatos', () => {
  const t = '# Frete\n\n> Fontes: [ADR](../../adr/0001.md)\n> Atualizado: 2026-11-20\n\nFrete grátis acima de R$ 1.234,56 ou 2,5%, desde 01/12/2026, dito aos 0:12:40 e em 2026-11-18.\n';
  assert.deepEqual(pares(candidatos(t)), [
    ['data', '2026-11-18'], ['data', '01/12/2026'], ['hora', '0:12:40'], ['número', '1.234,56'], ['número', '2,5%'],
  ]);
});

test('inteiros pequenos, metadados do cabeçalho e blocos de status ficam de fora', () => {
  const t = '# A\n\n> Fontes: [x](x.md)\n> Atualizado: 2026-11-20\n\nSão 42 pedidos e 500 itens.\n\n> **Status: Superado** (2026-11-21)\n> Valia 9.999 antes.\n';
  assert.deepEqual(candidatos(t), []);
});

test('citação de 15 ou mais caracteres, entre aspas retas, curvas ou em blockquote do corpo', () => {
  const t = '# A\n\n> Fontes: [x](x.md)\n\nA Carla disse "frete grátis só para o Sul" e “curto”.\n\n> O cliente decide o prazo de entrega.\n';
  assert.deepEqual(candidatos(t).filter(c => c.tipo === 'citação').map(c => c.valor), ['frete grátis só para o Sul', 'O cliente decide o prazo de entrega']);
});

test('nada dentro de cerca de código vira candidato', () => {
  const t = '# A\n\n> Fontes: [x](x.md)\n\n```\nversão 2026-01-01, 3.500 linhas\n```\n\n~~~\n"uma citação bem comprida aqui"\n~~~\n';
  assert.deepEqual(candidatos(t), []);
});

test('uma cerca logo depois do título encerra o cabeçalho', () => {
  const a = lerArtigo('# A\n```\n> Fontes: [x](x.md)\n```\n> Fontes: [y](y.md)\n');
  assert.deepEqual(a.cabecalho, []);
  assert.deepEqual(linksDeFontes('# A\n```\n> Fontes: [x](x.md)\n```\n'), []);
});

test('Fontes só vale no cabeçalho; âncora sai do alvo', () => {
  assert.deepEqual(linksDeFontes('# A\n\n> Fontes: [ADR 1](../../adr/0001.md#contexto); [reunião](../../reunioes/r.md)\n'), ['../../adr/0001.md', '../../reunioes/r.md']);
  assert.deepEqual(linksDeFontes('# A\n\nCorpo.\n\n> Fontes: [x](x.md)\n'), []);
});

test('arquivado lê só o cabeçalho', () => {
  assert.equal(arquivado('# A\n\n> Fontes: [x](x.md)\n> Arquivado: 2026-11-20\n\nTexto.\n'), true);
  assert.equal(arquivado('# A\n\n> Fontes: [x](x.md)\n\n> Arquivado: 2026-11-20\n'), false);
});

test('contem: o valor inteiro, sem casar como pedaço de outro', () => {
  const f = normalizar('Fala em 01:58:24. Mês 2026-09-24. Valor 12,5 e 3.140.');
  assert.equal(contem(f, { tipo: 'hora', valor: '58:24' }), false);
  assert.equal(contem(f, { tipo: 'hora', valor: '01:58:24' }), true);
  assert.equal(contem(f, { tipo: 'data', valor: '2026-09' }), false);
  assert.equal(contem(f, { tipo: 'data', valor: '2026-09-24' }), true);
  assert.equal(contem(f, { tipo: 'número', valor: '2,5' }), false);
  assert.equal(contem(f, { tipo: 'número', valor: '3.140' }), true);
  assert.equal(contem(normalizar('ele disse  "frete grátis\nsó para o Sul"'), { tipo: 'citação', valor: 'frete grátis só para o Sul' }), true);
});
