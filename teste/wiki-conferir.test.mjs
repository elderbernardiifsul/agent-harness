// ah wiki conferir, ah wiki fontes e o item do doctor (extensão wiki), em projetos descartáveis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, gravar } from './apoio/repo.mjs';

// Projeto com a extensão wiki ligada (`config`: true ou a seção dela), commitado.
function projeto(t, config = true) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const arquivo = path.join(p.raiz, '.harness', 'config.json');
  const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  c.extensoes = { wiki: config };
  fs.writeFileSync(arquivo, JSON.stringify(c, null, 2));
  commitar(p, 'liga wiki');
  return p;
}
function commitar(p, msg) {
  for (const args of [['add', '-A'], ['commit', '-q', '-m', msg]]) assert.equal(p.git(args).codigo, 0);
}
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };
const json = r => JSON.parse(ok(r).saida);

const ADR = 'docs/adr/0001-frete.md';
const ARTIGO = 'docs/wiki/frete/gratis.md';
const artigo = (corpo, fontes = '[ADR 0001, 2026-11-20](../../adr/0001-frete.md)') => `# Frete grátis\n\n> Fontes: ${fontes}\n> Atualizado: 2026-11-20\n\n${corpo}\n`;
function comWiki(p) {
  gravar(p, 'docs/wiki/index.md', '# Índice da wiki\n');
  gravar(p, 'docs/wiki/log.md', '# Log da wiki\n');
}

test('literal presente passa; literal ausente vira suspeito', t => {
  const p = projeto(t);
  comWiki(p);
  gravar(p, ADR, 'Frete grátis acima de R$ 200,00 a partir de 01/12/2026.\n');
  gravar(p, ARTIGO, artigo('Frete grátis acima de R$ 200,00 desde 01/12/2026, e R$ 250,00 no Norte.'));
  const r = json(p.ah(['wiki', 'conferir', '--json']));
  assert.deepEqual(r.suspeitos, [{ artigo: ARTIGO, valores: ['250,00'] }]);
  assert.deepEqual(r.erros, []);
  assert.equal(r.artigos, 1);
  const texto = ok(p.ah(['wiki', 'conferir'])).saida;
  assert.match(texto, /^# Conferência de evidência\n\n## Suspeitos de fidelidade\n\ndocs\/wiki\/frete\/gratis\.md\n- 250,00\n/);
  assert.match(texto, /\n## Resumo\n1 suspeito\(s\) de fidelidade, 0 erro\(s\) de evidência, 1 de 1 arquivo\(s\)-fonte citados\n$/);
});

test('fonte que mudou depois do artigo: o literal que sumiu vira suspeito', t => {
  const p = projeto(t);
  comWiki(p);
  gravar(p, ADR, 'Frete grátis acima de R$ 200,00 a partir de 01/12/2026.\n');
  gravar(p, ARTIGO, artigo('Frete grátis acima de R$ 200,00 desde 01/12/2026.'));
  assert.deepEqual(json(p.ah(['wiki', 'conferir', '--json'])).suspeitos, []);
  commitar(p, 'wiki');
  gravar(p, ADR, 'Frete grátis acima de R$ 150,00 a partir de 01/12/2026.\n');
  assert.deepEqual(json(p.ah(['wiki', 'conferir', '--json'])).suspeitos, [{ artigo: ARTIGO, valores: ['200,00'] }]);
});

test('erros de evidência: sem Fontes, fora das fontes, não resolve, não é texto, fora da raiz', t => {
  const p = projeto(t);
  comWiki(p);
  gravar(p, 'docs/wiki/frete/outro.md', '# Outro\n\n> Atualizado: 2026-11-20\n\nTexto de 2026.\n');
  gravar(p, 'docs/agents/x.md', 'x');
  gravar(p, 'docs/adr/fig.png', 'x');
  gravar(p, ARTIGO, artigo('Texto.', '[wiki](outro.md); [agentes](../../agents/x.md); [sumiu](../../adr/nao-existe.md); [figura](../../adr/fig.png); [fora](../../../../fora.md)'));
  const r = json(p.ah(['wiki', 'conferir', '--json']));
  assert.deepEqual(r.erros, [
    { artigo: ARTIGO, erros: ['link fora das fontes: outro.md', 'link fora das fontes: ../../agents/x.md', 'link que não resolve: ../../adr/nao-existe.md', 'fonte que não é texto conferível: ../../adr/fig.png', 'link fora das fontes: ../../../../fora.md'] },
    { artigo: 'docs/wiki/frete/outro.md', erros: ['artigo sem campo Fontes'] },
  ]);
});

test('âncora e espaço codificado no link de Fontes; página arquivada não é conferida', t => {
  const p = projeto(t);
  comWiki(p);
  gravar(p, 'docs/reunioes/2026-11-20-frete/ata da reunião.md', 'Decidido: frete de R$ 15,90 para o Norte.\n');
  gravar(p, ARTIGO, artigo('Frete de R$ 15,90 para o Norte.', '[reunião de 20/11](../../reunioes/2026-11-20-frete/ata%20da%20reuni%C3%A3o.md#decisoes)'));
  gravar(p, 'docs/wiki/frete/resposta.md', '# Resposta\n\n> Fontes: [a](gratis.md)\n> Arquivado: 2026-11-21\n\nValia R$ 99,99.\n');
  const r = json(p.ah(['wiki', 'conferir', '--json']));
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.suspeitos, []);
});

test('cobertura conta sem material do log; --pendentes lista as não citadas', t => {
  const p = projeto(t);
  comWiki(p);
  gravar(p, 'docs/adr/0001.md', 'Valor 1.500.\n');
  gravar(p, 'docs/adr/0002.md', 'x\n');
  gravar(p, 'CONTEXT.md', '# Glossário\n');
  gravar(p, 'docs/wiki/log.md', '# Log da wiki\n\n## [2026-11-20] ingestão | sem material: `docs/adr/0002.md`.\n- Disposição: Sem material\n');
  gravar(p, ARTIGO, artigo('Valor 1.500.', '[ADR 1](../../adr/0001.md)'));
  const texto = ok(p.ah(['wiki', 'conferir', '--pendentes'])).saida;
  assert.match(texto, /^\| CONTEXT\.md \| 0 \| 1 \|$/m);
  assert.match(texto, /^\| docs\/adr \| 2 \| 2 \|$/m);
  assert.match(texto, /## Fontes ainda não citadas\n- CONTEXT\.md\n/);
  assert.deepEqual(json(p.ah(['wiki', 'conferir', '--json'])).pendentes, ['CONTEXT.md']);
});

test('conferir só os artigos dados; índice e log recusam', t => {
  const p = projeto(t);
  comWiki(p);
  gravar(p, ADR, 'nada\n');
  gravar(p, ARTIGO, artigo('Valor 1.234,00.'));
  gravar(p, 'docs/wiki/frete/b.md', artigo('Valor 9.876,00.'));
  assert.deepEqual(json(p.ah(['wiki', 'conferir', '--json', 'docs/wiki/frete/b.md'])).suspeitos, [{ artigo: 'docs/wiki/frete/b.md', valores: ['9.876,00'] }]);
  const r = p.ah(['wiki', 'conferir', 'docs/wiki/log.md']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: docs\/wiki\/log\.md não é artigo da wiki \(fica fora de docs\/wiki, ou é index\.md ou log\.md\)\.\nFaça: passe caminhos de artigos/);
});

test('no worktree da frente, confere a wiki do worktree', t => {
  const p = projeto(t);
  comWiki(p);
  gravar(p, ADR, 'Frete acima de R$ 200,00.\n');
  commitar(p, 'wiki');
  ok(p.ah(['open', 'frete']));
  const wt = JSON.parse(fs.readFileSync(path.join(p.estado, 'loja', 'frentes', 'frete.json'), 'utf8')).worktree;
  fs.mkdirSync(path.join(wt, 'docs', 'wiki', 'frete'), { recursive: true });
  fs.writeFileSync(path.join(wt, ARTIGO), artigo('Frete acima de R$ 300,00.'));
  assert.deepEqual(json(p.ah(['wiki', 'conferir', '--json'], { cwd: wt })).suspeitos, [{ artigo: ARTIGO, valores: ['300,00'] }]);
  assert.deepEqual(json(p.ah(['wiki', 'conferir', '--json'])).suspeitos, []);
});

test('sem wiki: recusa com o próximo passo; doctor fica ok', t => {
  const p = projeto(t);
  const r = p.ah(['wiki', 'conferir']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: Não achei a wiki em docs\/wiki \(.+\)\.\nFaça: faça a primeira ingestão com a skill wiki-ingerir, que cria docs\/wiki\/index\.md e log\.md/);
  assert.match(p.ah(['doctor']).saida, /^ok\s+Evidência da wiki \(wiki\)$/m);
});

test('doctor avisa quando há suspeitos', t => {
  const p = projeto(t);
  comWiki(p);
  gravar(p, ADR, 'R$ 200,00\n');
  gravar(p, ARTIGO, artigo('R$ 250,00.'));
  assert.match(p.ah(['doctor']).saida, /^aviso\s+Evidência da wiki \(wiki\): 1 suspeito\(s\) de fidelidade e 0 erro\(s\) de evidência; rode tools\/ah wiki conferir e julgue cada um com a skill wiki-conferir$/m);
});

test('ah wiki fontes lista pela configuração; configuração errada não carrega', t => {
  const p = projeto(t, { foraDasFontes: ['docs/agents/**', 'docs/rascunhos/**'] });
  gravar(p, 'docs/rascunhos/a.md', 'x');
  gravar(p, ADR, 'x');
  gravar(p, 'GLOSSARY.md', 'x');
  comWiki(p);
  assert.equal(ok(p.ah(['wiki', 'fontes'])).saida, `GLOSSARY.md\n${ADR}\n`);
  assert.deepEqual(json(p.ah(['wiki', 'fontes', '--json'])), { fontes: ['GLOSSARY.md', ADR] });
  const sub = p.ah(['wiki', 'listar']);
  assert.equal(sub.codigo, 1);
  assert.match(sub.erro, /^Recusado: Subcomando desconhecido: listar\nFaça: use ah wiki conferir/);

  const q = projeto(t, { fonte: [] });
  assert.match(q.ah(['doctor']).saida, /^FALHOU\s+Extensão wiki: .*campo desconhecido: fonte/m);
});
