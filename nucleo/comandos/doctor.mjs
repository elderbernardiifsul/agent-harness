// `ah doctor`: diz se o projeto está bem preparado. Cada verificação é uma função isolada
// `(amb, ctx) -> item | [item] | null`; uma exceção numa vira uma falha e as outras seguem.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { arquivoDaMaquina, dirEstado as caminhoDoEstado } from '../lib/caminhos.mjs';
import { ErroDeConfig, carregarConfig } from '../lib/config.mjs';
import { ErroDeEstado, lerJson } from '../lib/estado.mjs';
import { idsNoHistorico, listarFrentes, siglaValida } from '../lib/frente.mjs';
import { existeRamo, git } from '../lib/git.mjs';
import { gh, protecaoDoRamo, repoAtual } from '../lib/github.mjs';
import { mesclarGanchos } from './init.mjs';

export const descricao = 'confere se o projeto está bem preparado';
export const requisitos = { config: false, sessao: false, repositorio: false };

const NUCLEO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIM_DO_GANCHO = 'tools/ah gancho claude-code';
const ARQUIVO_CLAUDE = path.join('.claude', 'settings.json');
const HISTORICO = path.join('docs', 'agents', 'historico-das-frentes.md');
const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const ok = item => ({ item, estado: 'ok' });
const aviso = (item, fazer) => ({ item, estado: 'aviso', fazer });
const falha = (item, fazer) => ({ item, estado: 'falha', fazer });
const usaClaude = amb => amb.config?.agentes?.includes('claude-code') ?? false;
const comparar = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
const versao = t => String(t).split('.').map(Number);

function verificacao(item, fn) { fn.item = item; return fn; }

// Lê o `.claude/settings.json` do projeto: {settings} ou {erro}.
function lerSettings(raiz) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(raiz, ARQUIVO_CLAUDE), 'utf8'));
    return eObjeto(s) ? { settings: s } : { erro: 'não é um objeto JSON' };
  } catch (e) {
    return { erro: e.code === 'ENOENT' ? 'não existe' : 'não pôde ser lido como JSON' };
  }
}

function lerModelo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(NUCLEO, '..', 'modelos', 'claude-code', 'ganchos.json'), 'utf8'));
  } catch {
    return null; // a cópia instalada no projeto não leva os modelos
  }
}

const comandoDoPre = settings => {
  for (const grupo of settings?.hooks?.PreToolUse ?? []) {
    for (const h of eObjeto(grupo) && Array.isArray(grupo.hooks) ? grupo.hooks : []) {
      if (eObjeto(h) && typeof h.command === 'string' && h.command.trim().endsWith(FIM_DO_GANCHO)) return h.command;
    }
  }
  return null;
};

// Resultado de `gh auth status`, uma vez só.
function ghPronto(amb, ctx) {
  ctx.gh ??= gh(['auth', 'status'], { cwd: amb.raiz ?? amb.cwd, env: amb.env }).codigo === 0;
  return ctx.gh;
}

function arquivosDeEstado(dirEstado) {
  const lista = [];
  for (const pasta of ['sessoes', 'frentes']) {
    let nomes = [];
    try { nomes = fs.readdirSync(path.join(dirEstado, pasta)); } catch { /* pasta ausente: nada a ler */ }
    for (const n of nomes) if (n.endsWith('.json') && !n.startsWith('.')) lista.push(path.join(dirEstado, pasta, n));
  }
  return lista;
}

export const VERIFICACOES = [
  verificacao('Node 22 ou mais novo', () => {
    const maior = Number(process.versions.node.split('.')[0]);
    return maior >= 22 ? ok('Node 22 ou mais novo') : falha('Node 22 ou mais novo', `o Node é ${process.versions.node}; instale o Node 22 ou mais novo`);
  }),

  verificacao('git presente', amb => (git(['--version'], { env: amb.env }).codigo === 0
    ? ok('git presente') : falha('git presente', 'instale o git e deixe-o no PATH'))),

  verificacao('Shell POSIX', () => (process.platform !== 'win32'
    ? ok('Shell POSIX') : aviso('Shell POSIX', 'no Windows nativo as travas de comando não valem; use o WSL2'))),

  verificacao('.harness/config.json válido', amb => {
    const nome = '.harness/config.json válido';
    if (!amb.raiz) return falha(nome, 'entre na pasta do projeto: aqui não é um repositório git');
    try {
      carregarConfig(amb.raiz);
      return ok(nome);
    } catch (e) {
      if (!(e instanceof ErroDeConfig)) throw e;
      if (e.erros.every(x => x.motivo.includes('ENOENT'))) return falha(nome, 'não há .harness/config.json; rode ah init');
      return falha(nome, `${e.erros.map(x => `${x.campo} (${x.motivo})`).join('; ')}; corrija .harness/config.json`);
    }
  }),

  verificacao('Cópia do núcleo (MANIFEST.json)', amb => {
    const nome = 'Cópia do núcleo (MANIFEST.json)';
    if (!amb.config) return null;
    const arquivo = path.join(amb.raiz, '.harness', 'nucleo', 'MANIFEST.json');
    let m;
    try { m = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return falha(nome, 'não achei um .harness/nucleo/MANIFEST.json legível; rode ah init'); }
    if (!eObjeto(m) || !/^\d+\.\d+\.\d+$/.test(m.versao ?? '')) return falha(nome, 'o MANIFEST.json não tem uma versão válida; rode ah init --sobrescrever');
    if (comparar(versao(m.versao), versao(amb.config.harnessMinimo)) < 0) {
      return falha(nome, `o núcleo copiado é ${m.versao} e o projeto pede ${amb.config.harnessMinimo} ou mais novo; rode ah init --sobrescrever a partir do clone atualizado`);
    }
    return ok(nome);
  }),

  verificacao('Arquivos de estado legíveis', amb => {
    const nome = 'Arquivos de estado legíveis';
    if (!amb.dirEstado) return null;
    const ruins = [];
    for (const arq of arquivosDeEstado(amb.dirEstado)) {
      try { lerJson(arq); } catch (e) { if (e instanceof ErroDeEstado) ruins.push(arq); else throw e; }
    }
    return ruins.length ? falha(nome, `${ruins.join(', ')} ilegível; apague ou conserte o arquivo`) : ok(nome);
  }),

  verificacao('Sigla sem choque', amb => {
    const nome = 'Sigla sem choque';
    if (!amb.config) return null;
    const arquivo = arquivoDaMaquina(amb.env, process.platform, os.homedir());
    let maquina;
    try { maquina = lerJson(arquivo, null); } catch (e) {
      if (e instanceof ErroDeEstado) return falha(nome, `${arquivo} ilegível; apague ou conserte o arquivo e rode ah init --sigla <sigla>`);
      throw e;
    }
    if (!siglaValida(maquina?.sigla)) return falha(nome, 'esta máquina não tem sigla; rode ah init --sigla <sigla>, com 2 a 4 letras minúsculas');
    const { sigla, login } = maquina;
    if (typeof login !== 'string' || login === '' || login === 'local') return ok(nome);
    let texto = '';
    try { texto = fs.readFileSync(path.join(amb.raiz, HISTORICO), 'utf8'); } catch { /* sem histórico: sem choque */ }
    for (const linha of texto.split('\n')) {
      const ids = idsNoHistorico(linha, sigla);
      const autor = /@([A-Za-z0-9][A-Za-z0-9-]*)/.exec(linha)?.[1];
      if (ids.length && autor && autor.toLowerCase() !== login.toLowerCase()) {
        return falha(nome, `a sigla ${sigla} já foi usada por @${autor} (${sigla}-${ids[0]}) no histórico; rode ah init --sigla <outra sigla>`);
      }
    }
    return ok(nome);
  }),

  verificacao('gh presente e autenticado', (amb, ctx) => (ghPronto(amb, ctx)
    ? ok('gh presente e autenticado')
    : aviso('gh presente e autenticado', 'sem o gh não há comentário em ticket nem proteção de ramo; instale o gh e rode gh auth login'))),

  verificacao('Ramo base e ramos protegidos', amb => {
    const nome = 'Ramo base e ramos protegidos';
    if (!amb.config) return null;
    const faltam = [amb.config.git.base, ...amb.config.git.protegidos].filter(r => !existeRamo(amb.raiz, r, { env: amb.env }));
    return faltam.length ? falha(nome, `faltam os ramos ${faltam.join(', ')}; rode ah init`) : ok(nome);
  }),

  verificacao('Ganchos do Claude Code instalados', amb => {
    const nome = 'Ganchos do Claude Code instalados';
    if (!amb.config || !usaClaude(amb)) return null;
    const { settings, erro } = lerSettings(amb.raiz);
    if (!settings) return falha(nome, `${ARQUIVO_CLAUDE.replaceAll('\\', '/')} ${erro}; rode ah init`);
    const modelo = lerModelo();
    if (modelo) {
      const completo = JSON.stringify(mesclarGanchos(settings, modelo)) === JSON.stringify(settings);
      return completo ? ok(nome) : falha(nome, 'faltam ou diferem os ganchos que o init instala; rode ah init');
    }
    // Cópia instalada: sem o modelo do init, confere ao menos o gancho que impede o push.
    return comandoDoPre(settings) ? ok(nome) : falha(nome, 'falta o gancho PreToolUse do harness; rode ah init');
  }),

  verificacao('Gancho responde', amb => {
    const nome = 'Gancho responde';
    if (!amb.config || !usaClaude(amb)) return null;
    const { settings } = lerSettings(amb.raiz);
    const comando = settings ? comandoDoPre(settings) : null;
    if (!comando) return falha(nome, 'não achei o gancho PreToolUse do harness; rode ah init');
    const alvo = amb.config.git.protegidos[0] ?? amb.config.git.base;
    const evento = {
      hook_event_name: 'PreToolUse', session_id: 'doctor-ensaio', cwd: amb.raiz, tool_name: 'Bash',
      tool_input: { command: `git push ${amb.config.git.remoto} ${alvo}` },
    };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-doctor-'));
    try {
      const env = { ...amb.env, CLAUDE_PROJECT_DIR: amb.raiz, AH_ESTADO: tmp, AH_SESSAO: 'doctor-ensaio' };
      const r = process.platform === 'win32'
        ? spawnSync(process.execPath, [path.join(amb.raiz, '.harness', 'nucleo', 'bin', 'ah.mjs'), 'gancho', 'claude-code'], { cwd: amb.raiz, env, input: JSON.stringify(evento), encoding: 'utf8', timeout: 30000 })
        : spawnSync('sh', ['-c', comando], { cwd: amb.raiz, env, input: JSON.stringify(evento), encoding: 'utf8', timeout: 30000 });
      if (r.status === 2) return ok(nome);
      const motivo = r.error ? String(r.error.message) : `saiu com código ${r.status}`;
      return falha(nome, `o gancho não recusou \`git push ${amb.config.git.remoto} ${alvo}\` (${motivo}); rode ah init --sobrescrever e confira tools/ah`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }),

  verificacao('Proteção no servidor', (amb, ctx) => {
    if (!amb.config) return null;
    const nome = 'Proteção no servidor';
    if (!ghPronto(amb, ctx)) return aviso(nome, 'sem o gh não consegui conferir a proteção dos ramos; só a trava local protege');
    const o = { cwd: amb.raiz, env: amb.env };
    const repo = amb.config.github?.repo ?? repoAtual(o);
    return amb.config.git.protegidos.map(ramo => {
      const item = `Proteção de ${ramo} no servidor`;
      const r = protecaoDoRamo(ramo, { ...o, repo });
      if (r === 'protegido') return ok(item);
      if (r === 'sem-protecao') return aviso(item, 'sem proteção no servidor: só a trava local protege; rode ah init');
      return aviso(item, `não consegui conferir a proteção de ${ramo}; confira o login do gh e o acesso ao repositório`);
    });
  }),

  verificacao('CI com comando de teste', amb => {
    if (!amb.config) return null;
    const c = amb.config.ci.comandoDeTeste;
    return typeof c === 'string' && c ? ok('CI com comando de teste')
      : aviso('CI com comando de teste', 'defina ci.comandoDeTeste em .harness/config.json e rode ah init');
  }),

  verificacao('Frentes com worktree', amb => {
    if (!amb.dirEstado) return null;
    let frentes;
    try { frentes = listarFrentes(amb.dirEstado); } catch (e) {
      if (e instanceof ErroDeEstado) return null; // o item dos arquivos de estado já acusou
      throw e;
    }
    const sumidas = frentes.filter(f => f.estado === 'ativa' && typeof f.worktree === 'string' && !fs.existsSync(f.worktree));
    if (!sumidas.length) return ok('Frentes com worktree');
    return sumidas.map(f => aviso(`Frente ${f.nome}`, `o worktree ${f.worktree} não existe; recrie-o ou encerre a frente com ah close ${f.nome}`));
  }),
];

function rodar(amb) {
  const ctx = {};
  const itens = [];
  for (const v of VERIFICACOES) {
    try {
      const r = v(amb, ctx);
      if (r) itens.push(...(Array.isArray(r) ? r : [r]));
    } catch (e) {
      itens.push(falha(v.item, `erro interno: ${String(e?.message ?? e).split('\n')[0]}`));
    }
  }
  return itens;
}

const ROTULO = { ok: 'ok     ', aviso: 'aviso  ', falha: 'FALHOU ' };

export async function executar(args, amb) {
  const completo = { ...amb };
  if (amb.raiz && !amb.dirEstado && amb.config) completo.dirEstado = caminhoDoEstado(amb.config.projeto, amb.env, process.platform, os.homedir());
  if (amb.raiz && !amb.config) {
    try { completo.config = carregarConfig(amb.raiz); } catch { /* a verificação da configuração acusa */ }
  }
  if (completo.config && !completo.dirEstado) completo.dirEstado = caminhoDoEstado(completo.config.projeto, amb.env, process.platform, os.homedir());
  const itens = rodar(completo);
  const falhas = itens.filter(i => i.estado === 'falha').length;
  const avisos = itens.filter(i => i.estado === 'aviso').length;
  if (args.includes('--json')) {
    amb.escrever(`${JSON.stringify({ itens: itens.map(i => ({ item: i.item, estado: i.estado, fazer: i.fazer ?? null })), falhas, avisos })}\n`);
  } else {
    for (const i of itens) amb.escrever(`${ROTULO[i.estado]} ${i.item}${i.fazer ? `: ${i.fazer}` : ''}\n`);
    amb.escrever(falhas || avisos ? `${falhas} falha(s), ${avisos} aviso(s).\n` : 'Tudo certo.\n');
  }
  return falhas ? 1 : 0;
}
