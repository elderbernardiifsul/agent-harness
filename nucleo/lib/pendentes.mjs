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
const VENCE_REENVIO_MS = 10 * 60000;

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

// Há operação na fila para o ticket? (A nova vai atrás dela, para não passar na frente.)
function temDoTicket(dirEstado, ticket) {
  return lerLinhas(dirEstado).some(l => {
    try { return JSON.parse(l).ticket === ticket; } catch { return false; }
  });
}

const executarOp = (op, o) => (op.tipo === 'comentario'
  ? gh(['issue', 'comment', String(op.ticket), '--body-file', '-'], { ...o, entrada: op.corpo })
  : gh(['issue', 'edit', String(op.ticket), ...op.args], o));

// Tenta já; na falha (ou com operação do mesmo ticket esperando na fila) enfileira, registra e devolve false.
// `o.evento` (opcional): campos a mais no evento de falha (sessão, frente).
function tentarOuEnfileirar(dirEstado, op, o) {
  const { evento = {}, ...opcoesDoGh } = o;
  if (!temDoTicket(dirEstado, op.ticket) && executarOp(op, opcoesDoGh).codigo === 0) return true;
  enfileirar(dirEstado, op);
  registrarEvento(dirEstado, { ...evento, tipo: op.tipo === 'comentario' ? 'comentario-falhou' : 'edicao-falhou', ticket: op.ticket });
  return false;
}

export function comentarOuEnfileirar(dirEstado, ticket, corpo, o = {}) {
  return tentarOuEnfileirar(dirEstado, { tipo: 'comentario', ticket, corpo }, o);
}

export function editarOuEnfileirar(dirEstado, ticket, args, o = {}) {
  return tentarOuEnfileirar(dirEstado, { tipo: 'edicao', ticket, args }, o);
}

// Tira da fila a primeira linha, que tem de ser `linha` (só o reenvio, sob a trava dele, tira da fila).
function tirarDaFila(dirEstado, linha) {
  comTravaSinc(dirEstado, TRAVA, () => {
    const linhas = lerLinhas(dirEstado);
    const i = linhas.indexOf(linha);
    if (i < 0) return;
    linhas.splice(i, 1);
    const arquivo = arquivoDe(dirEstado);
    const temp = path.join(dirEstado, `.${ARQUIVO}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(temp, linhas.map(l => `${l}\n`).join(''));
    fs.renameSync(temp, arquivo);
  });
}

function descartar(dirEstado, linha, op, erro) {
  const registro = op ? { ...op, erro } : { linha, erro };
  fs.appendFileSync(path.join(dirEstado, DESCARTADOS), `${JSON.stringify({ ...registro, descartadaEm: new Date().toISOString() })}\n`);
  registrarEvento(dirEstado, { tipo: 'pendente-descartado', ticket: op?.ticket ?? null, operacao: op?.tipo ?? null, erro });
  tirarDaFila(dirEstado, linha);
}

// Reenvia em ordem; para no primeiro erro passageiro; o erro permanente (ticket que não existe mais) vai para
// os descartados. Com outro reenvio em andamento, não envia nada.
export async function reenviarPendentes(dirEstado, o = {}) {
  const resultado = { enviados: 0, restam: 0, descartados: 0 };
  if (contarPendentes(dirEstado) === 0) return resultado;
  try {
    await comTrava(dirEstado, TRAVA_DO_REENVIO, async () => {
      for (const linha of lerLinhas(dirEstado)) {
        let op;
        try {
          op = JSON.parse(linha);
          conferirOp(op);
        } catch {
          descartar(dirEstado, linha, null, 'linha ilegível na fila');
          resultado.descartados++;
          continue;
        }
        const r = executarOp(op, o);
        if (r.codigo === 0) {
          tirarDaFila(dirEstado, linha);
          resultado.enviados++;
          continue;
        }
        const erro = `${r.erro}\n${r.saida}`.trim().split('\n')[0].slice(0, 300) || `o gh saiu com código ${r.codigo}`;
        if (!PERMANENTE.test(`${r.erro}\n${r.saida}`)) break;
        descartar(dirEstado, linha, op, erro);
        resultado.descartados++;
      }
    }, { esperaMs: 0, venceMs: VENCE_REENVIO_MS });
  } catch (e) {
    // Trava do reenvio com outro: não é erro, só não é a vez deste.
    if (!(e instanceof ErroDeEstado && e.arquivo?.endsWith(TRAVA_DO_REENVIO))) throw e;
  }
  resultado.restam = contarPendentes(dirEstado);
  return resultado;
}

// Para o começo dos comandos com rede: reenvia e, se o reenvio falhar, só avisa (nunca vira recusa).
export async function reenviarComAviso(dirEstado, o, avisar) {
  try {
    return await reenviarPendentes(dirEstado, o);
  } catch (e) {
    avisar(`Aviso: não consegui reenviar os comentários pendentes (${String(e?.message ?? e).split('\n')[0].slice(0, 200)}); sigo.\n`);
    return null;
  }
}
