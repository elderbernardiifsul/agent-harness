import { spawnSync } from 'node:child_process';
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
