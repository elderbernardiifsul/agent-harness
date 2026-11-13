import fs from 'node:fs';
import path from 'node:path';
import { ErroDeEstado, lerJson, gravarJson, validarNomeSeguro } from './estado.mjs';
import { ErroDeUso } from './caminhos.mjs';

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
// O erro sai marcado com `esquema: true` (o doctor o distingue do JSON quebrado).
export function conferirEsquema(obj, rotulo, arquivo = null) {
  const esquema = obj?.esquema;
  const onde = arquivo ? `${rotulo} em ${arquivo}` : rotulo;
  let erro = null;
  if (typeof esquema === 'number' && esquema > ESQUEMA_DO_ESTADO) {
    erro = new ErroDeEstado(`${onde} está no esquema ${esquema}, mais novo que o deste harness (${ESQUEMA_DO_ESTADO})`, arquivo, SAIDA_DE_ESQUEMA_NOVO);
  } else if (esquema !== undefined && esquema !== 1 && esquema !== ESQUEMA_DO_ESTADO) {
    erro = new ErroDeEstado(`${onde} tem um esquema que não reconheço: ${JSON.stringify(esquema)}`, arquivo,
      `conserte o campo "esquema" do arquivo (1 ou ${ESQUEMA_DO_ESTADO}) ou apague o arquivo${arquivo ? ` ${arquivo}` : ''}`);
  }
  if (erro) {
    erro.esquema = true;
    throw erro;
  }
  return esquema === ESQUEMA_DO_ESTADO ? ESQUEMA_DO_ESTADO : 1;
}

export function migrarSessao(obj, arquivo = null) {
  if (conferirEsquema(obj, 'A sessão', arquivo) === ESQUEMA_DO_ESTADO) return obj;
  const { sinal, ...resto } = obj;
  return { ...resto, esquema: ESQUEMA_DO_ESTADO, pidInicio: obj.pidInicio ?? null, motivoFim: obj.motivoFim ?? null };
}

const pastaDasSessoes = dirEstado => path.join(dirEstado, 'sessoes');
const arquivoDaSessao = (dirEstado, id) => path.join(pastaDasSessoes(dirEstado), `${validarNomeSeguro(id, 'Id da sessão')}.json`);
// A data de modificação deste arquivo é o sinal de vida; os ganchos tocam só ele.
const arquivoDoSinal = (dirEstado, id) => path.join(pastaDasSessoes(dirEstado), `${validarNomeSeguro(id, 'Id da sessão')}.sinal`);

export function lerSessao(dirEstado, id) {
  const arquivo = arquivoDaSessao(dirEstado, id);
  const obj = lerJson(arquivo, null);
  return obj === null ? null : migrarSessao(obj, arquivo);
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
    // Tomadas (ah takeover) desta sessão já avisadas no resumo: o aviso sai uma vez só.
    ...(Array.isArray(antiga?.tomadasAvisadas) ? { tomadasAvisadas: antiga.tomadasAvisadas } : {}),
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

// A sessão pelo id curto (prefixo do id; o id inteiro vale mesmo que seja prefixo de outro). Nenhuma ou mais de
// uma: ErroDeUso com a saída.
export function resolverSessao(dirEstado, curto) {
  const texto = String(curto ?? '');
  const { sessoes } = listarSessoes(dirEstado);
  const exata = sessoes.find(s => s.id === texto);
  if (exata) return exata;
  const achadas = texto ? sessoes.filter(s => String(s.id).startsWith(texto)) : [];
  if (!achadas.length) {
    throw new ErroDeUso(`Não achei sessão com o id ${texto.slice(0, 40) || '(vazio)'}.\nPróximo passo: confira o id em tools/ah board`);
  }
  if (achadas.length > 1) {
    throw new ErroDeUso(`O id ${texto.slice(0, 40)} é de mais de uma sessão: ${achadas.map(s => s.id).join(', ')}.\nPróximo passo: use mais letras do id`);
  }
  return achadas[0];
}
