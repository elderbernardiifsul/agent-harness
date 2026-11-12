import path from 'node:path';
import { lerJson, gravarJson } from './estado.mjs';

// Nome da variável em que o Claude Code expõe o id da sessão (confirmar na sondagem).
export const VARIAVEL_SESSAO_CLAUDE = 'CLAUDE_CODE_SESSION_ID';

export function idDaSessao(env) {
  return env.AH_SESSAO || env[VARIAVEL_SESSAO_CLAUDE] || null;
}

export function idCurto(id) {
  return String(id).slice(0, 8);
}

const arquivoDaSessao = (dirEstado, id) => path.join(dirEstado, 'sessoes', `${id}.json`);

export function lerSessao(dirEstado, id) {
  return lerJson(arquivoDaSessao(dirEstado, id), null);
}

export function gravarSessao(dirEstado, sessao) {
  gravarJson(arquivoDaSessao(dirEstado, sessao.id), sessao);
}

export function registrarSessao(dirEstado, { id, agente, pid, modelo = null }) {
  const agora = new Date().toISOString();
  const antiga = lerSessao(dirEstado, id);
  const sessao = {
    esquema: 1, id, agente, papel: 'executor', frente: null, modelo, pid, inicio: agora, sinal: agora, fim: null,
    ...(antiga ? { papel: antiga.papel, frente: antiga.frente, inicio: antiga.inicio } : {}),
  };
  if (antiga && modelo === null) sessao.modelo = antiga.modelo ?? null;
  gravarSessao(dirEstado, sessao);
  return sessao;
}

export function tocarSinal(dirEstado, id) {
  const s = lerSessao(dirEstado, id);
  if (!s) return null;
  s.sinal = new Date().toISOString();
  gravarSessao(dirEstado, s);
  return s;
}

export function encerrarSessao(dirEstado, id) {
  const s = lerSessao(dirEstado, id);
  if (!s) return null;
  s.fim = new Date().toISOString();
  gravarSessao(dirEstado, s);
  return s;
}
