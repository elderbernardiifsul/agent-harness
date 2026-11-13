// Auxiliares de teste para quem escreve uma extensão (docs/extensoes/como-estender.md). Acompanham a cópia do
// núcleo: um teste em .harness/extensoes/<nome>/extensao.test.mjs importa `../../nucleo/lib/extensoes-teste.mjs`.
//
//   carregarParaTeste(arquivo, config)  carrega a extensão e confere forma e configuração como o núcleo
//   ctxFalso({...})                     um ctx sem disco, que guarda o que a extensão escreveu e gravou
//   projetoDeTeste({...})               projeto git descartável com este núcleo e as extensões ligadas;
//                                       `ah(args)` chama o despacho e `gancho(acao)` passa uma ação pelas travas
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ErroDeUso } from './caminhos.mjs';
import { errosDaForma } from './extensoes.mjs';

const NUCLEO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSAO = 'sessao-teste-0001';

const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function congelar(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) congelar(v);
  }
  return obj;
}
const copia = v => (v == null ? v : congelar(structuredClone(v)));

// Carrega `arquivo` (o extensao.mjs) e confere a forma e a configuração como o núcleo faz. Devolve o
// `export default`; se o núcleo recusaria a extensão, lança um Error com o motivo.
export async function carregarParaTeste(arquivo, config = {}) {
  const v = fs.statSync(arquivo).mtimeMs;
  const def = (await import(`${pathToFileURL(path.resolve(arquivo)).href}?v=${v}`)).default;
  const erro = errosDaForma(def);
  if (erro) throw new Error(`o núcleo recusaria a extensão: ${erro}`);
  if (def.validarConfig) {
    const r = def.validarConfig(config);
    if (r !== null && r !== undefined && r !== true) throw new Error(`o núcleo recusaria a configuração: ${r}`);
  }
  return def;
}

// Um ctx sem disco, com a mesma forma do que o núcleo entrega. `frente` e `frentes` são o estado de partida;
// o ctx devolvido guarda em `saida` e `avisos` o que a extensão escreveu, em `gravados` cada gravarCampos
// ({frente, secao}) e em `chamadas` cada git/gh (que respondem código 0 e saída vazia, salvo `git`/`gh` dados).
// `vivas`: as sessões que `donaViva` dá como vivas (padrão: só a do ctx).
export function ctxFalso({
  extensao = 'teste', config = {}, configDoProjeto = null, frente = null, frentes = [], sessaoId = SESSAO,
  raiz = path.join(os.tmpdir(), 'loja'), dirEstado = null, git = null, gh = null, vivas = [sessaoId], ...extra
} = {}) {
  const estado = new Map();
  for (const f of [...frentes, ...(frente ? [frente] : [])]) estado.set(f.nome, structuredClone(f));
  const saida = [];
  const avisos = [];
  const gravados = [];
  const chamadas = [];
  const falso = programa => (args, opcoes = {}) => {
    chamadas.push({ programa, args, opcoes });
    return { codigo: 0, saida: '', erro: '' };
  };
  return {
    extensao,
    config: copia(config),
    configDoProjeto: copia(configDoProjeto),
    raiz,
    dirEstado,
    sessaoId,
    cwd: raiz,
    env: {},
    escrever: t => { saida.push(t); },
    avisar: t => { avisos.push(t); },
    frente: copia(frente),
    frentes: () => [...estado.values()].map(copia),
    donaViva: f => Boolean(f?.dona) && vivas.includes(f.dona),
    async gravarCampos(nome, campos) {
      const f = estado.get(nome);
      if (!f) throw new ErroDeUso(`Não achei a frente ${nome} no estado.\nPróximo passo: rode ah board para ver as frentes abertas`);
      const atual = eObjeto(f.extensoes?.[extensao]) ? f.extensoes[extensao] : {};
      const dados = typeof campos === 'function' ? campos(structuredClone(atual), { frentes: [...estado.values()].map(copia) }) : campos;
      if (!eObjeto(dados)) throw new TypeError('gravarCampos: campos deve ser um objeto {campo: valor} ou uma função que o devolve');
      const secao = { ...atual, ...JSON.parse(JSON.stringify(dados)) };
      for (const k of Object.keys(dados)) if (dados[k] === undefined) delete secao[k];
      f.extensoes = { ...(f.extensoes ?? {}), [extensao]: secao };
      gravados.push({ frente: nome, secao: structuredClone(secao) });
      return structuredClone(secao);
    },
    git: git ?? falso('git'),
    gh: gh ?? falso('gh'),
    ErroDeUso,
    saida,
    avisos,
    gravados,
    chamadas,
    ...extra,
  };
}

// ---------------------------------------------------------------- projeto descartável

const PASTAS = new Set();
process.on('exit', () => { for (const p of PASTAS) fs.rmSync(p, { recursive: true, force: true }); });

// gh de mentira: diz o login e responde vazio, com sucesso, a todo o resto.
const GH_FALSO = `const a = process.argv.slice(2);
if (a[0] === 'api' && a[1] === 'user') process.stdout.write(JSON.stringify({ login: 'ana-souza' }) + '\\n');
`;

// Ponto de entrada do projeto de teste (o open exige tools/ah no ramo base).
const TOOLS_AH = `#!/bin/sh
principal=$(git -C "$(dirname "$0")" worktree list --porcelain | sed -n 's/^worktree //p' | head -n 1)
exec node "$principal/.harness/nucleo/bin/ah.mjs" "$@"
`;

// Projeto git descartável (ramos main, dev e stage, remoto local, checkout na dev, tools/ah) com uma cópia deste
// núcleo em .harness/nucleo/, a configuração `{projeto: 'loja', ...config, extensoes}`, as pastas de extensão dadas em
// `pastas` ({nome: pasta}) copiadas para .harness/extensoes/<nome>/ e tudo commitado. Estado, worktrees e gh são
// do teste: nada toca o estado real da máquina. A sessão padrão é `sessao-teste-0001`; a sigla da máquina é `as`.
export function projetoDeTeste({ extensoes = {}, pastas = {}, config = {} } = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ah-extensao-')));
  PASTAS.add(base);
  const raiz = path.join(base, 'repo');
  const estado = path.join(base, 'estado');
  fs.writeFileSync(path.join(base, 'gitconfig'), '');
  fs.writeFileSync(path.join(base, 'gh-falso.mjs'), GH_FALSO);
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: path.join(base, 'gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'ana-souza',
    GIT_AUTHOR_EMAIL: 'ana@exemplo.test',
    GIT_COMMITTER_NAME: 'ana-souza',
    GIT_COMMITTER_EMAIL: 'ana@exemplo.test',
    AH_ESTADO: estado,
    AH_WORKTREES: path.join(base, 'wt'),
    AH_SESSAO: SESSAO,
    AH_GH: path.join(base, 'gh-falso.mjs'),
  };
  for (const v of ['CLAUDE_CODE_SESSION_ID', 'AH_PID_AGENTE', 'AH_GUARD', 'AH_PESADO_ANINHADO']) delete env[v];
  const git = (args, { cwd = raiz } = {}) => {
    try {
      return { codigo: 0, saida: execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' }), erro: '' };
    } catch (e) {
      return { codigo: e.status ?? 1, saida: String(e.stdout ?? ''), erro: String(e.stderr ?? '') };
    }
  };
  const exigir = (args, cwd = raiz) => {
    const r = git(args, { cwd });
    if (r.codigo !== 0) throw new Error(`git ${args.join(' ')} falhou: ${r.erro}`);
  };

  fs.mkdirSync(raiz);
  exigir(['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(raiz, 'README.md'), 'projeto de teste\n');
  exigir(['add', 'README.md']);
  exigir(['commit', '-q', '-m', 'commit inicial']);
  exigir(['branch', 'dev']);
  exigir(['branch', 'stage']);
  exigir(['switch', '-q', 'dev']);
  exigir(['init', '-q', '--bare', '-b', 'main', path.join(base, 'remoto.git')], base);
  exigir(['remote', 'add', 'origin', path.join(base, 'remoto.git')]);

  fs.cpSync(NUCLEO, path.join(raiz, '.harness', 'nucleo'), { recursive: true, filter: o => !/\.test\.mjs$/.test(o) && path.basename(o) !== 'node_modules' });
  for (const [nome, pasta] of Object.entries(pastas)) {
    fs.cpSync(pasta, path.join(raiz, '.harness', 'extensoes', nome), { recursive: true });
  }
  fs.mkdirSync(path.join(raiz, '.harness', 'extensoes'), { recursive: true });
  fs.writeFileSync(path.join(raiz, '.harness', 'config.json'), `${JSON.stringify({ projeto: 'loja', ...config, extensoes }, null, 2)}\n`);
  fs.writeFileSync(path.join(raiz, '.gitignore'), 'node_modules/\n');
  fs.mkdirSync(path.join(raiz, 'tools'));
  fs.writeFileSync(path.join(raiz, 'tools', 'ah'), TOOLS_AH, { mode: 0o755 });
  exigir(['add', '--', '.harness', '.gitignore', 'tools/ah']);
  exigir(['commit', '-q', '-m', 'chore: harness de teste']);
  exigir(['push', '-q', 'origin', 'main', 'dev', 'stage']);
  fs.mkdirSync(estado, { recursive: true });
  fs.writeFileSync(path.join(estado, 'maquina.json'), JSON.stringify({ sigla: 'as', login: 'ana-souza' }));

  const ah = (args, { cwd = raiz, env: extra = {}, entrada } = {}) => {
    const r = spawnSync(process.execPath, [path.join(raiz, '.harness', 'nucleo', 'bin', 'ah.mjs'), ...args], {
      cwd, env: { ...env, ...extra }, encoding: 'utf8', input: entrada,
    });
    return { codigo: r.status ?? 1, saida: r.stdout ?? '', erro: r.stderr ?? '' };
  };
  const dirEstado = path.join(estado, 'loja');
  return {
    raiz,
    dirEstado,
    env,
    git,
    ah,
    // Passa uma ação pelas travas, como o gancho do Claude Code faria antes da ferramenta. `acao` é o texto de um
    // comando de shell ou {arquivo} para uma edição. Devolve {recusada, mensagem, codigo}.
    gancho(acao, { cwd = raiz, env: extra = {} } = {}) {
      const comando = typeof acao === 'string';
      const evento = {
        session_id: extra.AH_SESSAO ?? env.AH_SESSAO,
        hook_event_name: 'PreToolUse',
        cwd,
        tool_name: comando ? 'Bash' : 'Write',
        tool_input: comando ? { command: acao } : { file_path: acao.arquivo, content: '' },
      };
      const r = ah(['gancho', 'claude-code'], { cwd, env: extra, entrada: JSON.stringify(evento) });
      return { recusada: r.codigo === 2, mensagem: r.erro.trim(), codigo: r.codigo };
    },
    // O registro da frente no estado (com `extensoes`), ou null.
    frente(nome) {
      try { return JSON.parse(fs.readFileSync(path.join(dirEstado, 'frentes', `${nome}.json`), 'utf8')); } catch { return null; }
    },
    limpar() {
      fs.rmSync(base, { recursive: true, force: true });
      PASTAS.delete(base);
    },
  };
}
