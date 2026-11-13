import { spawnSync } from 'node:child_process';

// Executa o git com lista de argumentos (sem shell). Nunca lança. Processo que não rodou
// ou que morreu por sinal (status nulo, inclusive pelo `timeoutMs`) sai com código 127.
export function git(args, { cwd, env, timeoutMs } = {}) {
  const r = spawnSync('git', args, { cwd, env: env ?? process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...(timeoutMs ? { timeout: timeoutMs } : {}) });
  if (r.error) return { codigo: 127, saida: '', erro: String(r.error.message ?? r.error) };
  if (r.status == null) return { codigo: 127, saida: r.stdout ?? '', erro: r.stderr || `o git morreu (${r.signal ?? 'sem código'})` };
  return { codigo: r.status, saida: r.stdout ?? '', erro: r.stderr ?? '' };
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
