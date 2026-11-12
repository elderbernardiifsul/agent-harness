// Contrato neutro entre os adaptadores de agente e o núcleo. O adaptador traduz o
// evento do agente para um destes quatro e devolve a resposta no formato dele:
//
//   {tipo: 'inicio', sessao, agente, cwd, origem: 'novo'|'continuacao', modelo?} -> {contexto}
//   {tipo: 'sinal', sessao, agente?}                                             -> {}
//   {tipo: 'antes', sessao, cwd, acao}                                           -> {decisao: 'permite'} | {decisao: 'recusa', mensagem}
//   {tipo: 'fim', sessao}                                                        -> {}
//
// `acao` é {tipo: 'comando', comando} | {tipo: 'edicao', arquivo} | {tipo: 'outra'}.
// `amb` é o do despacho (raiz, config, dirEstado, env), mais, opcionais, `topoDe`,
// `ramoAtual`, `baseDoPr`, `tempoDoGhMs` (para as travas) e `pid`.
// Um comando pode trazer `shell: 'posix'` quando o agente o roda num shell POSIX (Bash).
import fs from 'node:fs';
import path from 'node:path';
import { avaliar } from '../lib/travas.mjs';
import { textoDaRecusa } from '../lib/recusa.mjs';
import { comandosSimples } from '../lib/shell.mjs';
import { registrarEvento } from '../lib/estado.mjs';
import { registrarSessao, tocarSinal, encerrarSessao, lerSessao } from '../lib/sessao.mjs';
import { listarFrentes } from '../lib/frente.mjs';
import { montarResumo } from '../lib/resumo.mjs';
import { topoDe, ramoAtual, limpo } from '../lib/git.mjs';
import { gh } from '../lib/github.mjs';

const LIMITE_COMANDO_NO_EVENTO = 500;
const LIMITE_MOTIVO = 300;
// O gancho do agente tem tempo-limite próprio; se o processo morresse antes, a ação passaria.
const TEMPO_DO_GH_MS = 5000;

const cortar = (texto, limite) => (texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto);

// Ramo de destino de um PR pelo gh. Só é chamado quando o comando é um `gh pr merge`
// (que já depende da rede); qualquer falha ou demora devolve null, e a trava recusa.
function baseDoPrPeloGh(env, timeoutMs) {
  return (numero, cwd) => {
    const args = ['pr', 'view', ...(numero == null ? [] : [String(numero)]), '--json', 'baseRefName', '--jq', '.baseRefName'];
    const r = gh(args, { cwd: cwd ?? undefined, env, timeoutMs });
    const nome = r.codigo === 0 ? r.saida.trim() : '';
    return /^[^\s]+$/.test(nome) ? nome : null;
  };
}

function contextoDasTravas(amb) {
  return {
    config: amb.config,
    raiz: amb.raiz,
    topoDe: amb.topoDe ?? (c => topoDe(c, amb.env)),
    ramoAtual: amb.ramoAtual ?? (c => ramoAtual(c, amb.env)),
    baseDoPr: amb.baseDoPr ?? baseDoPrPeloGh(amb.env, amb.tempoDoGhMs ?? TEMPO_DO_GH_MS),
  };
}

function baseLimpa(amb) {
  if (ramoAtual(amb.raiz, amb.env) !== amb.config.git.base) return null;
  return limpo(amb.raiz, amb.env);
}

function inicio(evento, amb) {
  const sessao = registrarSessao(amb.dirEstado, {
    id: evento.sessao, agente: evento.agente, pid: amb.pid ?? process.ppid, modelo: evento.modelo ?? null,
  });
  registrarEvento(amb.dirEstado, {
    tipo: 'sessao-inicio', sessao: evento.sessao, agente: evento.agente, origem: evento.origem, modelo: evento.modelo ?? null,
  });
  const contexto = montarResumo({ sessao, frentes: listarFrentes(amb.dirEstado), config: amb.config, baseLimpa: baseLimpa(amb) });
  return { contexto };
}

function sinal(evento, amb) {
  if (!tocarSinal(amb.dirEstado, evento.sessao) && evento.agente) {
    registrarSessao(amb.dirEstado, { id: evento.sessao, agente: evento.agente, pid: amb.pid ?? process.ppid });
  }
  return {};
}

function fim(evento, amb) {
  if (lerSessao(amb.dirEstado, evento.sessao)) encerrarSessao(amb.dirEstado, evento.sessao);
  registrarEvento(amb.dirEstado, { tipo: 'sessao-fim', sessao: evento.sessao });
  return {};
}

function antes(evento, amb) {
  const { acao } = evento;
  if (acao?.tipo === 'outra') return { decisao: 'permite' };
  const r = avaliar(acao.tipo === 'comando' ? { ...acao, cwd: evento.cwd ?? null } : acao, contextoDasTravas(amb));
  const comando = acao.tipo === 'comando' ? cortar(acao.comando, LIMITE_COMANDO_NO_EVENTO) : undefined;
  if (!r.permite) {
    registrarEvento(amb.dirEstado, { tipo: 'recusa', sessao: evento.sessao, trava: r.trava, comando });
    return { decisao: 'recusa', mensagem: textoDaRecusa(r) };
  }
  if (r.liberada) registrarEvento(amb.dirEstado, { tipo: 'liberacao', sessao: evento.sessao, trava: r.liberada, comando });
  return { decisao: 'permite' };
}

const TRATADORES = { inicio, sinal, antes, fim };

export function tratar(evento, amb) {
  const fn = Object.hasOwn(TRATADORES, evento?.tipo) ? TRATADORES[evento.tipo] : null;
  if (!fn) throw new TypeError(`tratar: tipo de evento desconhecido: ${String(evento?.tipo).slice(0, 40)}`);
  return fn(evento, amb);
}

// ---------------------------------------------------------------- quando o gancho quebra

const NOMES_DO_AH = new Set(['tools/ah', './tools/ah', 'ah']);

// O que passa mesmo com o harness quebrado: um comando de shell POSIX que é uma única
// chamada ao `ah` (para o doctor rodar), sem variável antes nem redirecionamento, e a
// edição de `.harness/config.json` (para consertá-la), desde que não seja um link.
// `ctx` = {raiz, cwd}; raiz nula (não achei o projeto) não deixa passar edição nenhuma.
export function passaNaQuebra(acao, { raiz, cwd }) {
  if (acao?.tipo === 'comando') {
    if (acao.shell !== 'posix' || typeof acao.comando !== 'string') return false;
    // O interpretador não mostra redirecionamentos: qualquer < ou > no texto basta para recusar.
    if (/[<>]/.test(acao.comando)) return false;
    let comandos;
    try {
      comandos = comandosSimples(acao.comando, cwd ?? null);
    } catch {
      return false;
    }
    if (comandos.length !== 1 || Object.keys(comandos[0].env ?? {}).length) return false;
    const [argv0] = comandos[0].argv;
    if (typeof argv0 !== 'string') return false;
    return NOMES_DO_AH.has(argv0) || (raiz != null && argv0 === path.join(raiz, 'tools', 'ah'));
  }
  if (acao?.tipo === 'edicao') {
    if (raiz == null || typeof acao.arquivo !== 'string' || acao.arquivo === '') return false;
    const alvo = path.resolve(cwd ?? raiz, acao.arquivo);
    if (path.relative(raiz, alvo) !== path.join('.harness', 'config.json')) return false;
    try {
      return !fs.lstatSync(alvo).isSymbolicLink();
    } catch (e) {
      return e.code === 'ENOENT';
    }
  }
  return false;
}

// Resposta do contrato quando o harness não consegue avaliar: no `antes`, recusa T0
// (salvo as duas exceções); nos outros eventos, um aviso e segue.
export function respostaNaQuebra(evento, motivo, ctx) {
  const m = cortar(String(motivo).replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim(), LIMITE_MOTIVO);
  if (evento?.tipo === 'antes') {
    if (passaNaQuebra(evento.acao, ctx)) return { decisao: 'permite' };
    return { decisao: 'recusa', mensagem: `Recusado (T0): o harness não conseguiu avaliar (${m}).\nFaça: rode tools/ah doctor` };
  }
  return { aviso: `Aviso: o harness não conseguiu tratar o evento (${m}). Rode tools/ah doctor.` };
}
