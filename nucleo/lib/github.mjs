import { spawnSync } from 'node:child_process';

const TEMPO_LIMITE_MS = 15000;

// Executa o gh; se env.AH_GH termina em .mjs, executa esse arquivo com o Node
// (é como os testes trocam o gh). Nunca lança; gh ausente ou que passa de `timeoutMs`
// (padrão de 15 s) devolve código 127; no prazo o processo é morto com SIGKILL, que não se ignora.
export function gh(args, { cwd, env = process.env, entrada, timeoutMs = TEMPO_LIMITE_MS } = {}) {
  const alvo = env.AH_GH;
  const [cmd, lista] = alvo && alvo.endsWith('.mjs') ? [process.execPath, [alvo, ...args]] : [alvo || 'gh', args];
  const r = spawnSync(cmd, lista, { cwd, env, encoding: 'utf8', input: entrada, timeout: timeoutMs, killSignal: 'SIGKILL' });
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

// O corpo vai pela entrada padrão, nunca por argumento. Devolve o url do comentário que o gh imprime (com o
// `issuecomment-<n>`), `true` se deu certo sem url, ou `false`.
export function comentar(ticket, corpo, o = {}) {
  const r = gh(['issue', 'comment', String(ticket), '--body-file', '-'], { ...o, entrada: corpo });
  if (r.codigo !== 0) return false;
  return r.saida.split('\n').map(l => l.trim()).find(l => /^https?:\/\//.test(l)) ?? true;
}

// gh issue edit <ticket> ...args (ex.: ['--add-assignee', '@me', '--add-label', 'em-andamento']).
export function editarTicket(ticket, args, o = {}) {
  return gh(['issue', 'edit', String(ticket), ...args], o).codigo === 0;
}

// Cria (ou atualiza, com --force) o rótulo de reserva.
export function criarRotulo(rotulo, o = {}) {
  return gh(['label', 'create', rotulo, '--color', 'FBCA04', '--description', 'reservado por uma frente do agent-harness', '--force'], o).codigo === 0;
}

const CORPO_DA_PROTECAO = {
  required_status_checks: null,
  enforce_admins: true,
  required_pull_request_reviews: { required_approving_review_count: 0 },
  restrictions: null,
};

const caminhoDaProtecao = (repo, ramo) => `repos/${repo}/branches/${ramo.split('/').map(encodeURIComponent).join('/')}/protection`;

// Motivo curto de uma falha do gh: a `message` do JSON da API, se houver; senão a primeira linha do erro.
function motivoDe(r) {
  for (const texto of [r.saida, r.erro]) {
    try {
      const m = JSON.parse(texto)?.message;
      if (typeof m === 'string' && m.trim()) return m.trim().split('\n')[0].slice(0, 200);
    } catch { /* não é JSON */ }
  }
  return ((r.erro || r.saida).trim().split('\n')[0] ?? '').slice(0, 200) || `o gh saiu com código ${r.codigo}`;
}

// Protege o ramo no servidor: PR obrigatório (sem exigir aprovação) e valendo para administradores.
// ATENÇÃO: o PUT substitui as regras que já existirem; quem chama consulta antes.
// `o.repo` (opcional) é o dono/nome; sem ele vale o repositório atual. Nunca lança.
export function protegerRamo(ramo, o = {}) {
  const repo = o.repo ?? repoAtual(o);
  if (!repo) return { ok: false, motivo: 'não consegui descobrir o repositório do GitHub' };
  const r = gh(['api', '-X', 'PUT', caminhoDaProtecao(repo, ramo), '--input', '-'], { ...o, entrada: JSON.stringify(CORPO_DA_PROTECAO) });
  return r.codigo === 0 ? { ok: true } : { ok: false, motivo: motivoDe(r) };
}

// {estado: 'protegido' | 'sem-protecao' | 'desconhecido', motivo?}. Só 404 "Branch not protected" é sem-protecao.
export function consultarProtecao(ramo, o = {}) {
  const repo = o.repo ?? repoAtual(o);
  if (!repo) return { estado: 'desconhecido', motivo: 'não consegui descobrir o repositório do GitHub' };
  const r = gh(['api', caminhoDaProtecao(repo, ramo)], o);
  if (r.codigo === 0) return { estado: 'protegido' };
  if (/Branch not protected/i.test(`${r.erro}\n${r.saida}`)) return { estado: 'sem-protecao' };
  return { estado: 'desconhecido', motivo: motivoDe(r) };
}

export function protecaoDoRamo(ramo, o = {}) {
  return consultarProtecao(ramo, o).estado;
}
