import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { copiarHarness, criarProjeto, criarRepo, gravar, dirDoTeste, envelhecerSinal } from './apoio/repo.mjs';
import { enfileirar } from '../nucleo/lib/pendentes.mjs';

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

test('C1: o doctor tem 25 itens, com "Harness no ramo base" antes de "Gancho responde" e os da fatia 2 depois dele', async () => {
  const { VERIFICACOES } = await import('../nucleo/comandos/doctor.mjs');
  const nomes = VERIFICACOES.map(v => v.item);
  // 16 da fatia 1 e da tarefa 5, menos "Fila de pendentes" (virou "Comentários pendentes"), mais 5 da tarefa 14,
  // mais "Fila de pesado" (fatia 3), "Adaptador do agente em uso" (fatia 4), "Núcleo igual ao clone de origem" (fatia 5)
  // e ".harness é uma pasta do projeto" (pendências), logo antes da configuração, mais "CLAUDE.md aponta para o AGENTS.md" (método).
  assert.equal(nomes.length, 25);
  assert.equal(nomes.indexOf('.harness/config.json válido'), nomes.indexOf('.harness é uma pasta do projeto') + 1);
  assert.equal(nomes.indexOf('Núcleo igual ao clone de origem'), nomes.indexOf('Cópia do núcleo (MANIFEST.json)') + 1);
  assert.ok(nomes.includes('Fila de pesado'));
  assert.equal(nomes.at(-1), 'Adaptador do agente em uso');
  assert.equal(nomes.indexOf('Harness no ramo base'), nomes.indexOf('Ganchos do Claude Code instalados') + 1);
  assert.equal(nomes.indexOf('Gancho responde'), nomes.indexOf('Harness no ramo base') + 1);
  const g = nomes.indexOf('Gancho responde');
  assert.deepEqual(nomes.slice(g + 1, g + 6), ['Hora de início do processo', 'Gancho recusa troca de ramo', 'Ganchos vigiam a edição', 'Comentários pendentes', 'Frentes órfãs']);
  assert.ok(!nomes.includes('Fila de pendentes'));
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

// ---------------------------------------------------------------- fatia 2

const projetoLimpo = t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  return p;
};

const trocarSeletorDoPre = (p, matcher) => {
  const f = path.join(p.raiz, '.claude', 'settings.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  s.hooks.PreToolUse[0].matcher = matcher;
  fs.writeFileSync(f, JSON.stringify(s));
};

test('projeto recém-preparado: os itens novos passam', t => {
  const p = projetoLimpo(t);
  const r = p.ah(['doctor']);
  assert.equal(r.codigo, 0, r.saida + r.erro);
  assert.match(r.saida, /^ok\s+Gancho recusa troca de ramo/m);
  assert.match(r.saida, /^ok\s+Ganchos vigiam a edição/m);
  assert.match(r.saida, /^ok\s+Comentários pendentes/m);
  assert.match(r.saida, /^ok\s+Frentes órfãs/m);
  if (process.platform === 'win32') assert.match(r.saida, /^aviso\s+Hora de início do processo: no Windows a hora de início não é conferida; um pid reaproveitado conta como vivo até o sinal vencer$/m);
  else assert.match(r.saida, /^ok\s+Hora de início do processo/m);
});

test('comentário pendente e frente órfã viram aviso com o que fazer', t => {
  const p = projetoLimpo(t);
  const A = 'sessao-teste-0001';
  assert.equal(p.ah(['open', 'carrinho'], { env: { AH_SESSAO: A } }).codigo, 0);
  envelhecerSinal(p, A, 300);
  enfileirar(dirDoTeste(p), { tipo: 'comentario', ticket: 1, corpo: 'comentário que ficou' });
  enfileirar(dirDoTeste(p), { tipo: 'comentario', ticket: 2, corpo: 'outro' });
  const r = p.ah(['doctor'], { env: { AH_SESSAO: '' } });
  assert.equal(r.codigo, 0, r.saida + r.erro);
  assert.match(r.saida, /^aviso\s+Comentários pendentes: 2 operações na fila \(#1, #2\); rode ah sweep --reparar com rede/m);
  assert.match(r.saida, /^aviso\s+Frente `carrinho` órfã: dona sessao-t.* \(sinal vencido\); ah takeover carrinho com a ordem do executivo$/m);
  assert.doesNotMatch(r.saida, /^ok\s+Frentes órfãs/m);
  // o mesmo que o sweep acha
  const s = JSON.parse(p.ah(['sweep', '--json'], { env: { AH_SESSAO: '' } }).saida);
  assert.deepEqual(s.achados.filter(a => ['frente-orfa', 'pendentes'].includes(a.tipo)).map(a => a.tipo).sort(), ['frente-orfa', 'pendentes']);
});

test('frente de dona viva não é órfã', t => {
  const p = projetoLimpo(t);
  assert.equal(p.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-teste-0001' } }).codigo, 0);
  const r = p.ah(['doctor']);
  assert.match(r.saida, /^ok\s+Frentes órfãs/m);
  assert.doesNotMatch(r.saida, /órfã:/);
});

test('o doctor não altera o estado', t => {
  const p = projetoLimpo(t);
  const A = 'sessao-teste-0001';
  assert.equal(p.ah(['open', 'carrinho'], { env: { AH_SESSAO: A } }).codigo, 0);
  envelhecerSinal(p, A, 300);
  enfileirar(dirDoTeste(p), { tipo: 'comentario', ticket: 1, corpo: 'comentário que ficou' });
  const foto = () => {
    const lista = [];
    const andar = d => {
      for (const n of fs.readdirSync(d).sort()) {
        const c = path.join(d, n);
        if (fs.statSync(c).isDirectory()) andar(c);
        else lista.push([path.relative(dirDoTeste(p), c), fs.readFileSync(c, 'utf8'), fs.statSync(c).mtimeMs]);
      }
    };
    andar(dirDoTeste(p));
    return lista;
  };
  const antes = foto();
  p.ah(['doctor'], { env: { AH_SESSAO: '' } });
  assert.deepEqual(foto(), antes);
});

test('seletor sem Edit falha apontando o init', t => {
  const p = projetoLimpo(t);
  trocarSeletorDoPre(p, 'Bash');
  const r = p.ah(['doctor']);
  assert.equal(r.codigo, 1);
  assert.match(r.saida, /^FALHOU\s+Ganchos vigiam a edição: .*Edit, Write e NotebookEdit.*ah init/m);
});

test('seletor que pega tudo vigia a edição; o que deixa só NotebookEdit de fora falha nomeando-o', t => {
  const p = projetoLimpo(t);
  trocarSeletorDoPre(p, '*');
  assert.match(p.ah(['doctor']).saida, /^ok\s+Ganchos vigiam a edição/m);
  trocarSeletorDoPre(p, 'Bash|Edit|Write');
  assert.match(p.ah(['doctor']).saida, /^FALHOU\s+Ganchos vigiam a edição: o seletor do PreToolUse não pega NotebookEdit; .*ah init/m);
});

test('gancho que não recusa a troca de ramo falha', t => {
  const p = projetoLimpo(t);
  trocarComandoDoPre(p, 'true tools/ah gancho claude-code');
  assert.match(p.ah(['doctor']).saida, /^FALHOU\s+Gancho recusa troca de ramo: .*git switch stage.*rode ah init --sobrescrever e confira tools\/ah/m);
});

test('o ensaio da troca de ramo não suja o estado nem troca o ramo do principal', t => {
  const p = projetoLimpo(t);
  assert.match(p.ah(['doctor']).saida, /^ok\s+Gancho recusa troca de ramo/m);
  assert.equal(fs.existsSync(path.join(dirDoTeste(p), 'eventos.jsonl')), false);
  assert.equal(p.git(['branch', '--show-current']).saida.trim(), 'dev');
});

// ---------------------------------------------------------------- onda final
const linhaDo = (saida, re) => saida.split('\n').find(l => re.test(l));

test('linha quebrada em pendentes: doctor e sweep acusam com o número e o conserto; nada derruba', t => {
  const p = projetoLimpo(t);
  enfileirar(dirDoTeste(p), { tipo: 'comentario', ticket: 1, corpo: 'ok' });
  const arq = path.join(dirDoTeste(p), 'pendentes.jsonl');
  fs.appendFileSync(arq, '{ quebrada\n');
  enfileirar(dirDoTeste(p), { tipo: 'comentario', ticket: 2, corpo: 'ok' });
  const r = p.ah(['doctor']);
  assert.match(r.saida, /^aviso\s+Comentários pendentes: 2 operações na fila \(#1, #2\)/m);
  assert.ok(r.saida.includes(`linha ilegível em pendentes: linha 2 de ${arq}; apague a linha 2 de ${arq}`), r.saida);
  const s = p.ah(['sweep']);
  assert.equal(s.codigo, 0, s.erro);
  assert.ok(s.saida.includes(`- pendente-ilegivel: linha ilegível em pendentes: linha 2 de ${arq}. Faça: apague a linha 2 de ${arq}`), s.saida);
  assert.match(s.saida, /- pendentes: 2 operações \(#1, #2\)/);
});

test('Frentes com worktree: frente passada com o worktree apagado aparece como no sweep; arquivo ilegível não esconde as outras', t => {
  const p = projetoLimpo(t);
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const arqF = path.join(dirDoTeste(p), 'frentes', 'carrinho.json');
  const f = JSON.parse(fs.readFileSync(arqF, 'utf8'));
  fs.rmSync(f.worktree, { recursive: true, force: true });
  fs.writeFileSync(path.join(dirDoTeste(p), 'frentes', 'quebrada.json'), '{ x');
  const r = p.ah(['doctor']);
  assert.ok(linhaDo(r.saida, /^aviso\s+Frente `carrinho`: o worktree .* não existe/), r.saida);
  const s = JSON.parse(p.ah(['sweep', '--json']).saida);
  assert.ok(s.achados.some(a => a.tipo === 'worktree-sumiu' && a.detalhe.includes('carrinho')));
});

test('pasta frentes sem leitura: os itens das frentes falham com o que fazer', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, t => {
  const p = projetoLimpo(t);
  const pasta = path.join(dirDoTeste(p), 'frentes');
  fs.mkdirSync(pasta, { recursive: true });
  fs.chmodSync(pasta, 0);
  let r;
  try { r = p.ah(['doctor']); } finally { fs.chmodSync(pasta, 0o755); }
  for (const item of ['Frentes órfãs', 'Frentes com worktree']) {
    const linha = linhaDo(r.saida, new RegExp(`^FALHOU\\s+${item}:`));
    assert.ok(linha, `${item}\n${r.saida}`);
    assert.doesNotMatch(linha, /erro interno/);
    assert.ok(linha.includes(pasta), linha);
    assert.match(linha, /confira as permissões da pasta/);
  }
});

test('frente chamada parada: o nome sai entre crases nos itens do doctor', t => {
  const p = projetoLimpo(t);
  assert.equal(p.ah(['open', 'parada']).codigo, 0);
  const arqF = path.join(dirDoTeste(p), 'frentes', 'parada.json');
  const f = JSON.parse(fs.readFileSync(arqF, 'utf8'));
  fs.writeFileSync(arqF, JSON.stringify({ ...f, estado: 'abrindo', processo: { pid: 999999, inicio: null } }));
  assert.match(p.ah(['doctor']).saida, /^aviso\s+Frente `parada` em abertura parada: /m);
});

// ---- adaptador do agente em uso (fatia 4)

const SEM_AGENTE = { AH_AGENTE: '', CLAUDECODE: '', CLAUDE_CODE_SESSION_ID: '', OPENCODE: '', OPENCODE_SESSION_ID: '', CODEX_THREAD_ID: '', CODEX_SESSION_ID: '', CODEX_CI: '' };

test('agente sem adaptador: aviso de que as travas automáticas não valem, apontando o roteiro', t => {
  const p = projetoLimpo(t);
  const r = p.ah(['doctor'], { env: { ...SEM_AGENTE, CODEX_THREAD_ID: 'abc' } });
  assert.equal(r.codigo, 0, r.saida + r.erro);
  const linha = r.saida.split('\n').find(l => /Adaptador do agente em uso/.test(l));
  assert.match(linha, /^aviso\s+Adaptador do agente em uso: o agente em uso \(codex\) não tem adaptador: as travas automáticas não valem/);
  assert.match(linha, /docs\/agentes\/README\.md/);
});

test('AH_AGENTE declara o agente e vale antes dos indicadores; o Claude Code vem por último', t => {
  const p = projetoLimpo(t);
  const linha = env => p.ah(['doctor'], { env: { ...SEM_AGENTE, ...env } }).saida.split('\n').find(l => /Adaptador do agente em uso/.test(l));
  assert.match(linha({ AH_AGENTE: 'outro-agente', CLAUDECODE: '1' }), /^aviso\s+.*\(outro-agente\) não tem adaptador/);
  assert.match(linha({ OPENCODE: '1', CLAUDE_CODE_SESSION_ID: 'x' }), /^aviso\s+.*\(opencode\) não tem adaptador/);
  assert.match(linha({ CLAUDECODE: '1' }), /^ok\s+Adaptador do agente em uso \(claude-code\)$/);
  assert.equal(linha({}), undefined, 'sem agente reconhecido o item não aparece');
});

test('adaptador que existe mas não está ligado em agentes é aviso com o conserto', t => {
  const p = projetoLimpo(t);
  const f = path.join(p.raiz, '.harness', 'config.json');
  fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, 'utf8')), agentes: [] }));
  const linha = p.ah(['doctor'], { env: { ...SEM_AGENTE, AH_AGENTE: 'claude-code' } }).saida.split('\n').find(l => /Adaptador do agente em uso/.test(l));
  assert.match(linha, /^aviso\s+Adaptador do agente em uso: o adaptador claude-code existe mas não está ligado; acrescente "claude-code" em agentes no \.harness\/config\.json e rode ah init/);
});

test('adaptador que não entrega todos os eventos: aviso com o que deixa de valer', async () => {
  const { situacaoDoAgente } = await import('../nucleo/comandos/doctor.mjs');
  const adaptadores = { parcial: { EVENTOS_ENTREGUES: ['inicio', 'antes'] } };
  const r = situacaoDoAgente({ agente: 'parcial', adaptadores, ligados: ['parcial'], roteiro: 'docs/agentes/README.md' });
  assert.equal(r.estado, 'aviso');
  assert.match(r.fazer, /o adaptador parcial não entrega sinal, fim/);
  assert.match(r.fazer, /sinal de vida só se renova/);
  assert.match(r.fazer, /docs\/agentes\/README\.md/);
  assert.equal(situacaoDoAgente({ agente: null, adaptadores, ligados: [], roteiro: 'x' }), null);
});

test('adaptador sem EVENTOS_ENTREGUES: aviso de que não declara', async () => {
  const { situacaoDoAgente } = await import('../nucleo/comandos/doctor.mjs');
  const r = situacaoDoAgente({ agente: 'mudo', adaptadores: { mudo: {} }, ligados: ['mudo'], roteiro: 'docs/agentes/README.md' });
  assert.equal(r.estado, 'aviso');
  assert.match(r.fazer, /o adaptador mudo não declara EVENTOS_ENTREGUES/);
});

test('doctor confere a fila de pesado: legível, versão e senhas mortas', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const dir = path.join(path.dirname(p.raiz), 'fila');
  fs.mkdirSync(dir, { recursive: true });
  const env = { env: { AH_FILA: dir } };
  const item = () => JSON.parse(p.ah(['doctor', '--json'], env).saida).itens.find(i => i.item === 'Fila de pesado');
  assert.equal(item().estado, 'ok');
  fs.writeFileSync(path.join(dir, 'fila.json'), JSON.stringify({ versao: 1, proximaSenha: 2, entradas: [{ senha: 1, pid: 999999, worktree: '/x', vagas: 1, chegou: new Date().toISOString(), rodandoDesde: null }] }));
  assert.equal(item().estado, 'aviso');
  assert.match(item().fazer, /senha\(s\) de processo morto: 1 \(pid 999999\)/);
  fs.writeFileSync(path.join(dir, 'fila.json'), JSON.stringify({ versao: 5 }));
  assert.equal(item().estado, 'falha');
  assert.match(item().fazer, /formato 5.*atualize o harness/);
  fs.rmSync(path.join(dir, 'fila.json'));
  fs.writeFileSync(path.join(dir, 'config.json'), '{');
  assert.equal(item().estado, 'falha');
  assert.match(item().fazer, /não é JSON válido.*corrija o arquivo/);
});

test('fatia 5: o núcleo é conferido contra o clone de origem registrado na máquina', t => {
  const p = criarProjeto();
  const clone = copiarHarness();
  t.after(() => { p.limpar(); clone.limpar(); });
  const linha = () => p.ah(['doctor']).saida.split('\n').find(l => l.includes('Núcleo igual ao clone de origem'));
  assert.match(linha(), /^ok\s+Núcleo igual ao clone de origem$/);

  const origem = path.join(dirDoTeste(p), 'origem.json');
  fs.writeFileSync(origem, JSON.stringify({ clone: clone.raiz }));
  assert.match(linha(), /^ok\s+Núcleo igual ao clone de origem$/);
  clone.gravar('nucleo/lib/novidade.mjs', 'export {};\n');
  const l = linha();
  assert.match(l, /^aviso\s+Núcleo igual ao clone de origem: o clone em \S+ \(versão \d+\.\d+\.\d+\) difere da cópia instalada \(\d+\.\d+\.\d+\) em 1 arquivo\(s\); rode tools\/ah atualizar --de /);
  assert.ok(l.includes(`--de ${clone.raiz}`), l);
  assert.equal(clone.ah(p, ['atualizar']).codigo, 0);
  assert.match(linha(), /^ok\s+Núcleo igual ao clone de origem$/);

  fs.writeFileSync(origem, JSON.stringify({ clone: path.join(clone.raiz, 'sumiu') }));
  assert.match(linha(), /^aviso\s+Núcleo igual ao clone de origem: o clone registrado \(.*sumiu\) não existe mais/);
  fs.writeFileSync(origem, JSON.stringify({ clone: clone.raiz }));
  clone.apagar('modelos/agents-trecho.md');
  assert.match(linha(), /^aviso\s+Núcleo igual ao clone de origem: o clone registrado \(.*\) está incompleto/);
  fs.rmSync(origem);
  assert.match(linha(), /^ok\s+Núcleo igual ao clone de origem \(sem clone registrado nesta máquina; não conferido\)$/);
  assert.equal(p.ah(['doctor']).codigo, 0);
});

test('.harness que é link simbólico: o gancho recusa com o motivo (o doctor passa) e o doctor falha com a saída', async t => {
  const { ganchoPre } = await import('./apoio/repo.mjs');
  const p = criarProjeto();
  const fora = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-harness-fora-'));
  t.after(() => { p.limpar(); fs.rmSync(fora, { recursive: true, force: true }); });
  fs.renameSync(path.join(p.raiz, '.harness'), path.join(fora, '.harness'));
  fs.symlinkSync(path.join(fora, '.harness'), path.join(p.raiz, '.harness'), 'dir');

  const r = ganchoPre(p, { command: 'git status' });
  assert.equal(r.codigo, 2, r.saida + r.erro);
  assert.match(r.erro, /^Recusado \(T0\): .*\.harness é um link simbólico/);
  assert.match(r.erro, /Faça: rode tools\/ah doctor/);
  assert.equal(ganchoPre(p, { command: 'tools/ah doctor' }).codigo, 0);

  const d = JSON.parse(p.ah(['doctor', '--json']).saida);
  const item = d.itens.find(i => i.item === '.harness é uma pasta do projeto');
  assert.equal(item?.estado, 'falha', JSON.stringify(d.itens.map(i => i.item)));
  assert.match(item.fazer, /link simbólico/);
  assert.match(item.fazer, /troque o link pela pasta/);
});

test('.harness pasta comum: o item do doctor sai ok', () => {
  const p = criarProjeto();
  try {
    const d = JSON.parse(p.ah(['doctor', '--json']).saida);
    assert.equal(d.itens.find(i => i.item === '.harness é uma pasta do projeto')?.estado, 'ok');
  } finally {
    p.limpar();
  }
});

test('doctor avisa CLAUDE.md sem @AGENTS.md e CLAUDE.md com conteúdo próprio', () => {
  const p = criarProjeto();
  const item = () => p.ah(['doctor']).saida;
  assert.match(item(), /^ok\s+CLAUDE\.md aponta para o AGENTS\.md/m);
  gravar(p, 'CLAUDE.md', '# Loja\n');
  assert.match(item(), /^aviso\s+CLAUDE\.md aponta para o AGENTS\.md.*rode ah init/m);
  gravar(p, 'CLAUDE.md', '@AGENTS.md\n\nUse pnpm.\n');
  assert.match(item(), /^aviso\s+CLAUDE\.md aponta para o AGENTS\.md.*o Codex e o OpenCode não leem o CLAUDE\.md; mova esse conteúdo para o AGENTS\.md/m);
  gravar(p, 'CLAUDE.md', '@AGENTS.md\n');
  assert.match(item(), /^ok\s+CLAUDE\.md aponta para o AGENTS\.md/m);
  p.limpar();
});
