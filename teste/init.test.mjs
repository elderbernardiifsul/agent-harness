import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
    'tools/ah', 'tools/ah.cmd', 'docs/agents/sessoes-paralelas.md', 'docs/agents/historico-das-frentes.md', '.claude/settings.json',
    '.harness/nucleo/adaptadores/contrato.mjs', '.harness/nucleo/adaptadores/claude-code.mjs', '.harness/nucleo/comandos/gancho.mjs']) {
    assert.ok(fs.existsSync(path.join(p.raiz, f)), f);
  }
  assert.equal(JSON.parse(ler(p, '.harness/config.json')).projeto, 'loja');
  // Classes de pesado só como exemplo: a T6 começa desligada.
  const pesado = JSON.parse(ler(p, '.harness/config.json')).pesado;
  assert.deepEqual(pesado.classes, {});
  assert.ok(pesado._exemplo.exclusivo);
  const manifesto = JSON.parse(ler(p, '.harness/nucleo/MANIFEST.json'));
  assert.equal(manifesto.versao, VERSAO);
  assert.match(manifesto.commit, /^[0-9a-f]{40}$/);
  assert.ok(!Number.isNaN(Date.parse(manifesto.copiadoEm)));
  assert.match(r.saida, /Depois rode: tools\/ah doctor/);
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

// ---- ganchos do Claude Code

const COMANDO = '"$CLAUDE_PROJECT_DIR"/tools/ah gancho claude-code';
const EVENTOS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Stop', 'SessionEnd'];
const doHarness = grupo => (grupo.hooks ?? []).filter(h => typeof h.command === 'string' && h.command.trim().endsWith('tools/ah gancho claude-code'));
const contarDoHarness = (s, ev) => (s.hooks[ev] ?? []).reduce((n, g) => n + doHarness(g).length, 0);

test('init instala os ganchos do Claude Code em .claude/settings.json', () => {
  const p = criarRepo();
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as']).codigo, 0);
  const s = JSON.parse(ler(p, '.claude/settings.json'));
  for (const ev of EVENTOS) {
    assert.equal(contarDoHarness(s, ev), 1, ev);
    const grupo = s.hooks[ev].find(g => doHarness(g).length);
    assert.deepEqual(doHarness(grupo)[0], { type: 'command', command: COMANDO });
  }
  assert.equal(s.hooks.PreToolUse[0].matcher, 'Bash|PowerShell|Edit|Write|NotebookEdit');
});

test('init mescla os ganchos sem apagar os de terceiros nem duplicar', () => {
  const p = criarRepo();
  const terceiro = { type: 'command', command: 'echo terceiro' };
  const previo = {
    permissions: { allow: ['Bash(npm test:*)'] },
    model: 'qualquer',
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [terceiro] }],
      Stop: [{ hooks: [{ type: 'command', command: 'echo fim' }] }],
      Notification: [{ hooks: [{ type: 'command', command: 'echo aviso' }] }],
    },
  };
  fs.mkdirSync(path.join(p.raiz, '.claude'));
  gravar(p, '.claude/settings.json', JSON.stringify(previo, null, 2));
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as']).codigo, 0);
  const primeira = ler(p, '.claude/settings.json');
  const r = p.ah(['init']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(ler(p, '.claude/settings.json'), primeira);
  const s = JSON.parse(primeira);
  assert.deepEqual(s.permissions, previo.permissions);
  assert.equal(s.model, 'qualquer');
  assert.deepEqual(s.hooks.Notification, previo.hooks.Notification);
  assert.deepEqual(s.hooks.PreToolUse[0], { matcher: 'Bash', hooks: [terceiro] });
  assert.ok(s.hooks.Stop.some(g => g.hooks.some(h => h.command === 'echo fim')));
  for (const ev of EVENTOS) assert.equal(contarDoHarness(s, ev), 1, ev);
});

test('init atualiza a entrada antiga do harness em vez de acrescentar outra', () => {
  const p = criarRepo();
  const terceiro = { type: 'command', command: 'echo junto' };
  const previo = { hooks: { PreToolUse: [
    { matcher: 'Bash|Edit|Write|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: COMANDO }, terceiro] },
    { matcher: 'Read', hooks: [{ type: 'command', command: 'echo leu' }] },
  ] } };
  fs.mkdirSync(path.join(p.raiz, '.claude'));
  gravar(p, '.claude/settings.json', JSON.stringify(previo));
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as']).codigo, 0);
  const s = JSON.parse(ler(p, '.claude/settings.json'));
  assert.equal(contarDoHarness(s, 'PreToolUse'), 1);
  const nosso = s.hooks.PreToolUse.find(g => doHarness(g).length);
  assert.equal(nosso.matcher, 'Bash|PowerShell|Edit|Write|NotebookEdit');
  assert.ok(s.hooks.PreToolUse.some(g => g.matcher === 'Bash|Edit|Write|MultiEdit|NotebookEdit' && g.hooks.length === 1 && g.hooks[0].command === 'echo junto'));
  assert.ok(s.hooks.PreToolUse.some(g => g.matcher === 'Read'));
});

test('init recusa .claude/settings.json inválido sem sobrescrever nem criar nada', () => {
  const p = criarRepo();
  fs.mkdirSync(path.join(p.raiz, '.claude'));
  for (const texto of ['{ quebrado', '[]', '{"hooks": []}', '{"hooks": {"Stop": {}}}']) {
    gravar(p, '.claude/settings.json', texto);
    const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
    assert.equal(r.codigo, 1, texto);
    assert.match(r.erro, /^Recusado: .*\.claude\/settings\.json.*\nFaça: /, texto);
    assert.equal(ler(p, '.claude/settings.json'), texto);
    assert.equal(fs.existsSync(path.join(p.raiz, '.harness')), false, texto);
  }
});

// ---- onda final: C1 (repositório que começa na main)
// Divide uma linha de comando impressa pelo init em argumentos (aspas duplas simples, sem escape).
const argsDaLinha = linha => [...linha.matchAll(/"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2]);
const passosImpressos = saida => saida.split('\n').filter(l => l.startsWith('  git ')).map(l => argsDaLinha(l.trim()).slice(1));

test('C1: na main, o init manda fazer o commit no ramo base, e os comandos impressos funcionam', () => {
  const p = criarRepo({ ramos: ['main'] });
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Falta levar o harness para o ramo base dev/);
  const passos = passosImpressos(r.saida);
  assert.deepEqual(passos[0], ['switch', 'dev']);
  assert.deepEqual(passos[1].slice(0, 2), ['add', '--']);
  for (const c of ['.harness', 'tools/ah', 'tools/ah.cmd', 'docs/agents/sessoes-paralelas.md', 'docs/agents/historico-das-frentes.md', '.claude/settings.json', '.github/workflows/ah-ci.yml'])
    assert.ok(passos[1].includes(c), c);
  assert.deepEqual(passos[2], ['commit', '-m', 'chore: instala o agent-harness']);
  assert.match(r.saida, /Depois rode: tools\/ah doctor/);
  for (const args of passos) assert.equal(p.git(args).codigo, 0, args.join(' '));
  const d = p.ah(['doctor']);
  assert.match(d.saida, /^ok\s+Harness no ramo base/m);
  const o = p.ah(['open', 'carrinho']);
  assert.equal(o.codigo, 0, o.erro);
  const wt = path.join(p.env.AH_WORKTREES, 'carrinho');
  assert.ok(fs.existsSync(path.join(wt, 'tools', 'ah')));
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']).saida.includes('Agora rode: tools/ah doctor'), true);
  p.limpar();
});

test('C1: já no ramo base o init não manda trocar; commit na main é acusado pelo doctor e recusado pelo open', () => {
  const q = criarRepo();
  const rq = q.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']);
  assert.doesNotMatch(rq.saida, /git switch/);
  assert.match(rq.saida, /^ {2}git add -- /m);
  q.limpar();

  const p = criarRepo({ ramos: ['main'] });
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']).codigo, 0);
  assert.equal(p.git(['add', '--', '.harness', 'tools', 'docs/agents', '.claude', '.github', 'AGENTS.md']).codigo, 0);
  assert.equal(p.git(['commit', '-m', 'chore: instala o harness']).codigo, 0);
  const d = p.ah(['doctor']);
  assert.equal(d.codigo, 1);
  assert.match(d.saida, /^FALHOU\s+Harness no ramo base: tools\/ah e \.harness\/config\.json não estão no ramo dev.*faça o commit do harness em dev/m);
  const linhas = d.saida.split('\n');
  assert.ok(linhas.findIndex(l => l.includes('Harness no ramo base')) < linhas.findIndex(l => l.includes('Gancho responde')));
  const o = p.ah(['open', 'carrinho']);
  assert.equal(o.codigo, 1);
  assert.match(o.erro, /Recusado: O harness ainda não está no ramo dev.*\nFaça: faça o commit do harness lá: git switch dev/);
  assert.equal(fs.existsSync(path.join(p.env.AH_WORKTREES, 'carrinho')), false);
  assert.equal(p.git(['show-ref', '--verify', '--quiet', 'refs/heads/feat/carrinho']).codigo, 1);
  // De novo o init, com tudo commitado na main: manda levar para a dev pelo merge.
  const r2 = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']);
  assert.deepEqual(passosImpressos(r2.saida), [['switch', 'dev'], ['merge', 'main']]);
  for (const args of passosImpressos(r2.saida)) assert.equal(p.git(args).codigo, 0, args.join(' '));
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  p.limpar();
});

// ---- onda final: I2 e M3 (modelos que o init copia)
const MODELOS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'modelos');
test('I2: sessoes-paralelas.md descreve só as travas que existem nesta fatia', () => {
  const t = fs.readFileSync(path.join(MODELOS, 'sessoes-paralelas.md'), 'utf8');
  for (const trava of ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6']) assert.ok(t.includes(trava), trava);
  assert.ok(!t.includes('T7'));
  assert.match(t, /tools\/ah pesado -- <comando>/);
  assert.doesNotMatch(t, /não grava arquivos fora do worktree da própria frente|só por uma vez|pull request: `feat/);
  assert.match(t, /git merge --no-ff feat\/<nome>/);
  assert.match(t, /a T0 nunca é liberada/);
});
test('M3: o cabeçalho do histórico descreve a linha que o close grava, sem confundir o doctor', async () => {
  const t = fs.readFileSync(path.join(MODELOS, 'historico-das-frentes.md'), 'utf8');
  assert.ok(t.includes('`- <data> · <id> · <nome> · @<login> · <tickets> · <resumo>`'));
  const { linhaDoHistorico, idsNoHistorico } = await import('../nucleo/lib/frente.mjs');
  const linha = linhaDoHistorico({ id: 'as-1', nome: 'carrinho', abertaPor: 'ana-souza', tickets: [1], abertaEm: '2026-11-12T10:00:00-03:00' }, 'soma', new Date());
  assert.match(linha, /^- \d{4}-\d{2}-\d{2} · as-1 · carrinho · @ana-souza · #1 · soma$/);
  // nenhuma linha do cabeçalho tem id e @login juntos (o doctor leria como choque de sigla)
  for (const l of t.split('\n')) assert.ok(!(idsNoHistorico(l, 'as').length && /@[A-Za-z0-9]/.test(l)), l);
});

// ---- Segunda onda
function repoSemCommit(t, ramo = 'main') {
  const p = criarRepo({ remoto: false });
  t.after(() => fs.rmSync(path.dirname(p.raiz), { recursive: true, force: true }));
  fs.rmSync(path.join(p.raiz, '.git'), { recursive: true, force: true });
  fs.rmSync(path.join(p.raiz, 'README.md'));
  assert.equal(p.git(['init', '-b', ramo]).codigo, 0);
  return p;
}

test('init em repositório sem nenhum commit recusa logo, com código 1, sem gravar nada', t => {
  const p = repoSemCommit(t);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']);
  assert.equal(r.codigo, 1, r.saida + r.erro);
  assert.match(r.erro, /^Recusado: o repositório ainda não tem commit/m);
  assert.match(r.erro, /Faça: faça o primeiro commit \(git commit --allow-empty -m "começo"\) e rode ah init de novo/);
  assert.deepEqual(fs.readdirSync(p.raiz), ['.git']);
  assert.equal(fs.existsSync(path.join(p.estado, 'maquina.json')), false);
});

test('init em repositório só com a master cria dev, stage e main a partir dela e não troca de ramo', t => {
  const p = repoSemCommit(t, 'master');
  assert.equal(p.git(['commit', '--allow-empty', '-m', 'começo']).codigo, 0);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']);
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual(p.git(['branch', '--format=%(refname:short)']).saida.trim().split('\n').sort(), ['dev', 'main', 'master', 'stage']);
  assert.equal(p.git(['branch', '--show-current']).saida.trim(), 'master');
  assert.match(r.saida, /git switch dev/);
});

// ---- ponteiro para o roteiro de adaptação (fatia 4)

test('init instala no AGENTS.md o ponteiro para o roteiro, e o caminho apontado existe no projeto', t => {
  const p = criarRepo();
  t.after(() => p.limpar());
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']).codigo, 0);
  const texto = ler(p, 'AGENTS.md');
  assert.match(texto, /não é o Claude Code, as travas automáticas não valem até existir adaptador/);
  const apontado = /`(\.harness\/nucleo\/docs\/agentes\/README\.md)`/.exec(texto)?.[1];
  assert.ok(apontado, texto);
  assert.ok(fs.existsSync(path.join(p.raiz, apontado)), apontado);
  for (const doc of ['contrato.md', 'exemplo-claude-code.md', 'escrever-um-adaptador.md', 'provar.md']) {
    assert.ok(fs.existsSync(path.join(p.raiz, '.harness/nucleo/docs/agentes', doc)), doc);
  }
  assert.ok(fs.existsSync(path.join(p.raiz, '.harness/nucleo/docs/referencia/capacidades-por-agente.md')));
  assert.match(p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']).saida, /Depois rode|Agora rode/);
});

test('init acrescenta o trecho ao AGENTS.md que já existe, sem apagar nada, e não o duplica', t => {
  const p = criarRepo();
  t.after(() => p.limpar());
  gravar(p, 'AGENTS.md', '# Regras da loja\n\nTeste antes de commitar.\n');
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']).codigo, 0);
  const uma = ler(p, 'AGENTS.md');
  assert.ok(uma.startsWith('# Regras da loja\n\nTeste antes de commitar.\n'), uma);
  assert.match(uma, /docs\/agentes\/README\.md/);
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']).codigo, 0);
  assert.equal(ler(p, 'AGENTS.md'), uma);
  // Trecho antigo (entre as marcas) é trocado pelo atual.
  gravar(p, 'AGENTS.md', uma.replace(/(<!-- agent-harness: início[^\n]*\n)[\s\S]*?(<!-- agent-harness: fim -->)/, '$1velho\n$2'));
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']).codigo, 0);
  assert.equal(ler(p, 'AGENTS.md'), uma);
});

// ---- AGENTS.md com marcas estragadas, CRLF e link (revisão da fatia 4)

const initLoja = (p, ...extra) => p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao', ...extra]);
const INICIO = '<!-- agent-harness: início (o ah init reescreve este trecho; escreva fora das marcas) -->';
const FIM = '<!-- agent-harness: fim -->';

for (const [caso, texto] of [
  ['marca de fim apagada', `# Regras\n\n${INICIO}\ntrecho velho\n\nTexto do usuário que não pode sumir.\n`],
  ['duas marcas de início', `# Regras\n\n${INICIO}\nvelho 1\n${INICIO}\nTexto do usuário que não pode sumir.\n${FIM}\n`],
  ['fim antes do início', `# Regras\n\n${FIM}\nTexto do usuário que não pode sumir.\n${INICIO}\nvelho\n`],
]) {
  test(`AGENTS.md com ${caso}: não reescreve o que existe, acrescenta o trecho no fim e avisa`, t => {
    const p = criarRepo();
    t.after(() => p.limpar());
    gravar(p, 'AGENTS.md', texto);
    const r = initLoja(p);
    assert.equal(r.codigo, 0, r.erro);
    const depois = ler(p, 'AGENTS.md');
    assert.ok(depois.startsWith(texto), depois);
    assert.match(depois.slice(texto.length), /docs\/agentes\/README\.md/);
    assert.match(r.erro, /AGENTS\.md tem as marcas do harness incompletas ou repetidas[\s\S]*Faça: /);
    // De novo: não acrescenta outra vez.
    assert.equal(initLoja(p).codigo, 0);
    assert.equal(ler(p, 'AGENTS.md'), depois);
  });
}

test('AGENTS.md com CRLF mantém o fim de linha do arquivo', t => {
  const p = criarRepo();
  t.after(() => p.limpar());
  gravar(p, 'AGENTS.md', '# Regras\r\n\r\nTeste antes.\r\n');
  assert.equal(initLoja(p).codigo, 0);
  const uma = ler(p, 'AGENTS.md');
  assert.match(uma, /docs\/agentes\/README\.md/);
  assert.doesNotMatch(uma, /[^\r]\n/);
  assert.equal(initLoja(p).codigo, 0);
  assert.equal(ler(p, 'AGENTS.md'), uma);
});

test('AGENTS.md que é link simbólico: o init não o troca (nem com --sobrescrever) e diz o que fazer', { skip: process.platform === 'win32' }, t => {
  const p = criarRepo();
  t.after(() => p.limpar());
  gravar(p, 'regras.md', '# Regras\n');
  fs.symlinkSync('regras.md', path.join(p.raiz, 'AGENTS.md'));
  const r = initLoja(p, '--sobrescrever');
  assert.equal(r.codigo, 0, r.erro);
  assert.ok(fs.lstatSync(path.join(p.raiz, 'AGENTS.md')).isSymbolicLink());
  assert.equal(ler(p, 'regras.md'), '# Regras\n');
  assert.match(r.erro, /AGENTS\.md é um link simbólico; não mexi nele[\s\S]*Faça: .*agents-trecho\.md/);
});
