import fs from 'node:fs';
import path from 'node:path';
import { ErroDeEstado, lerJson, gravarJson, validarNomeSeguro } from './estado.mjs';

// Nome da variável em que o Claude Code expõe o id da sessão (confirmar na sondagem).
export const VARIAVEL_SESSAO_CLAUDE = 'CLAUDE_CODE_SESSION_ID';

export function idDaSessao(env) {
  return env.AH_SESSAO || env[VARIAVEL_SESSAO_CLAUDE] || null;
}

export function idCurto(id) {
  return String(id).slice(0, 8);
}

export const ESQUEMA_DO_ESTADO = 2;
export const SAIDA_DE_ESQUEMA_NOVO = 'atualize o harness (ah init --sobrescrever a partir do clone novo)';

// Esquema 1 (fatia 1) vira 2 na leitura; o novo é gravado na próxima escrita. Esquema maior que o
// conhecido é de um harness mais novo: recusa em vez de adivinhar.
export function conferirEsquema(obj, rotulo) {
  const esquema = obj?.esquema;
  if (typeof esquema === 'number' && esquema > ESQUEMA_DO_ESTADO) {
    throw new ErroDeEstado(`${rotulo} está no esquema ${esquema}, mais novo que o deste harness (${ESQUEMA_DO_ESTADO})`, null, SAIDA_DE_ESQUEMA_NOVO);
  }
  if (esquema !== undefined && esquema !== 1 && esquema !== ESQUEMA_DO_ESTADO) {
    throw new ErroDeEstado(`${rotulo} tem um esquema que não reconheço: ${JSON.stringify(esquema)}`);
  }
  return esquema === ESQUEMA_DO_ESTADO ? ESQUEMA_DO_ESTADO : 1;
}

export function migrarSessao(obj) {
  if (conferirEsquema(obj, 'A sessão') === ESQUEMA_DO_ESTADO) return obj;
  const { sinal, ...resto } = obj;
  return { ...resto, esquema: ESQUEMA_DO_ESTADO, pidInicio: obj.pidInicio ?? null, motivoFim: obj.motivoFim ?? null };
}

const pastaDasSessoes = dirEstado => path.join(dirEstado, 'sessoes');
const arquivoDaSessao = (dirEstado, id) => path.join(pastaDasSessoes(dirEstado), `${validarNomeSeguro(id, 'Id da sessão')}.json`);
// A data de modificação deste arquivo é o sinal de vida; os ganchos tocam só ele.
const arquivoDoSinal = (dirEstado, id) => path.join(pastaDasSessoes(dirEstado), `${validarNomeSeguro(id, 'Id da sessão')}.sinal`);

export function lerSessao(dirEstado, id) {
  const obj = lerJson(arquivoDaSessao(dirEstado, id), null);
  return obj === null ? null : migrarSessao(obj);
}

export function gravarSessao(dirEstado, sessao) {
  gravarJson(arquivoDaSessao(dirEstado, sessao.id), sessao);
}

// `pid` nulo mantém o pid (e a hora de início) já gravados, como o do gancho.
export function registrarSessao(dirEstado, { id, agente, pid = null, pidInicio = null, modelo = null }) {
  const antiga = lerSessao(dirEstado, id);
  const comPid = pid !== null && pid !== undefined;
  const sessao = {
    esquema: ESQUEMA_DO_ESTADO,
    id,
    agente,
    papel: antiga?.papel ?? 'executor',
    frente: antiga?.frente ?? null,
    modelo: modelo ?? antiga?.modelo ?? null,
    pid: comPid ? pid : (antiga?.pid ?? null),
    pidInicio: comPid ? (pidInicio ?? null) : (antiga?.pidInicio ?? null),
    inicio: antiga?.inicio ?? new Date().toISOString(),
    fim: null,
    motivoFim: null,
  };
  gravarSessao(dirEstado, sessao);
  tocarSinal(dirEstado, id);
  return sessao;
}

export function tocarSinal(dirEstado, id) {
  const s = lerSessao(dirEstado, id);
  if (!s) return null;
  const arquivo = arquivoDoSinal(dirEstado, id);
  const agora = new Date();
  try {
    fs.utimesSync(arquivo, agora, agora);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, '');
    fs.utimesSync(arquivo, agora, agora);
  }
  return s;
}

export function idadeDoSinalMs(dirEstado, id, agora = Date.now()) {
  try {
    return Math.max(0, agora - fs.statSync(arquivoDoSinal(dirEstado, id)).mtimeMs);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  // Sessão do esquema 1 ainda não tocada por esta versão: vale o campo antigo.
  const bruta = lerJson(arquivoDaSessao(dirEstado, id), null);
  if (bruta && (bruta.esquema === 1 || bruta.esquema === undefined)) {
    const em = Date.parse(bruta.sinal);
    if (Number.isFinite(em)) return Math.max(0, agora - em);
  }
  return null;
}

export function encerrarSessao(dirEstado, id, motivo = null) {
  const s = lerSessao(dirEstado, id);
  if (!s) return null;
  s.fim = new Date().toISOString();
  s.motivoFim = motivo;
  gravarSessao(dirEstado, s);
  return s;
}

// Todas as sessões em disco, da mais antiga para a mais nova; as que não se leem vão por id em `ilegiveis`.
export function listarSessoes(dirEstado) {
  let nomes;
  try {
    nomes = fs.readdirSync(pastaDasSessoes(dirEstado));
  } catch (e) {
    if (e.code === 'ENOENT') return { sessoes: [], ilegiveis: [] };
    throw e;
  }
  const sessoes = [];
  const ilegiveis = [];
  for (const nome of nomes.filter(n => n.endsWith('.json') && !n.startsWith('.'))) {
    const id = nome.slice(0, -5);
    try {
      const s = lerSessao(dirEstado, id);
      if (s) sessoes.push(s);
    } catch (e) {
      if (e.name !== 'ErroDeEstado') throw e;
      ilegiveis.push(id);
    }
  }
  sessoes.sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)) || String(a.id).localeCompare(String(b.id)));
  return { sessoes, ilegiveis };
}

export function apagarSessao(dirEstado, id) {
  fs.rmSync(arquivoDaSessao(dirEstado, id), { force: true });
  fs.rmSync(arquivoDoSinal(dirEstado, id), { force: true });
}
