// Extensão migracao: renumerar a migração da frente depois de reintegrar a base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projetoDeTeste } from '../nucleo/lib/extensoes-teste.mjs';
import { planoDeRenumeracao } from '../nucleo/extensoes/migracao/numeros.mjs';

const FERRAMENTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migracao-ferramenta-falsa.mjs');
const PASTA = 'db/migracoes';
const B = { env: { AH_SESSAO: 'sessao-b-0002' } };
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };

function commitar(p, cwd, arquivos, outros = {}) {
  fs.mkdirSync(path.join(cwd, PASTA), { recursive: true });
  for (const a of arquivos) fs.writeFileSync(path.join(cwd, PASTA, a), `-- ${a}\n`);
  for (const [a, texto] of Object.entries(outros)) {
    fs.mkdirSync(path.dirname(path.join(cwd, a)), { recursive: true });
    fs.writeFileSync(path.join(cwd, a), texto);
  }
  assert.equal(p.git(['add', '-A'], { cwd }).codigo, 0);
  assert.equal(p.git(['commit', '-q', '-m', `commit ${arquivos.join(' ')}`], { cwd }).codigo, 0);
}
function novoProjeto(t, config = {}) {
  const p = projetoDeTeste({ extensoes: { migracao: { pasta: PASTA, ...config } } });
  t.after(() => p.limpar());
  commitar(p, p.raiz, ['0001_base.sql', '0002_cupom.sql']);
  return p;
}
const wt = (p, nome) => p.frente(nome).worktree;

// As frentes um (sessão padrão) e dois (sessão B) reservam 3 e 4; dois entra na dev primeiro e fecha;
// um reintegra a dev. Devolve o worktree de um.
function doisEntraPrimeiro(p, outrosDeUm = {}) {
  ok(p.ah(['open', 'um']));
  ok(p.ah(['migracao', 'reservar']));
  ok(p.ah(['open', 'dois'], B));
  ok(p.ah(['migracao', 'reservar'], B));
  commitar(p, wt(p, 'dois'), ['0004_dois.sql']);
  commitar(p, wt(p, 'um'), ['0003_um.sql'], outrosDeUm);
  assert.equal(p.git(['merge', '--no-ff', '-q', '-m', 'merge dois', 'feat/dois']).codigo, 0);
  ok(p.ah(['close'], B));
  const w = wt(p, 'um');
  assert.equal(p.git(['merge', 'dev', '--no-edit', '-q'], { cwd: w }).codigo, 0);
  return w;
}

test('planoDeRenumeracao: em dia, uma atrás, duas em sequência', () => {
  const padrao = /^(\d+)_/;
  assert.deepEqual(planoDeRenumeracao(['0003_frete.sql'], 2, padrao, 4), []);
  assert.deepEqual(planoDeRenumeracao(['0003_frete.sql'], 4, padrao, 4), [{ de: '0003_frete.sql', para: '0005_frete.sql' }]);
  assert.deepEqual(planoDeRenumeracao(['0003_a.sql', '0004_b.sql'], 3, padrao, 4), [
    { de: '0003_a.sql', para: '0004_a.sql' }, { de: '0004_b.sql', para: '0005_b.sql' }]);
  assert.deepEqual(planoDeRenumeracao(['V3__a.sql'], 4, /^V(\d+)__/, 1), [{ de: 'V3__a.sql', para: 'V5__a.sql' }]);
});

test('renumera depois da reintegração, deixa em stage e aponta quem cita o nome antigo', t => {
  const p = novoProjeto(t);
  const w = doisEntraPrimeiro(p, { 'docs/notas.md': 'aplicar 0003_um.sql antes do deploy\n' });
  const r = ok(p.ah(['migracao', 'renumerar']));
  assert.ok(fs.existsSync(path.join(w, PASTA, '0005_um.sql')));
  assert.ok(!fs.existsSync(path.join(w, PASTA, '0003_um.sql')));
  assert.match(p.git(['status', '--porcelain'], { cwd: w }).saida, /^R {2}db\/migracoes\/0003_um\.sql -> db\/migracoes\/0005_um\.sql$/m);
  assert.equal(p.frente('um').extensoes.migracao.numero, 5);
  assert.match(r.saida, /0003_um\.sql → 0005_um\.sql/);
  assert.match(r.saida, /Citam o nome antigo: docs\/notas\.md/);
  assert.match(r.saida, /Falta: git commit no worktree\.\n$/);
});

test('já em dia não mexe em nada', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  commitar(p, wt(p, 'um'), ['0003_x.sql']);
  assert.match(ok(p.ah(['migracao', 'renumerar'])).saida, /já está em dia: segue a 0002 da dev/);
  assert.equal(p.git(['status', '--porcelain'], { cwd: wt(p, 'um') }).saida, '');
  assert.equal(p.frente('um').extensoes.migracao.numero, 3);
});

test('frente sem migração própria: nada a renumerar', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  assert.match(ok(p.ah(['migracao', 'renumerar'])).saida, /não tem migração fora da dev/);
});

test('sem a base mesclada recusa com o merge como próximo passo', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  commitar(p, wt(p, 'um'), ['0003_um.sql']);
  commitar(p, p.raiz, ['0003_outra.sql']);
  const r = p.ah(['migracao', 'renumerar']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: .*git merge dev --no-edit/);
});

test('merge parado em conflito recusa', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  commitar(p, wt(p, 'um'), ['0003_um.sql'], { 'README.md': 'da frente\n' });
  commitar(p, p.raiz, ['0003_outra.sql'], { 'README.md': 'da dev\n' });
  assert.notEqual(p.git(['merge', 'dev', '--no-edit', '-q'], { cwd: wt(p, 'um') }).codigo, 0);
  const r = p.ah(['migracao', 'renumerar']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /merge em curso/);
});

test('o passo da ferramenta roda por arquivo renomeado; falha para e diz o que já foi feito', t => {
  const registro = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'migracao-')), 'registro.txt');
  t.after(() => fs.rmSync(path.dirname(registro), { recursive: true, force: true }));
  const p = novoProjeto(t, { renumerar: ['node', FERRAMENTA, registro, '{de}', '{para}'] });
  doisEntraPrimeiro(p);
  ok(p.ah(['migracao', 'renumerar']));
  assert.equal(fs.readFileSync(registro, 'utf8'), '0003_um.sql -> 0005_um.sql\n');
});

test('ferramenta que falha: código 1, com o que já foi renomeado', t => {
  const p = novoProjeto(t, { renumerar: ['node', FERRAMENTA, '/dev/null', '{de}', '{para}'] });
  doisEntraPrimeiro(p);
  const r = p.ah(['migracao', 'renumerar'], { env: { MIGRACAO_FALSA_FALHA: '1' } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /o passo de renumerar da configuração falhou em 0003_um\.sql → 0005_um\.sql/);
  assert.match(r.erro, /já renomeados \(em stage\): 0003_um\.sql → 0005_um\.sql/);
});
