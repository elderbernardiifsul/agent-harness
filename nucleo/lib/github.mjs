import { spawnSync } from 'node:child_process';

// Executa o gh; se env.AH_GH termina em .mjs, executa esse arquivo com o Node
// (é como os testes trocam o gh). Nunca lança; gh ausente devolve código 127.
export function gh(args, { cwd, env = process.env, entrada } = {}) {
  const alvo = env.AH_GH;
  const [cmd, lista] = alvo && alvo.endsWith('.mjs') ? [process.execPath, [alvo, ...args]] : [alvo || 'gh', args];
  const r = spawnSync(cmd, lista, { cwd, env, encoding: 'utf8', input: entrada });
  if (r.error) return { codigo: 127, saida: '', erro: String(r.error.message ?? r.error) };
  return { codigo: r.status ?? 1, saida: r.stdout ?? '', erro: r.stderr ?? '' };
}

export function loginAtual(o = {}) {
  const r = gh(['api', 'user'], o);
  if (r.codigo !== 0) return null;
  try {
    return JSON.parse(r.saida).login ?? null;
  } catch {
    return null;
  }
}

export function repoAtual(o = {}) {
  const r = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], o);
  const nome = r.saida.trim();
  return r.codigo === 0 && /^[^/\s]+\/[^/\s]+$/.test(nome) ? nome : null;
}

// O corpo vai pela entrada padrão, nunca por argumento.
export function comentar(ticket, corpo, o = {}) {
  return gh(['issue', 'comment', String(ticket), '--body-file', '-'], { ...o, entrada: corpo }).codigo === 0;
}
