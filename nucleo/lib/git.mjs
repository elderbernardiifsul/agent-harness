import { spawnSync } from 'node:child_process';

// Executa o git com lista de argumentos (sem shell). Nunca lança.
export function git(args, { cwd, env } = {}) {
  const r = spawnSync('git', args, { cwd, env: env ?? process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { codigo: 127, saida: '', erro: String(r.error.message ?? r.error) };
  return { codigo: r.status ?? 1, saida: r.stdout ?? '', erro: r.stderr ?? '' };
}

export function ramoAtual(cwd, env) {
  const r = git(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd, env });
  return r.codigo === 0 ? r.saida.trim() : null;
}

export function topoDe(cwd, env) {
  const r = git(['rev-parse', '--show-toplevel'], { cwd, env });
  return r.codigo === 0 ? r.saida.trim() : null;
}

export function limpo(cwd, env) {
  const r = git(['status', '--porcelain'], { cwd, env });
  return r.codigo === 0 && r.saida.trim() === '';
}

export function existeRamo(cwd, ramo, { remoto = false, env } = {}) {
  const ref = remoto ? `refs/remotes/${remoto === true ? 'origin' : remoto}/${ramo}` : `refs/heads/${ramo}`;
  return git(['show-ref', '--verify', '--quiet', ref], { cwd, env }).codigo === 0;
}
