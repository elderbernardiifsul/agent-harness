// Resumo injetado no começo da sessão: curto, para não gastar o contexto do agente.
import { idCurto } from './sessao.mjs';

export const LIMITE_RESUMO = 1200;

// Uma linha só: quebras e controles viram espaço; texto longo é cortado com reticências.
function linha(texto, limite) {
  const t = String(texto ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length > limite ? `${t.slice(0, limite - 1)}…` : t;
}

const nomeDaFrente = f => (f && typeof f === 'object' ? f.nome : f);

function linhaDaSuaFrente(sessao, frentes) {
  const nome = nomeDaFrente(sessao.frente);
  if (!nome) return 'Sua frente: nenhuma: `ah open <nome>` para abrir uma.';
  const f = frentes.find(x => x.nome === nome);
  if (!f) return `Sua frente: ${linha(nome, 49)} (não achei no estado; confira em tools/ah board).`;
  const partes = [`${linha(f.id, 20)} ${linha(f.nome, 49)}`, `worktree: ${linha(f.worktree, 200)}`];
  if (f.plano) partes.push(`plano: ${linha(f.plano, 120)}`);
  return `Sua frente: ${partes.join(' · ')}`;
}

function textoDaBase(config, baseLimpa) {
  const base = linha(config.git.base, 40);
  if (baseLimpa === true) return `Base ${base}: checkout principal limpo.`;
  if (baseLimpa === false) return `Base ${base}: checkout principal com mudanças não commitadas; não use git add -A nele.`;
  return `Base ${base}: não consegui conferir o checkout principal.`;
}

export function montarResumo({ sessao, frentes = [], config, baseLimpa }) {
  const minha = nomeDaFrente(sessao.frente);
  const outras = frentes.filter(f => f.nome !== minha)
    .map(f => `${linha(f.id, 20)} ${linha(f.nome, 49)} (${f.dona ? `dona ${idCurto(f.dona)}` : 'sem dona'})`);
  const nomes = config.git.protegidos.map(r => linha(r, 40));
  const protegidos = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : (nomes[0] ?? 'ramo protegido');
  const cabeca = [
    `Sessão ${linha(idCurto(sessao.id), 8)} (${linha(sessao.papel ?? 'executor', 20)}) no harness.`,
    linhaDaSuaFrente(sessao, frentes),
  ];
  const cauda = [
    textoDaBase(config, baseLimpa),
    `Regras: trabalhe no worktree da sua frente; git add só por caminho; push e merge em ${protegidos} só com ordem do executivo.`,
    'Mais: docs/agents/sessoes-paralelas.md · tools/ah board',
  ];
  const montar = n => {
    let lista = 'nenhuma';
    if (outras.length) {
      lista = outras.slice(0, n).join('; ');
      if (n < outras.length) lista += `${n ? '; ' : ''}e mais ${outras.length - n} frentes (tools/ah board)`;
    }
    return [...cabeca, `Outras frentes: ${lista}`, ...cauda].join('\n');
  };
  for (let n = outras.length; n > 0; n--) {
    const t = montar(n);
    if (t.length <= LIMITE_RESUMO) return t;
  }
  const t = montar(0);
  // Os campos já vêm cortados; a garantia final vale para configurações absurdas.
  return t.length <= LIMITE_RESUMO ? t : `${t.slice(0, LIMITE_RESUMO - cauda[2].length - 2)}…\n${cauda[2]}`;
}
