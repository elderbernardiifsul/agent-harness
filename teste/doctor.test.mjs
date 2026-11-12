import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  assert.match(p.ah(['doctor']).saida, /^ok\s+Gancho responde/m);
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

const trocarComandoDoPre = (p, comando) => {
  const f = path.join(p.raiz, '.claude', 'settings.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  s.hooks.PreToolUse[0].hooks[0].command = comando;
  fs.writeFileSync(f, JSON.stringify(s));
};

test('código 2 por outro motivo não vale como gancho que responde', () => {
  const p = criarProjeto();
  trocarComandoDoPre(p, 'echo falhou >&2; exit 2 # tools/ah gancho claude-code');
  assert.match(p.ah(['doctor']).saida, /^FALHOU\s+Gancho responde.*saiu com 2 mas sem a recusa T5: falhou/m);
});

test('cópia instalada confere todos os ganchos, não só o PreToolUse', () => {
  const p = criarProjeto();
  assert.ok(fs.existsSync(path.join(p.raiz, '.harness', 'nucleo', 'modelos', 'claude-code', 'ganchos.json')));
  const f = path.join(p.raiz, '.claude', 'settings.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  s.hooks = { PreToolUse: s.hooks.PreToolUse };
  fs.writeFileSync(f, JSON.stringify(s));
  const r = spawnSync(path.join(p.raiz, 'tools', 'ah'), ['doctor'], { cwd: p.raiz, env: p.env, encoding: 'utf8' });
  assert.match(r.stdout, /^FALHOU\s+Ganchos do Claude Code instalados/m);
});

test('cópia sem o modelo dos ganchos falha apontando o init', () => {
  const p = criarProjeto();
  fs.rmSync(path.join(p.raiz, '.harness', 'nucleo', 'modelos'), { recursive: true });
  const r = spawnSync(path.join(p.raiz, 'tools', 'ah'), ['doctor'], { cwd: p.raiz, env: p.env, encoding: 'utf8' });
  assert.match(r.stdout, /^FALHOU\s+Ganchos do Claude Code instalados.*ah init/m);
});

test('init repetido atualiza o modelo copiado', () => {
  const p = criarProjeto();
  const f = path.join(p.raiz, '.harness', 'nucleo', 'modelos', 'claude-code', 'ganchos.json');
  fs.writeFileSync(f, '{}');
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']).codigo, 0);
  assert.ok(JSON.parse(fs.readFileSync(f, 'utf8')).hooks.PreToolUse);
});

test('pasta de estado ilegível é falha com o caminho', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, () => {
  const p = criarProjeto();
  const pasta = path.join(dirDoTeste(p), 'frentes');
  fs.mkdirSync(pasta, { recursive: true });
  fs.chmodSync(pasta, 0);
  try { assert.match(p.ah(['doctor']).saida, /^FALHOU\s+Arquivos de estado legíveis.*frentes/m); } finally { fs.chmodSync(pasta, 0o755); }
});

test('login local no histórico é aviso, não ok', () => {
  const p = criarProjeto();
  fs.writeFileSync(path.join(p.estado, 'maquina.json'), JSON.stringify({ sigla: 'as', login: 'local' }));
  assert.match(p.ah(['doctor']).saida, /^aviso\s+Sigla sem choque: não conferi o histórico sem login do gh/m);
});

test('sem ramos protegidos a proteção no servidor é aviso', () => {
  const p = criarProjeto();
  const f = path.join(p.raiz, '.harness', 'config.json');
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  c.git.protegidos = [];
  fs.writeFileSync(f, JSON.stringify(c));
  assert.match(p.ah(['doctor']).saida, /^aviso\s+Proteção no servidor: .*protegido/m);
});

test('C1: o doctor tem 15 itens, com "Harness no ramo base" antes de "Gancho responde"', async () => {
  const { VERIFICACOES } = await import('../nucleo/comandos/doctor.mjs');
  const nomes = VERIFICACOES.map(v => v.item);
  assert.equal(nomes.length, 15);
  assert.equal(nomes.indexOf('Harness no ramo base'), nomes.indexOf('Ganchos do Claude Code instalados') + 1);
  assert.equal(nomes.indexOf('Gancho responde'), nomes.indexOf('Harness no ramo base') + 1);
});

test('esquema desconhecido ou mais novo no estado é falha com o arquivo e o conserto', () => {
  const p = criarProjeto();
  try {
    assert.equal(p.ah(['whoami']).codigo, 0);
    assert.match(p.ah(['doctor']).saida, /^ok\s+Arquivos de estado legíveis/m);
    const v0 = path.join(dirDoTeste(p), 'sessoes', 'v0.json');
    fs.writeFileSync(v0, JSON.stringify({ esquema: 0, id: 'v0' }));
    const f9 = path.join(dirDoTeste(p), 'frentes', 'futura.json');
    fs.mkdirSync(path.dirname(f9), { recursive: true });
    fs.writeFileSync(f9, JSON.stringify({ esquema: 9, nome: 'futura' }));
    const saida = p.ah(['doctor']).saida;
    const linha = saida.split('\n').find(l => /Arquivos de estado legíveis/.test(l));
    assert.match(linha, /^FALHOU/);
    assert.ok(linha.includes(v0), linha);
    assert.match(linha, /conserte o campo "esquema"/);
    assert.ok(linha.includes(f9), linha);
    assert.match(linha, /atualize o harness/);
    // e o whoami com a sessão em esquema desconhecido não manda rodar o doctor
    const r = p.ah(['whoami'], { env: { AH_SESSAO: 'v0' } });
    assert.equal(r.codigo, 1);
    assert.match(r.erro, /conserte o campo "esquema"/);
    assert.doesNotMatch(r.erro, /ah doctor/);
  } finally {
    p.limpar();
  }
});
