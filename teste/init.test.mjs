import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { criarRepo, criarProjeto } from './apoio/repo.mjs';
import { VERSAO } from '../nucleo/versao.mjs';
import { listarArquivosDoNucleo } from '../nucleo/comandos/init.mjs';

const ler = (p, rel) => fs.readFileSync(path.join(p.raiz, rel), 'utf8');
const gravar = (p, rel, texto) => fs.writeFileSync(path.join(p.raiz, rel), texto);

test('init cria a estrutura e não faz commit', () => {
  const p = criarRepo();
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.equal(r.codigo, 0, r.erro);
  for (const f of ['.harness/nucleo/bin/ah.mjs', '.harness/nucleo/MANIFEST.json', '.harness/config.json', '.harness/extensoes/.gitkeep',
    'tools/ah', 'tools/ah.cmd', 'docs/agents/sessoes-paralelas.md', 'docs/agents/historico-das-frentes.md']) {
    assert.ok(fs.existsSync(path.join(p.raiz, f)), f);
  }
  assert.equal(JSON.parse(ler(p, '.harness/config.json')).projeto, 'loja');
  const manifesto = JSON.parse(ler(p, '.harness/nucleo/MANIFEST.json'));
  assert.equal(manifesto.versao, VERSAO);
  assert.match(manifesto.commit, /^[0-9a-f]{40}$/);
  assert.ok(!Number.isNaN(Date.parse(manifesto.copiadoEm)));
  assert.match(r.saida, /Agora rode: tools\/ah doctor/);
  assert.equal(p.git(['log', '--oneline']).saida.trim().split('\n').length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p.estado, 'maquina.json'), 'utf8')), { sigla: 'as', login: 'ana-souza' });
  if (process.platform !== 'win32') assert.ok(fs.statSync(path.join(p.raiz, 'tools/ah')).mode & 0o100, 'tools/ah executável');
  assert.match(ler(p, 'tools/ah.cmd'), /\r\n/);
  assert.doesNotMatch(ler(p, 'tools/ah'), /\r/);
  assert.equal(fs.existsSync(path.join(p.raiz, '.harness/nucleo/teste')), false);
});

test('o projeto padrão é o nome da pasta em minúsculas e --teste vai para a configuração', () => {
  const p = criarRepo();
  const r = p.ah(['init', '--sigla', 'as', '--teste', 'node --test teste/']);
  assert.equal(r.codigo, 0, r.erro);
  const cfg = JSON.parse(ler(p, '.harness/config.json'));
  assert.equal(cfg.projeto, 'repo');
  assert.equal(cfg.ci.comandoDeTeste, 'node --test teste/');
});

test('init propõe a sigla pelo login quando não recebe', () => {
  const r = criarRepo().ah(['init', '--projeto', 'loja']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Sigla proposta: as\. Para trocar: ah init --sigla <outra>/);
});

test('init sem gh exige --sigla', () => {
  const p = criarRepo();
  const r = p.ah(['init', '--projeto', 'loja'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /--sigla/);
  assert.equal(fs.existsSync(path.join(p.raiz, '.harness')), false);
  const ok = p.ah(['init', '--projeto', 'loja', '--sigla', 'zz'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(ok.codigo, 0, ok.erro);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p.estado, 'maquina.json'), 'utf8')), { sigla: 'zz', login: 'local' });
});

test('init usa a sigla já gravada na máquina', () => {
  const p = criarRepo();
  p.ah(['init', '--projeto', 'loja', '--sigla', 'zz']);
  const r = p.ah(['init', '--projeto', 'loja', '--sobrescrever']);
  assert.doesNotMatch(r.saida, /Sigla proposta/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(p.estado, 'maquina.json'), 'utf8')).sigla, 'zz');
});

test('init cria dev e stage quando só existe main, sem trocar de ramo', () => {
  const p = criarRepo({ ramos: ['main'] });
  p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.match(p.git(['branch', '--list']).saida, /dev[\s\S]*stage|stage[\s\S]*dev/);
  assert.equal(p.git(['branch', '--show-current']).saida.trim(), 'main');
  assert.equal(p.git(['rev-parse', 'dev']).saida, p.git(['rev-parse', 'main']).saida);
});

test('init de novo não sobrescreve arquivo alterado nem a configuração', () => {
  const p = criarProjeto();
  fs.appendFileSync(path.join(p.raiz, 'docs/agents/sessoes-paralelas.md'), '\nminha nota');
  gravar(p, '.harness/config.json', ler(p, '.harness/config.json').replace('"loja"', '"loja2"'));
  const r = p.ah(['init']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Não sobrescrevi:[\s\S]*sessoes-paralelas\.md/);
  assert.match(ler(p, 'docs/agents/sessoes-paralelas.md'), /minha nota/);
  const r2 = p.ah(['init', '--sobrescrever']);
  assert.equal(r2.codigo, 0, r2.erro);
  assert.doesNotMatch(ler(p, 'docs/agents/sessoes-paralelas.md'), /minha nota/);
  assert.match(ler(p, '.harness/config.json'), /loja2/);
});

test('init de novo sobre uma instalação intacta sai com 0', () => {
  const p = criarProjeto();
  const r = p.ah(['init']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(p.git(['status', '--porcelain']).saida, '');
});

test('entrada hostil recusa com saída, sem criar nada', () => {
  const p = criarRepo();
  for (const args of [['--projeto', '../x'], ['--projeto', 'a/b'], ['--projeto', 'a\nb'], ['--projeto', 'a\\b'], ['--sigla', 'A1'], ['--sigla', 'a/b'],
    ['--bogus'], ['--agentes', 'outro'], ['--projeto'], ['extra']]) {
    const r = p.ah(['init', '--sigla', 'as', ...args]);
    assert.equal(r.codigo, 1, args.join(' '));
    assert.match(r.erro, /^Recusado: .+\nFaça: /, args.join(' '));
    assert.doesNotMatch(r.erro, /\bat .+\.mjs:\d+/);
  }
  assert.equal(fs.existsSync(path.join(p.raiz, '.harness')), false);
  assert.equal(fs.existsSync(path.join(p.raiz, 'tools')), false);
});

test('a cópia já instalada recusa rodar o init', () => {
  const p = criarProjeto();
  const r = spawnSync(process.execPath, [path.join(p.raiz, '.harness/nucleo/bin/ah.mjs'), 'init', '--sigla', 'as'], { cwd: p.raiz, env: p.env, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /rode o init a partir do clone do agent-harness/);
});

test('a cópia do núcleo ignora links, node_modules e testes', { skip: process.platform === 'win32' }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-nucleo-'));
  try {
    const fora = path.join(base, 'fora'); const nucleo = path.join(base, 'nucleo');
    fs.mkdirSync(fora); fs.mkdirSync(path.join(nucleo, 'lib'), { recursive: true }); fs.mkdirSync(path.join(nucleo, 'node_modules/x'), { recursive: true });
    fs.writeFileSync(path.join(fora, 'segredo.txt'), 's');
    fs.writeFileSync(path.join(nucleo, 'lib/a.mjs'), 'a');
    fs.writeFileSync(path.join(nucleo, 'lib/a.test.mjs'), 't');
    fs.writeFileSync(path.join(nucleo, 'node_modules/x/i.mjs'), 'n');
    fs.symlinkSync(fora, path.join(nucleo, 'lib/ligacao'));
    fs.symlinkSync(path.join(fora, 'segredo.txt'), path.join(nucleo, 'lib/s.txt'));
    const { arquivos, ignorados } = listarArquivosDoNucleo(nucleo);
    assert.deepEqual(arquivos, ['lib/a.mjs']);
    assert.deepEqual(ignorados.sort(), ['lib/ligacao', 'lib/s.txt']);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('tools/ah roda a cópia do checkout principal a partir de um worktree', { skip: process.platform === 'win32' }, () => {
  const p = criarProjeto();
  const wt = path.join(path.dirname(p.raiz), 'wt');
  assert.equal(p.git(['worktree', 'add', wt, '-b', 'feat/x']).codigo, 0);
  fs.rmSync(path.join(wt, '.harness/nucleo'), { recursive: true, force: true });
  const r = spawnSync(path.join(wt, 'tools/ah'), ['whoami'], { cwd: wt, env: p.env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Sessão sessao-t/);
});

test('tools/ah sem Node recusa com código 2', { skip: process.platform === 'win32' }, () => {
  const p = criarProjeto();
  const vazio = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-semnode-'));
  try {
    const r = spawnSync(path.join(p.raiz, 'tools/ah'), ['whoami'], { cwd: p.raiz, env: { ...p.env, PATH: vazio }, encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Recusado: o Node não foi encontrado\.\nFaça: instale o Node 22 ou mais novo e rode tools\/ah doctor/);
  } finally {
    fs.rmSync(vazio, { recursive: true, force: true });
  }
});
