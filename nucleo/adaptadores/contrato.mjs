// Contrato neutro entre os adaptadores de agente e o núcleo. O adaptador traduz o
// evento do agente para um destes quatro e devolve a resposta no formato dele:
//
//   {tipo: 'inicio', sessao, agente, cwd, origem: 'novo'|'continuacao', modelo?} -> {contexto}
//   {tipo: 'sinal', sessao, agente?}                                             -> {}
//   {tipo: 'antes', sessao, cwd, acao}                                           -> {decisao: 'permite'} | {decisao: 'recusa', mensagem}
//   {tipo: 'fim', sessao, motivo?, continuacao?}                                 -> {}
//
// No `fim` com `continuacao: true` (o agente anuncia uma sessão nova no mesmo processo, como o /clear do
// Claude Code, cujo fim chega antes do início da nova), a sessão não é encerrada: fica com
// `aguardandoContinuacao` (o instante) e o `inicio` seguinte do mesmo processo a substitui e herda a
// frente. Se ele não vier, a sessão segue sem `fim` e a vida dela é a do pid e do sinal.
//
// `acao` é {tipo: 'comando', comando} | {tipo: 'edicao', arquivo, ferramenta?} | {tipo: 'outra'}.
// As travas recebem também a sessão, as frentes ativas das outras e a vida das donas (T4).
// `amb` é o do despacho (raiz, config, dirEstado, env), mais, opcionais, `topoDe`,
// `ramoAtual`, `baseDoPr`, `tempoDoGhMs`, `ehRef`, `existeCaminho` (para as travas), `pid` (padrão: o pid do agente,
// `AH_PID_AGENTE` ou o processo pai do gancho), `inicioDoProcesso`, `existe`, `agora` e
// `prazoDaSobreposicaoMs` (quanto o `inicio` gasta, no máximo, com o git da sobreposição).
// `tratar` é assíncrono: a herança e as gravações de sessão rodam sob a trava das frentes.
// Um comando pode trazer `shell: 'posix'` quando o agente o roda num shell POSIX (Bash).
import fs from 'node:fs';
import path from 'node:path';
import { avaliar } from '../lib/travas.mjs';
import { textoDaRecusa } from '../lib/recusa.mjs';
import { comandosSimples } from '../lib/shell.mjs';
import { registrarEvento, comTrava, lerJson, gravarJson } from '../lib/estado.mjs';
import { registrarSessao, tocarSinal, encerrarSessao, lerSessao, gravarSessao, idCurto } from '../lib/sessao.mjs';
import { listarFrentesTolerante } from '../lib/frente.mjs';
import { continuarSessao } from '../lib/heranca.mjs';
import {
  aberturaParada, frenteOrfa, pidDoAgente, processoExiste, inicioDoProcesso as inicioPadrao, descartarPidMorto, vidaDaDona,
} from '../lib/vida.mjs';
import { normalizarCaminho } from '../lib/caminhos.mjs';
import { montarResumo } from '../lib/resumo.mjs';
import { git, topoDe, ramoAtual, limpo } from '../lib/git.mjs';
import { gh } from '../lib/github.mjs';
import { arquivosDaFrenteOuNulo, contaNaSobreposicao, sobreposicoes as calcularSobreposicoes } from '../lib/sobreposicao.mjs';

const LIMITE_COMANDO_NO_EVENTO = 500;
const LIMITE_MOTIVO = 300;
// O `antes` roda a cada ferramenta: não espera a trava das frentes mais que isto para descartar um pid morto.
const ESPERA_DA_TRAVA_NO_ANTES_MS = 200;
// O gancho do agente tem tempo-limite próprio; se o processo morresse antes, a ação passaria.
const TEMPO_DO_GH_MS = 5000;
// O cálculo de sobreposição não pode atrasar o começo da sessão: estourado o prazo, o resumo sai sem a linha.
const PRAZO_DA_SOBREPOSICAO_MS = 1500;

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

// `nome` é uma referência que o `git checkout <nome>` usaria para trocar de ramo: um commit
// pelo nome (ramo, etiqueta) ou um ramo do remoto com esse nome (o checkout cria o local).
// Só é chamado num `git checkout` de um posicional solto (mesmo que seja também um caminho existente).
function ehRefPeloGit(env, remoto) {
  return (cwd, nome) => {
    if (typeof nome !== 'string' || nome === '' || nome.startsWith('-')) return false;
    const existe = ref => git(['rev-parse', '--verify', '-q', `${ref}^{commit}`], { cwd: cwd ?? undefined, env }).codigo === 0;
    return existe(nome) || existe(`${remoto}/${nome}`);
  };
}

// Para a T4: as frentes ativas de outras sessões (worktree já normalizado) e a vida das donas, com
// memória por id dentro do evento. Arquivo de frente ilegível é pulado e registrado (não pode travar
// toda ferramenta do agente); registro ilegível da dona conta como viva (na dúvida, protege).
// O evento `estado-ilegivel` sai só quando o conjunto de ilegíveis muda (o último avisado fica em
// `ilegiveis-avisados.json`), para não encher os eventos a cada ferramenta.
function avisarIlegiveis(sessao, ilegiveis, amb) {
  const arquivo = path.join(amb.dirEstado, 'ilegiveis-avisados.json');
  const caminhos = ilegiveis.map(nome => path.join(amb.dirEstado, 'frentes', `${nome}.json`)).sort();
  let avisados = null;
  try { avisados = lerJson(arquivo); } catch { /* carimbo ilegível: avisa de novo */ }
  if (Array.isArray(avisados) && avisados.length === caminhos.length && avisados.every((c, i) => c === caminhos[i])) return;
  if (!caminhos.length && avisados == null) return;
  try {
    if (caminhos.length) gravarJson(arquivo, caminhos); else fs.rmSync(arquivo, { force: true });
  } catch { /* sem o carimbo, o aviso só se repete */ }
  if (caminhos.length) registrarEvento(amb.dirEstado, { tipo: 'estado-ilegivel', sessao, caminhos });
}

function frentesDeOutras(sessao, amb) {
  const { frentes, ilegiveis } = listarFrentesTolerante(amb.dirEstado);
  avisarIlegiveis(sessao, ilegiveis, amb);
  return frentes
    .filter(f => f.estado === 'ativa' && f.dona != null && f.dona !== sessao && typeof f.worktree === 'string' && f.worktree !== '')
    .map(f => ({ id: f.id, nome: f.nome, ramo: f.ramo, worktree: normalizarCaminho(f.worktree), dona: f.dona }));
}

// Dona no mesmo processo do agente deste evento, sem hora de início gravada (Windows, ps que falhou): é a
// sessão anterior da mesma conversa (/clear, continuação que não herdou por falta da hora), não outra
// sessão viva. Com a hora gravada, o mesmo pid não basta.
function mesmoAgente(id, amb) {
  const meu = pidDe(amb);
  if (meu == null) return false;
  try {
    const s = lerSessao(amb.dirEstado, id);
    return Boolean(s && !s.fim && s.pid === meu && s.pidInicio == null);
  } catch {
    return false;
  }
}

function vidaDasDonas(amb) {
  const memoria = new Map();
  return id => {
    if (!memoria.has(id) && mesmoAgente(id, amb)) memoria.set(id, false);
    if (!memoria.has(id)) {
      const opcoes = { config: amb.config, existe: existeDe(amb), inicio: inicioDe(amb) };
      if (amb.agora !== undefined) opcoes.agora = amb.agora;
      const estado = vidaDaDona(amb.dirEstado, id, opcoes)?.estado;
      memoria.set(id, estado === 'viva' || estado === 'ilegivel');
    }
    return memoria.get(id);
  };
}

function contextoDasTravas(amb, sessao) {
  return {
    sessao,
    frentes: frentesDeOutras(sessao, amb),
    viva: vidaDasDonas(amb),
    normalizar: c => normalizarCaminho(c),
    config: amb.config,
    raiz: amb.raiz,
    topoDe: amb.topoDe ?? (c => topoDe(c, amb.env)),
    ramoAtual: amb.ramoAtual ?? (c => ramoAtual(c, amb.env)),
    baseDoPr: amb.baseDoPr ?? baseDoPrPeloGh(amb.env, amb.tempoDoGhMs ?? TEMPO_DO_GH_MS),
    ehRef: amb.ehRef ?? ehRefPeloGit(amb.env, amb.config.git.remoto),
    // `amb.existe` é o do processo (vida da sessão); o do caminho tem nome próprio.
    existe: amb.existeCaminho ?? (c => fs.existsSync(c)),
  };
}

function baseLimpa(amb) {
  if (ramoAtual(amb.raiz, amb.env) !== amb.config.git.base) return null;
  return limpo(amb.raiz, amb.env);
}

const existeDe = amb => amb.existe ?? processoExiste;
const inicioDe = amb => amb.inicioDoProcesso ?? inicioPadrao;
const pidDe = amb => (amb.pid !== undefined ? amb.pid : pidDoAgente(amb.env, process.ppid));

// Saída de cada frente sem dona viva: passada -> `ah open`; ativa de dona que não está viva -> `ah takeover`;
// em abertura parada (processo do open morto) -> `ah open`, que toma o registro.
function frentesSemDona(frentes, minha, amb) {
  // A vida da dona é a do sweep e do takeover (vidaDaDona): registro ilegível não é "sem dona" (o takeover o
  // recusa), e vira aviso à parte em `ilegiveis`.
  const vidas = new Map();
  const vida = dona => {
    if (!vidas.has(dona)) {
      const opcoes = { config: amb.config, existe: existeDe(amb), inicio: inicioDe(amb) };
      if (amb.agora !== undefined) opcoes.agora = amb.agora;
      vidas.set(dona, vidaDaDona(amb.dirEstado, dona, opcoes));
    }
    return vidas.get(dona);
  };
  const lista = [];
  const ilegiveis = [];
  for (const f of frentes) {
    if (f.nome === minha) continue;
    const v = f.dona != null ? vida(f.dona) : null;
    if (f.estado === 'passada') lista.push({ id: f.id, nome: f.nome, saida: `ah open ${f.nome}` });
    else if (f.estado === 'abrindo' && aberturaParada(f, v?.estado === 'viva', { existe: existeDe(amb), inicio: inicioDe(amb) })) lista.push({ id: f.id, nome: f.nome, saida: `ah open ${f.nome}` });
    else if (f.estado === 'ativa' && v?.estado === 'ilegivel') ilegiveis.push(`A frente ${f.id} ${f.nome}: registro da dona ilegível (ah doctor).`);
    else if (frenteOrfa(f, v)) lista.push({ id: f.id, nome: f.nome, saida: `ah takeover ${f.nome}` });
  }
  return { lista, ilegiveis };
}

// Sobreposições da frente da sessão com as outras: [{arquivo, frentes: [ids das outras]}].
// Qualquer falha ou demora do git devolve lista vazia (o resumo sai sem a linha).
function sobreposicoesDaSessao(minha, frentes, amb) {
  if (!minha || !contaNaSobreposicao(minha)) return [];
  const prazoMs = amb.prazoDaSobreposicaoMs ?? PRAZO_DA_SOBREPOSICAO_MS;
  if (!(prazoMs > 0)) return [];
  const prazo = Date.now() + prazoMs;
  const opcoes = { raiz: amb.raiz, base: amb.config.git.base, env: amb.env, prazo };
  try {
    const meus = arquivosDaFrenteOuNulo(minha, opcoes);
    if (meus === null) return [];
    if (!meus.length) return [];
    const porFrente = new Map([[minha.id, meus]]);
    for (const f of frentes) {
      if (f.nome === minha.nome || !contaNaSobreposicao(f)) continue;
      const deles = arquivosDaFrenteOuNulo(f, opcoes);
      if (deles === null) return [];
      porFrente.set(f.id, [...(porFrente.get(f.id) ?? []), ...deles]);
    }
    return calcularSobreposicoes(porFrente)
      .filter(s => s.frentes.includes(minha.id))
      .map(s => ({ arquivo: s.arquivo, frentes: s.frentes.filter(id => id !== minha.id) }));
  } catch {
    return [];
  }
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
  const continuacao = await continuarSessao(amb.dirEstado, { sessao: id, pid, pidInicio, origem: evento.origem });

  const { frentes } = listarFrentesTolerante(amb.dirEstado);
  const avisos = (continuacao.passadas ?? []).map(f => `A frente ${f.id} ${f.nome} ficou passada; para retomar, tools/ah open ${f.nome}.`);
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
  // Frente que outra sessão assumiu desta (ah takeover, que já tirou o foco daqui): o resumo diz quem a tem, uma
  // vez só; o registro da sessão guarda as tomadas já avisadas (`<id da frente>@<tomadaEm>`), só as 50 mais recentes.
  const marca = f => `${f.id}@${f.tomadaEm ?? ''}`;
  const tomadas = frentes.filter(f => f !== foco && f.estado === 'ativa' && f.tomadaDe === id && f.dona != null && f.dona !== id
    && !(Array.isArray(sessao.tomadasAvisadas) && sessao.tomadasAvisadas.includes(marca(f))));
  if (tomadas.length) {
    for (const f of tomadas) avisos.push(`Sua frente ${f.id} ${f.nome} está com a sessão ${idCurto(f.dona)} (ah takeover).`);
    sessao = await comTrava(amb.dirEstado, 'frentes', async () => {
      const atual = lerSessao(amb.dirEstado, id);
      const ja = Array.isArray(atual.tomadasAvisadas) ? atual.tomadasAvisadas : [];
      const nova = { ...atual, tomadasAvisadas: [...new Set([...ja, ...tomadas.map(marca)])].slice(-TOMADAS_AVISADAS_MAX) };
      gravarSessao(amb.dirEstado, nova);
      return nova;
    });
  }
  const minha = typeof sessao.frente === 'string' ? frentes.find(f => f.nome === sessao.frente && f.dona === id) : null;
  const semDona = frentesSemDona(frentes, sessao.frente, amb);
  const situacao = { semDona: semDona.lista, sobreposicoes: sobreposicoesDaSessao(minha, frentes, amb), avisos: [...avisos, ...semDona.ilegiveis] };
  const contexto = montarResumo({ sessao, frentes, config: amb.config, baseLimpa: baseLimpa(amb), situacao });
  return { contexto };
}

const TOMADAS_AVISADAS_MAX = 50;

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
  const continua = evento.continuacao === true;
  await comTrava(amb.dirEstado, 'frentes', async () => {
    const s = lerSessao(amb.dirEstado, evento.sessao);
    if (!s) return;
    if (continua && !s.fim) gravarSessao(amb.dirEstado, { ...s, aguardandoContinuacao: new Date().toISOString() });
    else if (!continua) encerrarSessao(amb.dirEstado, evento.sessao, 'fim');
  });
  const extra = {};
  if (typeof evento.motivo === 'string') extra.motivo = evento.motivo;
  if (continua) extra.aguardandoContinuacao = true;
  registrarEvento(amb.dirEstado, { tipo: 'sessao-fim', sessao: evento.sessao, ...extra });
  return {};
}

async function antes(evento, amb) {
  // O sinal de vida não decide nada aqui: falha ao tocá-lo não pode virar recusa da ferramenta.
  try { await manterVivo(evento, amb, { esperaMs: ESPERA_DA_TRAVA_NO_ANTES_MS }); } catch { /* segue para as travas */ }
  const { acao } = evento;
  if (acao?.tipo === 'outra') return { decisao: 'permite' };
  const r = avaliar({ ...acao, cwd: evento.cwd ?? null }, contextoDasTravas(amb, evento.sessao));
  const comando = acao.tipo === 'comando' ? cortar(acao.comando, LIMITE_COMANDO_NO_EVENTO) : undefined;
  if (!r.permite) {
    const daEdicao = acao.tipo === 'edicao'
      ? { ferramenta: acao.ferramenta, caminho: typeof acao.arquivo === 'string' ? path.resolve(evento.cwd ?? amb.raiz, acao.arquivo) : undefined }
      : {};
    registrarEvento(amb.dirEstado, { tipo: 'recusa', sessao: evento.sessao, trava: r.trava, comando, ...daEdicao });
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
