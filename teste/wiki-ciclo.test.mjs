// A wiki no ciclo da sessão: a linha do resumo e a sugestão de ingestão no fechamento (extensão wiki).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarProjeto, gravar, amb as ambDoTeste } from './apoio/repo.mjs';
import { esquecerExtensoes } from '../nucleo/lib/extensoes.mjs';
import { carregarParaTeste, ctxFalso } from '../nucleo/lib/extensoes-teste.mjs';
import { tratar } from '../nucleo/adaptadores/contrato.mjs';

const EXTENSAO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'nucleo', 'extensoes', 'wiki', 'extensao.mjs');

function projeto(t) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const arquivo = path.join(p.raiz, '.harness', 'config.json');
  const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  c.extensoes = { wiki: true };
  fs.writeFileSync(arquivo, JSON.stringify(c, null, 2));
  commitar(p, 'liga wiki');
  return p;
}
function commitar(p, msg, cwd = p.raiz) {
  for (const args of [['add', '-A'], ['commit', '-q', '-m', msg]]) assert.equal(p.git(args, { cwd }).codigo, 0);
}
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };
const worktree = p => JSON.parse(fs.readFileSync(path.join(p.estado, 'loja', 'frentes', 'cupom.json'), 'utf8')).worktree;
const escreverEm = (raiz, rel, texto) => { fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true }); fs.writeFileSync(path.join(raiz, rel), texto); };

async function resumo(p) {
  esquecerExtensoes();
  const r = await tratar({ tipo: 'inicio', sessao: 's1', agente: 'claude-code', cwd: p.raiz, origem: 'novo' }, ambDoTeste(p));
  return r.contexto;
}

test('resumo: wiki vazia, sem log commitado, nada novo e fontes novas', async t => {
  const p = projeto(t);
  assert.match(await resumo(p), /^Wiki: ainda vazia; a primeira ingestão \(skill wiki-ingerir\) cria docs\/wiki\/\.$/m);

  gravar(p, 'docs/wiki/index.md', '# Índice da wiki\n');
  gravar(p, 'docs/wiki/log.md', '# Log da wiki\n\n## [2026-11-20] ingestão | Frete\n- Disposição: Novo\n- Fonte: docs/adr/0001.md\n');
  gravar(p, 'docs/wiki/frete/gratis.md', '# Frete\n\n> Fontes: [a](../../adr/0001.md)\n');
  assert.match(await resumo(p), /^Wiki: 1 artigo\(s\); nenhuma ingestão registrada no git ainda \(commite docs\/wiki\/log\.md\)\.$/m);

  commitar(p, 'wiki');
  assert.match(await resumo(p), /^Wiki: 1 artigo\(s\); nenhuma fonte nova desde a última ingestão\.$/m);

  gravar(p, 'docs/adr/0002-cupom.md', 'Cupom de 10%.\n');
  gravar(p, 'docs/agents/x.md', 'x\n');
  gravar(p, 'docs/adr/fig.png', 'x');
  commitar(p, 'adr do cupom');
  assert.match(await resumo(p), /^Wiki: 1 artigo\(s\); 1 fonte\(s\) nova\(s\) desde a última ingestão \(docs\/adr\/0002-cupom\.md\): skill wiki-ingerir\.$/m);

  // Conferência e consulta também escrevem no log, mas não são ingestão: o lembrete continua.
  fs.appendFileSync(path.join(p.raiz, 'docs/wiki/log.md'), '\n## [2026-11-27] lint | 1 problemas, 0 corrigidos\n\n## [2026-11-27] consulta | Arquivado: Frete\n');
  commitar(p, 'lint da wiki');
  assert.match(await resumo(p), /1 fonte\(s\) nova\(s\) desde a última ingestão \(docs\/adr\/0002-cupom\.md\)/);

  for (const n of ['3', '4', '5']) gravar(p, `docs/adr/000${n}.md`, 'x\n');
  commitar(p, 'mais adrs');
  assert.match(await resumo(p), /4 fonte\(s\) nova\(s\) desde a última ingestão \(docs\/adr\/0002-cupom\.md, docs\/adr\/0003\.md, docs\/adr\/0004\.md, …\)/);
});

test('close sugere a ingestão quando a frente trouxe fonte e não ingeriu', t => {
  const p = projeto(t);
  gravar(p, 'docs/wiki/log.md', '# Log da wiki\n\n## [2026-11-20] ingestão | sem material: docs/adr/0001.md\n- Disposição: Sem material\n');
  commitar(p, 'wiki');
  ok(p.ah(['open', 'cupom']));
  const wt = worktree(p);
  escreverEm(wt, 'docs/adr/0002-cupom.md', 'Cupom de 10%.\n');
  commitar(p, 'adr do cupom', wt);
  assert.equal(p.git(['merge', '--no-ff', 'feat/cupom', '-m', 'merge']).codigo, 0);
  const r = ok(p.ah(['close']));
  assert.match(r.saida, /^Wiki: a frente mudou fonte\(s\) sem ingestão \(docs\/adr\/0002-cupom\.md\)\. Sugestão: ingira com a skill wiki-ingerir antes de começar outra coisa\.$/m);
});

test('close não sugere quando a frente ingeriu o que trouxe', t => {
  const p = projeto(t);
  gravar(p, 'docs/wiki/log.md', '# Log da wiki\n\n## [2026-11-20] ingestão | sem material: docs/adr/0001.md\n- Disposição: Sem material\n');
  commitar(p, 'wiki');
  ok(p.ah(['open', 'cupom']));
  const wt = worktree(p);
  escreverEm(wt, 'docs/adr/0002-cupom.md', 'Cupom de 10%.\n');
  commitar(p, 'adr do cupom', wt);
  escreverEm(wt, 'docs/wiki/cupom/regras.md', '# Regras\n\n> Fontes: [ADR 2](../../adr/0002-cupom.md)\n\nCupom de 10%.\n');
  escreverEm(wt, 'docs/wiki/log.md', '# Log da wiki\n\n## [2026-11-27] ingestão | Regras do cupom\n- Disposição: Novo\n- Fonte: docs/adr/0002-cupom.md\n');
  commitar(p, 'ingere o cupom', wt);
  assert.equal(p.git(['merge', '--no-ff', 'feat/cupom', '-m', 'merge']).codigo, 0);
  const r = ok(p.ah(['close']));
  assert.doesNotMatch(r.saida, /^Wiki:/m);
});

test('a reação nunca recusa, nem com o git falhando', async () => {
  const def = await carregarParaTeste(EXTENSAO);
  const ctx = ctxFalso({ extensao: 'wiki', frente: { nome: 'cupom', ramo: 'feat/cupom' }, git: () => ({ codigo: 128, saida: '', erro: 'x' }) });
  assert.equal(await def.reacoes.antesDeFechar(ctx), null);
  assert.deepEqual(ctx.saida, []);
  const desfeita = ctxFalso({ extensao: 'wiki', frente: { nome: 'cupom', ramo: 'feat/cupom' }, aberturaDesfeita: true });
  assert.equal(await def.reacoes.antesDeFechar(desfeita), null);
  assert.deepEqual(desfeita.chamadas, []);
});
