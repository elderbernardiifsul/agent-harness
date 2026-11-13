import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export class ErroDeUso extends Error {
  constructor(saida) {
    super(saida.split('\n')[0]);
    this.name = 'ErroDeUso';
    this.saida = saida;
  }
}

// Checkout principal: primeira entrada de `git worktree list --porcelain`.
export function raizPrincipal(cwd) {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    throw new ErroDeUso(
      `Não é um repositório git: ${cwd}\nPróximo passo: entre na pasta do projeto (ou rode \`git init\`) e tente de novo.`,
    );
  }
  const linha = r.stdout.split('\n').find(l => l.startsWith('worktree '));
  if (!linha) throw new ErroDeUso(`Não achei o checkout principal em ${cwd}\nPróximo passo: rode \`git worktree list\` e confira o repositório.`);
  return linha.slice('worktree '.length).trim();
}

export function baseDeEstado(env, plataforma, casa) {
  if (env.AH_ESTADO) return env.AH_ESTADO;
  if (plataforma === 'win32') return path.join(env.LOCALAPPDATA ?? path.join(casa, 'AppData', 'Local'), 'agent-harness', 'estado');
  if (plataforma === 'darwin') return path.join(casa, 'Library', 'Application Support', 'agent-harness');
  return path.join(env.XDG_STATE_HOME ?? path.join(casa, '.local', 'state'), 'agent-harness');
}

// AH_ESTADO já é a base; nos demais casos o sufixo de agent-harness vem de baseDeEstado.
export function dirEstado(projeto, env, plataforma, casa) {
  return path.join(baseDeEstado(env, plataforma, casa), projeto);
}

export function arquivoDaMaquina(env, plataforma, casa) {
  return path.join(baseDeEstado(env, plataforma, casa), 'maquina.json');
}

export function dirWorktrees(config, env, plataforma, casa) {
  if (config.worktrees?.dir) return config.worktrees.dir;
  if (env.AH_WORKTREES) return env.AH_WORKTREES;
  let cache;
  if (plataforma === 'win32') cache = env.LOCALAPPDATA ?? path.join(casa, 'AppData', 'Local');
  else if (plataforma === 'darwin') cache = path.join(casa, 'Library', 'Caches');
  else cache = env.XDG_CACHE_HOME ?? path.join(casa, '.cache');
  return path.join(cache, 'agent-harness', config.projeto, 'wt');
}

const modDe = plataforma => (plataforma === 'win32' ? path.win32 : path.posix);

// Caminho real para comparar caminhos escritos de jeitos diferentes (link simbólico, `..`, `/private/var` do
// macOS, caixa no Windows): os componentes são resolvidos na ordem, cada um pelo caminho real enquanto existir
// (o `..` depois de um link volta da pasta real); do primeiro que não existe em diante, só se juntam.
// No Windows, em minúsculas. Fora dele, `\` é caractere de nome, não separador. Link simbólico pendurado
// (destino que ainda não existe) é seguido pelo `readlink`: o arquivo nasceria no destino, não no link.
const SALTOS_DE_LINK = 40;
export function normalizarCaminho(p, plataforma = process.platform) {
  return normalizar(String(p), plataforma, SALTOS_DE_LINK);
}

function normalizar(p, plataforma, saltos) {
  const mod = modDe(plataforma);
  const bruto = mod.isAbsolute(p) ? p : `${process.cwd()}${mod.sep}${p}`;
  const raiz = mod.parse(bruto).root || mod.sep;
  const real = c => {
    try { return fs.realpathSync(c); } catch { return null; }
  };
  // Destino de um link simbólico que realpath não resolve (pendurado), ou null.
  const pendurado = c => {
    try {
      if (!fs.lstatSync(c).isSymbolicLink()) return null;
      const alvo = fs.readlinkSync(c);
      return mod.isAbsolute(alvo) ? alvo : `${mod.dirname(c)}${mod.sep}${alvo}`;
    } catch { return null; }
  };
  let atual = real(raiz) ?? raiz;
  let existe = atual !== null && fs.existsSync(atual);
  for (const parte of bruto.slice(raiz.length).split(plataforma === 'win32' ? /[\\/]+/ : /\/+/)) {
    if (parte === '' || parte === '.') continue;
    if (parte === '..') {
      atual = mod.dirname(atual);
      if (!existe) {
        const r = real(atual);
        if (r !== null) { existe = true; atual = r; }
      }
      continue;
    }
    const proximo = mod.join(atual, parte);
    let r = existe ? real(proximo) : null;
    if (r === null && existe && saltos > 0) {
      const alvo = pendurado(proximo);
      if (alvo !== null) {
        atual = normalizar(alvo, plataforma, saltos - 1);
        const ja = real(atual);
        existe = ja !== null;
        if (existe) atual = ja;
        continue;
      }
    }
    if (r === null) existe = false;
    atual = r ?? proximo;
  }
  return plataforma === 'win32' ? atual.toLowerCase() : atual;
}

// `p` está dentro de `pasta` (ou é ela)? Puro, pelo `path.relative` da plataforma; no Windows sem
// diferenciar caixa. Quem chama normaliza os dois antes (normalizarCaminho).
export function dentroDe(p, pasta, plataforma = process.platform) {
  const mod = modDe(plataforma);
  const [a, b] = plataforma === 'win32' ? [String(p).toLowerCase(), String(pasta).toLowerCase()] : [String(p), String(pasta)];
  const rel = mod.relative(b, a);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${mod.sep}`) && !mod.isAbsolute(rel));
}
