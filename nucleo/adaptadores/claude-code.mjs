// Adaptador do Claude Code: traduz o JSON que o gancho recebe na entrada padrão para
// o contrato neutro (contrato.mjs) e a resposta do contrato para saída, erro e código.
// Formato conferido no ensaio de docs/referencia/capacidades-por-agente.md.
import fs from 'node:fs';
import path from 'node:path';
import { validarNomeSeguro } from '../lib/estado.mjs';

export const AGENTE = 'claude-code';

const LIMITE_ID = 128;
const EVENTOS = { SessionStart: 'inicio', UserPromptSubmit: 'sinal', Stop: 'sinal', PreToolUse: 'antes', SessionEnd: 'fim' };
const ORIGENS = { startup: 'novo', clear: 'continuacao', resume: 'continuacao', compact: 'continuacao', fork: 'continuacao' };
// Ferramenta -> campo de tool_input com o comando ou o arquivo.
const COMANDOS = { Bash: 'command', PowerShell: 'command', Monitor: 'command' };
const EDICOES = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' };

// Entrada que não serve. `tipo` é o tipo provável do evento no contrato (ou 'desconhecido'),
// para o gancho saber qual regra de quebra aplicar.
export class ErroDeEntrada extends Error {
  constructor(motivo, tipo) {
    super(motivo);
    this.name = 'ErroDeEntrada';
    this.tipo = tipo;
  }
}

const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const descrever = v => (typeof v === 'string' ? JSON.stringify(v.slice(0, 40)) : typeof v);

// Tipo provável do evento a partir do JSON ou do texto cru (quando o JSON não fecha).
export function tipoProvavel(entrada) {
  if (eObjeto(entrada)) return Object.hasOwn(EVENTOS, entrada.hook_event_name) ? EVENTOS[entrada.hook_event_name] : 'desconhecido';
  if (typeof entrada === 'string') {
    const m = /"hook_event_name"\s*:\s*"([A-Za-z]+)"/.exec(entrada);
    if (m && Object.hasOwn(EVENTOS, m[1])) return EVENTOS[m[1]];
  }
  return 'desconhecido';
}

function acaoDe(json, tipo) {
  const nome = json.tool_name;
  if (!eObjeto(json.tool_input)) throw new ErroDeEntrada('tool_input não é um objeto', tipo);
  if (Object.hasOwn(COMANDOS, nome)) {
    const comando = json.tool_input[COMANDOS[nome]];
    if (typeof comando !== 'string') throw new ErroDeEntrada(`tool_input.command de ${nome} não é texto`, tipo);
    return nome === 'Bash' ? { tipo: 'comando', comando, shell: 'posix' } : { tipo: 'comando', comando };
  }
  if (Object.hasOwn(EDICOES, nome)) {
    const arquivo = json.tool_input[EDICOES[nome]];
    if (typeof arquivo !== 'string' || arquivo === '') throw new ErroDeEntrada(`tool_input.${EDICOES[nome]} de ${nome} não é um caminho`, tipo);
    return { tipo: 'edicao', arquivo, ferramenta: nome };
  }
  throw new ErroDeEntrada(`ferramenta desconhecida: ${descrever(nome)}`, tipo);
}

// Ação que dá para tirar de uma entrada que falhou na tradução, só para as exceções da
// regra de quebra (chamada ao `ah`, edição da configuração). Nunca lança.
export function acaoLeniente(json) {
  try {
    return eObjeto(json) ? acaoDe(json, 'antes') : null;
  } catch {
    return null;
  }
}

// O cwd tem de ser uma pasta absoluta que existe: relativo seria resolvido contra a pasta do processo.
function pastaAbsoluta(cwd) {
  if (typeof cwd !== 'string' || cwd === '' || !path.isAbsolute(cwd)) return false;
  try {
    return fs.statSync(cwd).isDirectory();
  } catch {
    return false;
  }
}

export function traduzirEntrada(json) {
  if (!eObjeto(json)) return null;
  const tipo = tipoProvavel(json);
  if (tipo === 'desconhecido') throw new ErroDeEntrada(`evento desconhecido: ${descrever(json.hook_event_name)}`, tipo);
  const sessao = json.session_id;
  if (typeof sessao !== 'string' || sessao.length > LIMITE_ID) throw new ErroDeEntrada(`session_id inválido: ${descrever(sessao)}`, tipo);
  try {
    validarNomeSeguro(sessao, 'session_id');
  } catch {
    throw new ErroDeEntrada(`session_id inválido: ${descrever(sessao)}`, tipo);
  }
  if (!pastaAbsoluta(json.cwd)) throw new ErroDeEntrada(`cwd inválido: ${descrever(json.cwd)}`, tipo);
  const base = { tipo, agente: AGENTE, sessao, cwd: json.cwd };
  if (tipo === 'inicio') {
    const origem = Object.hasOwn(ORIGENS, json.source) ? ORIGENS[json.source] : 'novo';
    return { ...base, origem, modelo: typeof json.model === 'string' && json.model ? json.model : null };
  }
  if (tipo === 'antes') return { ...base, acao: acaoDe(json, tipo) };
  return base;
}

// No PreToolUse, código 2 recusa e a saída de erro chega ao modelo. No SessionStart, a
// saída padrão entra no contexto. No Stop, código 2 faria o agente continuar: os outros
// eventos sempre saem com 0, e um aviso vai para a saída de erro.
export function traduzirSaida(evento, resposta) {
  if (evento?.tipo === 'antes' && resposta?.decisao === 'recusa') return { saida: '', erro: String(resposta.mensagem), codigo: 2 };
  if (resposta?.aviso) return { saida: '', erro: String(resposta.aviso), codigo: 0 };
  if (evento?.tipo === 'inicio') return { saida: String(resposta?.contexto ?? ''), erro: '', codigo: 0 };
  return { saida: '', erro: '', codigo: 0 };
}
