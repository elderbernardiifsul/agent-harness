// Extensão migracao: renumerar a migração da frente depois de reintegrar a base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projetoDeTeste } from '../nucleo/lib/extensoes-teste.mjs';
import { emDia, planoDeRenumeracao } from '../nucleo/extensoes/migracao/numeros.mjs';

const FERRAMENTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migracao-ferramenta-falsa.mjs');
const PASTA = 'db/migracoes';
const B = { env: { AH_SESSAO: 'sessao-b-0002' } };
const C = { env: { AH_SESSAO: 'sessao-c-0003' } };
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

test('planoDeRenumeracao parte do primeiro número novo; emDia confere base e reservas das outras', () => {
  const padrao = /^(\d+)_/;
  assert.deepEqual(planoDeRenumeracao(['0003_frete.sql'], 3, padrao, 4), []);
  assert.deepEqual(planoDeRenumeracao(['0003_frete.sql'], 5, padrao, 4), [{ de: '0003_frete.sql', para: '0005_frete.sql' }]);
  assert.deepEqual(planoDeRenumeracao(['0003_a.sql', '0004_b.sql'], 4, padrao, 4), [
    { de: '0003_a.sql', para: '0004_a.sql' }, { de: '0004_b.sql', para: '0005_b.sql' }]);
  assert.deepEqual(planoDeRenumeracao(['V3__a.sql'], 5, /^V(\d+)__/, 1), [{ de: 'V3__a.sql', para: 'V5__a.sql' }]);
  assert.equal(emDia([3], 2, []), true);
  assert.equal(emDia([4], 2, [3]), true, 'acima da base e fora das reservas das outras');
  assert.equal(emDia([3], 3, []), false, 'a base chegou nela');
  assert.equal(emDia([5], 4, [5]), false, 'outra frente reservou o mesmo número');
  assert.equal(emDia([3, 5], 2, []), false, 'fora de sequência');
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
  assert.match(r.erro, /git restore --source=HEAD --staged --worktree -- db\/migracoes/);
});

test('renumerar pula o número que outra frente viva reservou', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'tres'], C));
  const w = doisEntraPrimeiro(p);
  ok(p.ah(['migracao', 'reservar'], C));
  assert.equal(p.frente('tres').extensoes.migracao.numero, 5);
  ok(p.ah(['migracao', 'renumerar']));
  assert.ok(fs.existsSync(path.join(w, PASTA, '0006_um.sql')));
  assert.equal(p.frente('um').extensoes.migracao.numero, 6);
});

test('a frente acima da base e fora das outras reservas está em dia, mesmo com buraco', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'dois'], B));
  ok(p.ah(['migracao', 'reservar'], B));
  ok(p.ah(['open', 'um']));
  ok(p.ah(['migracao', 'reservar']));
  commitar(p, wt(p, 'um'), ['0004_um.sql']);
  assert.match(ok(p.ah(['migracao', 'renumerar'])).saida, /já está em dia/);
  assert.ok(fs.existsSync(path.join(wt(p, 'um'), PASTA, '0004_um.sql')));
});

test('frente com duas migrações: a reserva passa a ser a última, e a próxima reserva vem depois dela', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  ok(p.ah(['migracao', 'reservar']));
  commitar(p, wt(p, 'um'), ['0003_a.sql', '0004_b.sql']);
  ok(p.ah(['migracao', 'renumerar']));
  assert.equal(p.frente('um').extensoes.migracao.numero, 4);
  ok(p.ah(['open', 'tres'], C));
  ok(p.ah(['migracao', 'reservar'], C));
  assert.equal(p.frente('tres').extensoes.migracao.numero, 5);
});

test('migração ainda fora do git: recusa com o git add como próximo passo', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  ok(p.ah(['migracao', 'reservar']));
  fs.mkdirSync(path.join(wt(p, 'um'), PASTA), { recursive: true });
  fs.writeFileSync(path.join(wt(p, 'um'), PASTA, '0003_um.sql'), '-- um\n');
  commitar(p, p.raiz, ['0003_outra.sql']);
  assert.equal(p.git(['merge', 'dev', '--no-edit', '-q'], { cwd: wt(p, 'um') }).codigo, 0);
  const r = p.ah(['migracao', 'renumerar']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /a migração 0003_um\.sql ainda não está no git/);
  assert.match(r.erro, /Faça: git add -- db\/migracoes\/0003_um\.sql e rode ah migracao renumerar de novo/);
  assert.equal(p.frente('um').extensoes.migracao.numero, 3, 'a reserva não muda');
});

test('pares up/down com o mesmo número ficam juntos: no plano, no em dia e na reserva', t => {
  const padrao = /^(\d+)_/;
  assert.deepEqual(planoDeRenumeracao(['0002_f.down.sql', '0002_f.up.sql'], 3, padrao, 4), [
    { de: '0002_f.down.sql', para: '0003_f.down.sql' }, { de: '0002_f.up.sql', para: '0003_f.up.sql' }]);
  assert.deepEqual(planoDeRenumeracao(['0002_a.down.sql', '0002_a.up.sql', '0003_b.up.sql'], 2, padrao, 4), []);
  assert.deepEqual(planoDeRenumeracao(['0003_a.down.sql', '0003_a.up.sql', '0004_b.up.sql'], 5, padrao, 4).map(p => p.para),
    ['0005_a.down.sql', '0005_a.up.sql', '0006_b.up.sql']);
  assert.equal(emDia([3, 3], 2, []), true);
  assert.equal(emDia([3, 3, 4], 2, []), true);
  assert.equal(emDia([3, 3, 5], 2, []), false);

  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  ok(p.ah(['migracao', 'reservar']));
  commitar(p, wt(p, 'um'), ['0003_frete.down.sql', '0003_frete.up.sql']);
  assert.match(ok(p.ah(['migracao', 'renumerar'])).saida, /já está em dia/);
  assert.equal(p.frente('um').extensoes.migracao.numero, 3, 'o par ocupa um número só');
  commitar(p, p.raiz, ['0003_outra.sql']);
  assert.equal(p.git(['merge', 'dev', '--no-edit', '-q'], { cwd: wt(p, 'um') }).codigo, 0);
  ok(p.ah(['migracao', 'renumerar']));
  for (const a of ['0004_frete.down.sql', '0004_frete.up.sql']) assert.ok(fs.existsSync(path.join(wt(p, 'um'), PASTA, a)), a);
  assert.equal(p.frente('um').extensoes.migracao.numero, 4);
});
