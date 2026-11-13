// Resumo injetado no começo da sessão: curto, para não gastar o contexto do agente.
import path from 'node:path';
import { duracaoCurta } from './fila.mjs';
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

export const LIMITE_LINHA_DA_SITUACAO = 200;

// Linhas da situação (avisos, frentes sem dona, sobreposições), cada uma com no máximo 200 caracteres.
function linhasDaSituacao({ semDona = [], sobreposicoes = [], avisos = [] }) {
  const linhas = [];
  const corte = t => linha(t, LIMITE_LINHA_DA_SITUACAO);
  if (avisos.length) linhas.push(corte(`Avisos: ${avisos.map(a => linha(a, 200)).join(' ')}`));
  if (semDona.length) {
    linhas.push(corte(`Sem dona: ${semDona.map(f => `${linha(f.id, 20)} ${linha(f.nome, 49)} (${linha(f.saida, 80)})`).join('; ')}`));
  }
  if (sobreposicoes.length) {
    // Os IDs ficam sempre; a lista de arquivos é que encurta para caber.
    const com = ` com ${linha([...new Set(sobreposicoes.flatMap(s => s.frentes))].join(', '), 80)}`;
    const cabe = LIMITE_LINHA_DA_SITUACAO - 'Sobreposição: '.length - com.length;
    linhas.push(corte(`Sobreposição: ${linha(sobreposicoes.map(s => s.arquivo).join(', '), cabe)}${com}`));
  }
  return linhas;
}

const RODANDO_NO_RESUMO = 3;

// Uma linha sobre a fila de pesado da máquina (o retrato de retratoDaFila), ou null com a fila vazia ou ilegível
// (o quadro e o doctor mostram o erro). No máximo 200 caracteres.
export function linhaDoPesado(retrato) {
  const entradas = Array.isArray(retrato?.entradas) ? retrato.entradas : [];
  if (retrato?.erro || !entradas.length) return null;
  const rodando = entradas.filter(e => e.estado === 'rodando');
  const esperando = entradas.length - rodando.length;
  const quem = e => `senha ${e.senha} (${linha(e.projeto ?? '?', 20)}, ${linha(path.basename(String(e.worktree ?? '?')), 30)}, há ${duracaoCurta(e.haMs)})`;
  let texto = rodando.length ? `rodando ${rodando.slice(0, RODANDO_NO_RESUMO).map(quem).join(', ')}` : 'ninguém rodando';
  if (rodando.length > RODANDO_NO_RESUMO) texto += ` e mais ${rodando.length - RODANDO_NO_RESUMO}`;
  if (esperando) texto += `; ${esperando} esperando`;
  return linha(`Pesado: ${texto} (tools/ah board).`, LIMITE_LINHA_DA_SITUACAO);
}

// `situacao` = {semDona: [{id, nome, saida}], sobreposicoes: [{arquivo, frentes: [ids das outras frentes]}], avisos: [texto]}.
// `extensoes`: linhas das extensões (até duas de cada, já juntadas), somadas antes da cauda; se não couberem no
// limite nem sem a lista das outras frentes, saem as últimas. `pesado`: a linha de linhaDoPesado (ou null).
export function montarResumo({ sessao, frentes = [], config, baseLimpa, situacao = {}, extensoes = [], pesado = null }) {
  const minha = nomeDaFrente(sessao.frente);
  const listadasSemDona = new Set((situacao.semDona ?? []).map(f => f.nome));
  const outras = frentes.filter(f => f.nome !== minha && !listadasSemDona.has(f.nome))
    .map(f => `${linha(f.id, 20)} ${linha(f.nome, 49)} (${f.dona ? `dona ${idCurto(f.dona)}` : 'sem dona'})`);
  const nomes = config.git.protegidos.map(r => linha(r, 40));
  const protegidos = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : (nomes[0] ?? 'ramo protegido');
  const cabeca = [
    `Sessão ${linha(idCurto(sessao.id), 8)} (${linha(sessao.papel ?? 'executor', 20)}) no harness.`,
    linhaDaSuaFrente(sessao, frentes),
    ...linhasDaSituacao(situacao),
    ...(pesado ? [linha(pesado, LIMITE_LINHA_DA_SITUACAO)] : []),
  ];
  const cauda = [
    textoDaBase(config, baseLimpa),
    `Regras: trabalhe no worktree da sua frente; git add só por caminho; push e merge em ${protegidos} só com ordem do executivo.`,
    'Mais: docs/agents/sessoes-paralelas.md · tools/ah board',
  ];
  const dasExtensoes = extensoes.map(l => linha(l, LIMITE_LINHA_DA_SITUACAO)).filter(Boolean);
  const montar = (n, k = dasExtensoes.length) => {
    let lista = 'nenhuma';
    if (outras.length) {
      lista = outras.slice(0, n).join('; ');
      if (n < outras.length) lista += `${n ? '; ' : ''}e mais ${outras.length - n} frentes (tools/ah board)`;
    }
    return [...cabeca, `Outras frentes: ${lista}`, ...dasExtensoes.slice(0, k), ...cauda].join('\n');
  };
  for (let n = outras.length; n > 0; n--) {
    const t = montar(n);
    if (t.length <= LIMITE_RESUMO) return t;
  }
  for (let k = dasExtensoes.length; k > 0; k--) {
    const t = montar(0, k);
    if (t.length <= LIMITE_RESUMO) return t;
  }
  const t = montar(0, 0);
  // Os campos já vêm cortados; a garantia final vale para configurações absurdas.
  return t.length <= LIMITE_RESUMO ? t : `${t.slice(0, LIMITE_RESUMO - cauda[2].length - 2)}…\n${cauda[2]}`;
}
