import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarProjeto, criarRepo, gravar, dirDoTeste } from './apoio/repo.mjs';

test('projeto recém-preparado: sem falhas', () => {
  const p = criarProjeto();
  const r = p.ah(['doctor']);
  assert.equal(r.codigo, 0, r.saida + r.erro);
  assert.doesNotMatch(r.saida, /^FALHOU/m);
  assert.match(r.saida, /^ok\s+Gancho responde/m);
  assert.match(r.saida, /^ok\s+Ganchos do Claude Code instalados/m);
  assert.match(r.saida, /\d+ aviso\(s\)\.$|Tudo certo\.$/m);
});

test('o ensaio do gancho não suja o estado real', () => {
  const p = criarProjeto();
  p.ah(['doctor']);
  assert.equal(fs.existsSync(path.join(dirDoTeste(p), 'eventos.jsonl')), false);
  assert.equal(fs.existsSync(path.join(dirDoTeste(p), 'sessoes')), false);
});

test('configuração inválida falha com campo e motivo, e o doctor não quebra', () => {
  const p = criarProjeto();
  gravar(p, '.harness/config.json', JSON.stringify({ projeto: 'loja', git: { base: 3 } }));
  const r = p.ah(['doctor']);
  assert.equal(r.codigo, 1);
  assert.match(r.saida, /^FALHOU\s+.*git\.base/m);
  assert.doesNotMatch(r.erro, /\bat .+\.mjs:\d+/);
});

test('fora de repositório responde algo útil', () => {
  const fora = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-fora-'));
  try {
    const r = criarProjeto().ah(['doctor'], { cwd: fora });
    assert.equal(r.codigo, 1);
    assert.match(r.saida, /^FALHOU\s+.*repositório/m);
    assert.doesNotMatch(r.erro, /\bat .+\.mjs:\d+/);
  } finally {
    fs.rmSync(fora, { recursive: true, force: true });
  }
});

test('estado corrompido é acusado com o caminho', () => {
  const p = criarProjeto();
  fs.mkdirSync(path.join(dirDoTeste(p), 'frentes'), { recursive: true });
  fs.writeFileSync(path.join(dirDoTeste(p), 'frentes', 'x.json'), '{');
  const r = p.ah(['doctor']);
  assert.equal(r.codigo, 1);
  assert.match(r.saida, /^FALHOU\s+.*x\.json.*apague ou conserte o arquivo/m);
});

test('sem ganchos instalados falha apontando o init', () => {
  const p = criarProjeto();
  fs.rmSync(path.join(p.raiz, '.claude', 'settings.json'));
  const r = p.ah(['doctor']);
  assert.equal(r.codigo, 1);
  assert.match(r.saida, /^FALHOU\s+Ganchos.*ah init/m);
  assert.match(r.saida, /^FALHOU\s+Gancho responde/m);
});

test('gancho que não recusa o push falha', () => {
  const p = criarProjeto();
  const f = path.join(p.raiz, '.claude', 'settings.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  s.hooks.PreToolUse[0].hooks[0].command = 'true tools/ah gancho claude-code';
  fs.writeFileSync(f, JSON.stringify(s));
  assert.match(p.ah(['doctor']).saida, /^FALHOU\s+Gancho responde/m);
});

test('sem gh é aviso, não falha', () => {
  const p = criarProjeto();
  const r = p.ah(['doctor'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 0, r.saida);
  assert.match(r.saida, /^aviso\s+.*gh.*comentário em ticket/m);
  assert.equal((r.saida.match(/^aviso\s+Proteção/gm) ?? []).length, 1);
});

test('sem proteção no servidor é aviso com a frase combinada', () => {
  const p = criarProjeto();
  p.ghResponder([{ prefixo: ['api', 'repos/exemplo/loja/branches/main/protection'], codigo: 1, saida: 'Branch not protected' }]);
  const r = p.ah(['doctor']);
  assert.equal(r.codigo, 0, r.saida);
  assert.match(r.saida, /^aviso\s+.*main.*sem proteção no servidor: só a trava local protege/m);
  assert.doesNotMatch(r.saida, /^aviso\s+.*stage.*sem proteção/m);
});

test('proteção que não dá para conferir é aviso', () => {
  const p = criarProjeto();
  p.ghResponder([{ prefixo: ['api', 'repos/exemplo/loja/branches/stage/protection'], codigo: 1, saida: 'HTTP 403' }]);
  assert.match(p.ah(['doctor']).saida, /^aviso\s+.*não consegui conferir a proteção de stage/m);
});

test('frente cujo worktree não existe é aviso com o nome', () => {
  const p = criarProjeto();
  fs.mkdirSync(path.join(dirDoTeste(p), 'frentes'), { recursive: true });
  fs.writeFileSync(path.join(dirDoTeste(p), 'frentes', 'sumida.json'), JSON.stringify({
    esquema: 1, id: 'as-1', nome: 'sumida', ramo: 'feat/sumida', worktree: path.join(p.raiz, '..', 'nao-existe'), estado: 'ativa', abertaEm: '2026-01-01T00:00:00-03:00',
  }));
  const r = p.ah(['doctor']);
  assert.equal(r.codigo, 0, r.saida);
  assert.match(r.saida, /^aviso\s+.*sumida/m);
});

test('sigla com choque no histórico de outro login falha', () => {
  const p = criarProjeto();
  fs.appendFileSync(path.join(p.raiz, 'docs/agents/historico-das-frentes.md'), '- 2026-01-02 · as-1 · antiga · @carla-dias · — · feita\n');
  assert.match(p.ah(['doctor']).saida, /^FALHOU\s+Sigla.*carla-dias.*as-1/m);
});

test('núcleo sem MANIFEST.json falha', () => {
  const p = criarProjeto();
  fs.rmSync(path.join(p.raiz, '.harness', 'nucleo', 'MANIFEST.json'));
  assert.match(p.ah(['doctor']).saida, /^FALHOU\s+.*MANIFEST/m);
});

test('todo item que não é ok traz o que fazer', () => {
  const p = criarProjeto();
  fs.rmSync(path.join(p.raiz, '.claude', 'settings.json'));
  const r = p.ah(['doctor'], { env: { GH_FALSO_FORA: '1' } });
  const ruins = r.saida.split('\n').filter(l => /^(aviso|FALHOU)/.test(l));
  assert.ok(ruins.length >= 3);
  for (const l of ruins) assert.match(l, /: .+/);
  assert.match(r.saida, /\d+ falha\(s\), \d+ aviso\(s\)\.\n$/);
});

test('--json devolve só o JSON com itens, falhas e avisos', () => {
  const p = criarProjeto();
  fs.rmSync(path.join(p.raiz, '.claude', 'settings.json'));
  const r = p.ah(['doctor', '--json']);
  const j = JSON.parse(r.saida);
  assert.equal(r.codigo, 1);
  assert.ok(Array.isArray(j.itens) && j.itens.every(i => 'item' in i && ['ok', 'aviso', 'falha'].includes(i.estado)));
  assert.ok(j.falhas >= 1 && typeof j.avisos === 'number');
  assert.ok(j.itens.find(i => i.estado === 'falha').fazer);
});

test('criarRepo sem init: doctor acusa configuração ausente', () => {
  const r = criarRepo().ah(['doctor']);
  assert.equal(r.codigo, 1);
  assert.match(r.saida, /^FALHOU\s+.*config\.json.*ah init/m);
});
