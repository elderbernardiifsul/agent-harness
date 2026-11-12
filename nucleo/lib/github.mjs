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

const CORPO_DA_PROTECAO = {
  required_status_checks: null,
  enforce_admins: true,
  required_pull_request_reviews: { required_approving_review_count: 0 },
  restrictions: null,
};

const primeiraLinha = r => ((r.erro || r.saida).trim().split('\n')[0] ?? '').slice(0, 200) || `o gh saiu com código ${r.codigo}`;

// Protege o ramo no servidor: PR obrigatório (sem exigir aprovação) e valendo para administradores.
// `o.repo` (opcional) é o dono/nome; sem ele vale o repositório atual. Nunca lança.
export function protegerRamo(ramo, o = {}) {
  const repo = o.repo ?? repoAtual(o);
  if (!repo) return { ok: false, motivo: 'não consegui descobrir o repositório do GitHub' };
  const r = gh(['api', '-X', 'PUT', `repos/${repo}/branches/${ramo}/protection`, '--input', '-'], { ...o, entrada: JSON.stringify(CORPO_DA_PROTECAO) });
  return r.codigo === 0 ? { ok: true } : { ok: false, motivo: primeiraLinha(r) };
}

// 'protegido' | 'sem-protecao' (404 "Branch not protected") | 'desconhecido' (sem direito, sem rede, outro erro).
export function protecaoDoRamo(ramo, o = {}) {
  const repo = o.repo ?? repoAtual(o);
  if (!repo) return 'desconhecido';
  const r = gh(['api', `repos/${repo}/branches/${ramo}/protection`], o);
  if (r.codigo === 0) return 'protegido';
  return /Branch not protected/i.test(`${r.erro}\n${r.saida}`) ? 'sem-protecao' : 'desconhecido';
}
