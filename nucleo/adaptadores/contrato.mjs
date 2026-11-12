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
// `ramoAtual`, `baseDoPr`, `tempoDoGhMs` (para as travas), `pid` (padrão: o pid do agente,
// `AH_PID_AGENTE` ou o processo pai do gancho), `inicioDoProcesso`, `existe` e `agora`.
// `tratar` é assíncrono: a herança e as gravações de sessão rodam sob a trava das frentes.
// Um comando pode trazer `shell: 'posix'` quando o agente o roda num shell POSIX (Bash).
import fs from 'node:fs';
import path from 'node:path';
import { avaliar } from '../lib/travas.mjs';
import { textoDaRecusa } from '../lib/recusa.mjs';
import { comandosSimples } from '../lib/shell.mjs';
import { registrarEvento, comTrava } from '../lib/estado.mjs';
import { registrarSessao, tocarSinal, encerrarSessao, lerSessao, gravarSessao, idCurto } from '../lib/sessao.mjs';
import { listarFrentesTolerante } from '../lib/frente.mjs';
import { continuarSessao } from '../lib/heranca.mjs';
import {
  pidDoAgente, processoExiste, inicioDoProcesso as inicioPadrao, descartarPidMorto, vidaDaSessao,
} from '../lib/vida.mjs';
import { montarResumo } from '../lib/resumo.mjs';
import { topoDe, ramoAtual, limpo } from '../lib/git.mjs';
import { gh } from '../lib/github.mjs';

const LIMITE_COMANDO_NO_EVENTO = 500;
const LIMITE_MOTIVO = 300;
// O `antes` roda a cada ferramenta: não espera a trava das frentes mais que isto para descartar um pid morto.
const ESPERA_DA_TRAVA_NO_ANTES_MS = 200;
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

const existeDe = amb => amb.existe ?? processoExiste;
const inicioDe = amb => amb.inicioDoProcesso ?? inicioPadrao;
const pidDe = amb => (amb.pid !== undefined ? amb.pid : pidDoAgente(amb.env, process.ppid));

// Saída de cada frente sem dona viva: passada -> `ah open`; ativa de dona que não está viva -> `ah takeover`.
function frentesSemDona(frentes, minha, amb) {
  const vidas = new Map();
  const viva = dona => {
    if (!vidas.has(dona)) {
      const opcoes = { config: amb.config, existe: existeDe(amb), inicio: inicioDe(amb) };
      if (amb.agora !== undefined) opcoes.agora = amb.agora;
      let estado = 'desconhecida';
      try { estado = vidaDaSessao(amb.dirEstado, dona, opcoes).estado; } catch { /* sessão ilegível: não está viva */ }
      vidas.set(dona, estado === 'viva');
    }
    return vidas.get(dona);
  };
  const lista = [];
  for (const f of frentes) {
    if (f.nome === minha) continue;
    if (f.estado === 'passada') lista.push({ id: f.id, nome: f.nome, saida: `ah open ${f.nome}` });
    else if (f.estado === 'ativa' && (f.dona == null || !viva(f.dona))) lista.push({ id: f.id, nome: f.nome, saida: `ah takeover ${f.nome}` });
  }
  return lista;
}

async function inicio(evento, amb) {
  const id = evento.sessao;
  const declarado = amb.pid !== undefined || pidDoAgente(amb.env, null) !== null;
  let pid = pidDe(amb);
  let pidInicio = pid == null ? null : inicioDe(amb)(pid);
  await comTrava(amb.dirEstado, 'frentes', async () => {
    const antiga = lerSessao(amb.dirEstado, id);
    // pid só do processo pai do gancho não troca o pid vivo (e da mesma hora de início) que a sessão já tem,
    // como o declarado por AH_PID_AGENTE num comando anterior.
    if (!declarado && antiga && !antiga.fim && antiga.pid != null && antiga.pid !== pid && existeDe(amb)(antiga.pid)) {
      const atual = inicioDe(amb)(antiga.pid);
      if (antiga.pidInicio == null || atual == null || atual === antiga.pidInicio) {
        pid = antiga.pid;
        pidInicio = antiga.pidInicio;
      }
    }
    registrarSessao(amb.dirEstado, { id, agente: evento.agente, pid, pidInicio, modelo: evento.modelo ?? null });
  });
  registrarEvento(amb.dirEstado, {
    tipo: 'sessao-inicio', sessao: id, agente: evento.agente, origem: evento.origem, modelo: evento.modelo ?? null,
  });
  await continuarSessao(amb.dirEstado, { sessao: id, pid, pidInicio, origem: evento.origem });

  const { frentes } = listarFrentesTolerante(amb.dirEstado);
  const avisos = [];
  let sessao = lerSessao(amb.dirEstado, id);
  const foco = typeof sessao.frente === 'string' ? frentes.find(f => f.nome === sessao.frente) : null;
  if (foco && foco.dona != null && foco.dona !== id) {
    // A frente em foco tem outra dona (tomada ou herdada por outra sessão): não a recupera.
    sessao = await comTrava(amb.dirEstado, 'frentes', async () => {
      const atual = lerSessao(amb.dirEstado, id);
      if (atual.frente === foco.nome) gravarSessao(amb.dirEstado, { ...atual, frente: null });
      return { ...atual, frente: null };
    });
    avisos.push(`Sua frente ${foco.id} ${foco.nome} está com a sessão ${idCurto(foco.dona)}.`);
  }
  const situacao = { semDona: frentesSemDona(frentes, sessao.frente, amb), sobreposicoes: [], avisos };
  const contexto = montarResumo({ sessao, frentes, config: amb.config, baseLimpa: baseLimpa(amb), situacao });
  return { contexto };
}

// Toca o sinal de vida e, se o pid gravado morreu enquanto os ganchos chegam, descarta-o.
// Nunca derruba o evento: um arquivo de sessão ilegível não pode travar as ferramentas do agente.
// `esperaMs`: quanto esperar pela trava para descartar o pid; o `antes` usa espera curta e, sem a trava, segue.
async function manterVivo(evento, amb, { esperaMs } = {}) {
  try {
    const s = tocarSinal(amb.dirEstado, evento.sessao);
    if (s && s.pid != null && !existeDe(amb)(s.pid)) {
      await comTrava(amb.dirEstado, 'frentes', async () => descartarPidMorto(amb.dirEstado, evento.sessao, existeDe(amb)),
        esperaMs === undefined ? {} : { esperaMs });
    }
    return s;
  } catch (e) {
    if (e?.name !== 'ErroDeEstado') throw e;
    return undefined;
  }
}

async function sinal(evento, amb) {
  const s = await manterVivo(evento, amb);
  if (s === null && evento.agente) {
    await comTrava(amb.dirEstado, 'frentes', async () => {
      if (lerSessao(amb.dirEstado, evento.sessao)) return tocarSinal(amb.dirEstado, evento.sessao);
      const pid = pidDe(amb);
      return registrarSessao(amb.dirEstado, { id: evento.sessao, agente: evento.agente, pid, pidInicio: pid == null ? null : inicioDe(amb)(pid) });
    });
  }
  return {};
}

async function fim(evento, amb) {
  await comTrava(amb.dirEstado, 'frentes', async () => {
    if (lerSessao(amb.dirEstado, evento.sessao)) encerrarSessao(amb.dirEstado, evento.sessao, 'fim');
  });
  registrarEvento(amb.dirEstado, { tipo: 'sessao-fim', sessao: evento.sessao });
  return {};
}

async function antes(evento, amb) {
  // O sinal de vida não decide nada aqui: falha ao tocá-lo não pode virar recusa da ferramenta.
  try { await manterVivo(evento, amb, { esperaMs: ESPERA_DA_TRAVA_NO_ANTES_MS }); } catch { /* segue para as travas */ }
  const { acao } = evento;
  if (acao?.tipo === 'outra') return { decisao: 'permite' };
  const r = avaliar({ ...acao, cwd: evento.cwd ?? null }, contextoDasTravas(amb));
  const comando = acao.tipo === 'comando' ? cortar(acao.comando, LIMITE_COMANDO_NO_EVENTO) : undefined;
  if (!r.permite) {
    registrarEvento(amb.dirEstado, { tipo: 'recusa', sessao: evento.sessao, trava: r.trava, comando });
    return { decisao: 'recusa', mensagem: textoDaRecusa(r) };
  }
  if (r.liberada) registrarEvento(amb.dirEstado, { tipo: 'liberacao', sessao: evento.sessao, trava: r.liberada, comando });
  return { decisao: 'permite' };
}

const TRATADORES = { inicio, sinal, antes, fim };

export async function tratar(evento, amb) {
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
