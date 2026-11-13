// Fila de comentários e edições de ticket que não chegaram ao servidor.
// `pendentes.jsonl` no diretório de estado, uma operação por linha, em ordem; mexer no arquivo só sob a trava
// `pendentes` (curta, síncrona). O reenvio inteiro roda sob a trava `pendentes-reenvio`, que não espera:
// se outro já está reenviando, este não envia nada (evita o mesmo comentário duas vezes).
import fs from 'node:fs';
import path from 'node:path';
import { ErroDeEstado, comTrava, comTravaSinc, registrarEvento } from './estado.mjs';
import { gh } from './github.mjs';

const ARQUIVO = 'pendentes.jsonl';
const DESCARTADOS = 'pendentes-descartados.jsonl';
const PERMANENTE = /could not resolve to an issue|not found|HTTP 404|HTTP 410/i;
const TRAVA = 'pendentes';
const TRAVA_DO_REENVIO = 'pendentes-reenvio';
// O dono.json do reenvio é renovado antes de cada item: um ah morto no meio solta a fila em 1 min.
const VENCE_REENVIO_MS = 60000;
// Falhas em que o GitHub respondeu (não é falta de rede) antes de a operação ser estacionada nos descartados.
export const MAX_TENTATIVAS = 5;
// Prazo de cada chamada do gh no reenvio do começo de um comando: rede travada não segura o comando.
const PRAZO_DO_REENVIO_MS = 5000;
// Falha de rede (ou gh ausente/no prazo, código 127): não conta tentativa e para o reenvio.
const SEM_REDE = /sem rede|error connecting|could not connect|connection (refused|reset|timed out)|timed? ?out|dial tcp|no such host|network is unreachable|TLS handshake|unexpected EOF/i;

const arquivoDe = dirEstado => path.join(dirEstado, ARQUIVO);

function lerLinhas(dirEstado) {
  let texto;
  try {
    texto = fs.readFileSync(arquivoDe(dirEstado), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new ErroDeEstado(`Não consegui ler a fila de pendentes ${arquivoDe(dirEstado)}: ${e.message}`, arquivoDe(dirEstado));
  }
  return texto.split('\n').filter(l => l.trim());
}

function conferirOp(op) {
  const ticketOk = Number.isInteger(op?.ticket) && op.ticket > 0;
  if (op?.tipo === 'comentario' && ticketOk && typeof op.corpo === 'string') return;
  if (op?.tipo === 'edicao' && ticketOk && Array.isArray(op.args) && op.args.every(a => typeof a === 'string')) return;
  throw new ErroDeEstado(`Operação pendente inválida: ${JSON.stringify(op).slice(0, 120)}`, null, 'confira quem chamou enfileirar');
}

export function enfileirar(dirEstado, op) {
  conferirOp(op);
  const linha = JSON.stringify({ ...op, em: new Date().toISOString() });
  fs.mkdirSync(dirEstado, { recursive: true });
  comTravaSinc(dirEstado, TRAVA, () => fs.appendFileSync(arquivoDe(dirEstado), `${linha}\n`));
}

export function contarPendentes(dirEstado) {
  return lerLinhas(dirEstado).length;
}

// A fila numa leitura só: {ops (as operações legíveis, em ordem), ilegiveis (números das linhas, contando do 1,
// que não são uma operação válida), arquivo}. Quem conta e quem lista usam a mesma leitura.
export function lerFila(dirEstado) {
  const arquivo = arquivoDe(dirEstado);
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { ops: [], ilegiveis: [], arquivo };
    throw new ErroDeEstado(`Não consegui ler a fila de pendentes ${arquivo}: ${e.message}`, arquivo);
  }
  const ops = [];
  const ilegiveis = [];
  texto.split('\n').forEach((l, i) => {
    if (!l.trim()) return;
    try {
      const op = JSON.parse(l);
      conferirOp(op);
      ops.push(op);
    } catch { ilegiveis.push(i + 1); }
  });
  return { ops, ilegiveis, arquivo };
}

// Todas as operações da fila, em ordem (linha ilegível fica de fora; o reenvio a descarta).
export function listarPendentes(dirEstado) {
  return lerFila(dirEstado).ops;
}

export function pendentesDoTicket(dirEstado, ticket) {
  return lerLinhas(dirEstado).flatMap(l => {
    try {
      const op = JSON.parse(l);
      return op?.ticket === ticket ? [op] : [];
    } catch { return []; }
  });
}

// Há operação na fila para o ticket? (A nova vai atrás dela, para não passar na frente.)
export function temDoTicket(dirEstado, ticket) {
  return pendentesDoTicket(dirEstado, ticket).length > 0;
}

const executarOp = (op, o) => (op.tipo === 'comentario'
  ? gh(['issue', 'comment', String(op.ticket), '--body-file', '-'], { ...o, entrada: op.corpo })
  : gh(['issue', 'edit', String(op.ticket), ...op.args], o));

export const ENVIADO = 'enviado';
export const NA_FILA = 'na-fila';
export const PERDIDO = 'perdido';

const avisoPadrao = texto => process.stderr.write(texto);

const comoFazerAMao = op => (op.tipo === 'comentario'
  ? `gh issue comment ${op.ticket} (com o texto que o comando mostraria)`
  : `gh issue edit ${op.ticket} ${op.args.join(' ')}`);

// Tenta já; na falha (ou com operação do mesmo ticket esperando na fila) enfileira e registra.
// Devolve 'enviado' (chegou ao servidor), 'na-fila' (guardada para o reenvio) ou 'perdido' (nem a fila
// aceitou: já avisou por `o.avisar`, senão pela saída de erro, que é preciso fazer à mão). Nunca lança.
// `o.evento` (opcional): campos a mais no evento de falha (sessão, frente).
function tentarOuEnfileirar(dirEstado, op, o) {
  const { evento = {}, avisar = avisoPadrao, ...opcoesDoGh } = o;
  let naFila = false;
  try { naFila = temDoTicket(dirEstado, op.ticket); } catch { naFila = false; }
  if (!naFila && executarOp(op, opcoesDoGh).codigo === 0) return ENVIADO;
  const tipo = op.tipo === 'comentario' ? 'comentario-falhou' : 'edicao-falhou';
  try {
    enfileirar(dirEstado, op);
  } catch (e) {
    const motivo = String(e?.message ?? e).split('\n')[0].slice(0, 200);
    avisar(`Aviso: a ${op.tipo === 'comentario' ? 'operação de comentário' : 'edição'} no ticket #${op.ticket} não foi enviada nem guardada na fila (${motivo}). Faça à mão: ${comoFazerAMao(op)}\n`);
    try { registrarEvento(dirEstado, { ...evento, tipo, ticket: op.ticket, guardada: false, motivo }); } catch { /* já avisado */ }
    return PERDIDO;
  }
  try { registrarEvento(dirEstado, { ...evento, tipo, ticket: op.ticket }); } catch { /* a operação está na fila */ }
  return NA_FILA;
}

export function comentarOuEnfileirar(dirEstado, ticket, corpo, o = {}) {
  return tentarOuEnfileirar(dirEstado, { tipo: 'comentario', ticket, corpo }, o);
}

export function editarOuEnfileirar(dirEstado, ticket, args, o = {}) {
  return tentarOuEnfileirar(dirEstado, { tipo: 'edicao', ticket, args }, o);
}

// Mexe na fila sob a trava: `troca(linhas)` devolve as linhas novas.
function regravarFila(dirEstado, troca) {
  comTravaSinc(dirEstado, TRAVA, () => {
    const linhas = troca(lerLinhas(dirEstado));
    if (!linhas) return;
    const temp = path.join(dirEstado, `.${ARQUIVO}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(temp, linhas.map(l => `${l}\n`).join(''));
    fs.renameSync(temp, arquivoDe(dirEstado));
  });
}

// Tira da fila a linha `linha` (só o reenvio, sob a trava dele, tira ou troca linhas).
function tirarDaFila(dirEstado, linha) {
  regravarFila(dirEstado, linhas => {
    const i = linhas.indexOf(linha);
    return i < 0 ? null : linhas.filter((_, j) => j !== i);
  });
}

function trocarNaFila(dirEstado, linha, nova) {
  regravarFila(dirEstado, linhas => {
    const i = linhas.indexOf(linha);
    return i < 0 ? null : linhas.map((l, j) => (j === i ? nova : l));
  });
}

function descartar(dirEstado, linha, op, erro) {
  const registro = op ? { ...op, erro } : { linha, erro };
  fs.appendFileSync(path.join(dirEstado, DESCARTADOS), `${JSON.stringify({ ...registro, descartadaEm: new Date().toISOString() })}\n`);
  registrarEvento(dirEstado, { tipo: 'pendente-descartado', ticket: op?.ticket ?? null, operacao: op?.tipo ?? null, erro });
  tirarDaFila(dirEstado, linha);
}

const primeiraLinha = r => `${r.erro}\n${r.saida}`.trim().split('\n')[0].slice(0, 300) || `o gh saiu com código ${r.codigo}`;

// Reenvia em ordem. Falta de rede para tudo. Erro permanente (ticket que não existe mais) vai para os
// descartados. Outro erro em que o GitHub respondeu (ticket trancado, 403, 422) conta uma tentativa na
// linha, segura só as operações daquele ticket nesta volta e, na MAX_TENTATIVAS-ésima, estaciona a
// operação nos descartados. Com outro reenvio em andamento, não envia nada.
// Devolve {enviados, restam, descartados}; não enumeráveis: `erro` (da primeira que ficou) e
// `estacionadas` ([{ticket, operacao, erro}]).
export async function reenviarPendentes(dirEstado, o = {}) {
  const resultado = { enviados: 0, restam: 0, descartados: 0 };
  let erro = null;
  const estacionadas = [];
  if (contarPendentes(dirEstado) > 0) {
    try {
      await comTrava(dirEstado, TRAVA_DO_REENVIO, async trava => {
        const seguros = new Set();
        for (const linha of lerLinhas(dirEstado)) {
          trava.renovar(); // a trava vence em VENCE_REENVIO_MS sem renovação; só renova se ainda for desta chamada
          let op;
          try {
            op = JSON.parse(linha);
            conferirOp(op);
          } catch {
            descartar(dirEstado, linha, null, 'linha ilegível na fila');
            resultado.descartados++;
            continue;
          }
          if (seguros.has(op.ticket)) continue;
          const r = executarOp(op, o);
          if (r.codigo === 0) {
            tirarDaFila(dirEstado, linha);
            resultado.enviados++;
            continue;
          }
          const texto = `${r.erro}\n${r.saida}`;
          const motivo = primeiraLinha(r);
          if (PERMANENTE.test(texto)) {
            descartar(dirEstado, linha, op, motivo);
            resultado.descartados++;
            continue;
          }
          if (r.codigo === 127 || SEM_REDE.test(texto)) {
            erro ??= { ticket: op.ticket, erro: motivo };
            break;
          }
          const tentativas = (Number.isInteger(op.tentativas) ? op.tentativas : 0) + 1;
          if (tentativas >= MAX_TENTATIVAS) {
            const { tentativas: _t, ultimoErro: _u, ...semContagem } = op;
            descartar(dirEstado, linha, { ...semContagem, tentativas }, motivo);
            resultado.descartados++;
            estacionadas.push({ ticket: op.ticket, operacao: op.tipo, erro: motivo });
            continue;
          }
          trocarNaFila(dirEstado, linha, JSON.stringify({ ...op, tentativas, ultimoErro: motivo }));
          erro ??= { ticket: op.ticket, erro: motivo };
          seguros.add(op.ticket);
        }
      }, { esperaMs: 0, venceMs: VENCE_REENVIO_MS });
    } catch (e) {
      // Trava do reenvio com outro: não é erro, só não é a vez deste.
      if (!(e instanceof ErroDeEstado && e.arquivo?.endsWith(TRAVA_DO_REENVIO))) throw e;
    }
    resultado.restam = contarPendentes(dirEstado);
  }
  Object.defineProperty(resultado, 'erro', { value: resultado.restam ? erro : null, enumerable: false });
  Object.defineProperty(resultado, 'estacionadas', { value: estacionadas, enumerable: false });
  return resultado;
}

// Para o começo dos comandos com rede: reenvia com prazo curto por chamada e avisa o que ficou ou foi
// estacionado; se o reenvio falhar, só avisa (nunca vira recusa).
export async function reenviarComAviso(dirEstado, o, avisar) {
  let r;
  try {
    r = await reenviarPendentes(dirEstado, { timeoutMs: PRAZO_DO_REENVIO_MS, ...o });
  } catch (e) {
    avisar(`Aviso: não consegui reenviar os comentários pendentes (${String(e?.message ?? e).split('\n')[0].slice(0, 200)}); sigo.\n`);
    return null;
  }
  for (const est of r.estacionadas) {
    avisar(`Aviso: desisti de reenviar ${est.operacao === 'comentario' ? 'um comentário' : 'uma edição'} do ticket #${est.ticket} depois de ${MAX_TENTATIVAS} falhas (${est.erro}); ficou em ${path.join(dirEstado, DESCARTADOS)}. Faça à mão o que ela fazia.\n`);
  }
  if (r.restam > 0) {
    const causa = r.erro ? `; a primeira falha com: ${r.erro.erro} (ticket #${r.erro.ticket})` : ' (outro comando está reenviando)';
    avisar(`Aviso: ${r.restam} ${r.restam === 1 ? 'operação pendente' : 'operações pendentes'} para o GitHub${causa}.\n`
      + `Próximo passo: sem rede, elas saem sozinhas no próximo ah open ou ah close com rede; se o erro é do ticket (trancado, sem permissão), resolva no GitHub (depois de ${MAX_TENTATIVAS} falhas a operação é estacionada em ${path.join(dirEstado, DESCARTADOS)}).\n`);
  }
  return r;
}
