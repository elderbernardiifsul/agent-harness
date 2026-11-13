// Sessão viva: o processo do agente existe e o sinal de vida não venceu (desenho, seção 6).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PADROES } from './config.mjs';
import { lerSessao, gravarSessao, idadeDoSinalMs } from './sessao.mjs';
import { registrarEvento } from './estado.mjs';

const pidValido = pid => Number.isInteger(pid) && pid > 0;

function pidDoTexto(texto) {
  if (typeof texto !== 'string' || !/^[1-9]\d{0,9}$/.test(texto.trim())) return null;
  const n = Number(texto.trim());
  return pidValido(n) ? n : null;
}

// `process.kill(pid, 0)` vale nos três sistemas; EPERM quer dizer que existe, só não é nosso.
export function processoExiste(pid) {
  if (!pidValido(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

// Hora de início do processo, para notar pid reaproveitado. Linux: campo 22 de /proc/<pid>/stat
// (em tiques desde o boot); macOS e outros: `ps -o lstart=` em UTC e locale C; Windows não confere.
export function inicioDoProcesso(pid, plataforma = process.platform) {
  try {
    if (!pidValido(pid) || plataforma === 'win32') return null;
    if (plataforma === 'linux') {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      // O nome do processo (campo 2) vem entre parênteses e pode ter espaço: conta-se depois do último ")".
      const campos = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const valor = campos[22 - 3];
      return /^\d+$/.test(valor ?? '') ? valor : null;
    }
    const saida = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
      // lstart sai em hora local e no idioma do ambiente: fixa os dois para a leitura ser comparável.
      env: { ...process.env, TZ: 'UTC', LC_ALL: 'C' },
    }).trim();
    return saida || null;
  } catch {
    return null;
  }
}

// pid do agente visto por um gancho: o declarado em AH_PID_AGENTE, senão o processo pai do gancho.
export function pidDoAgente(env, ppid) {
  return pidDoTexto(env?.AH_PID_AGENTE) ?? (pidValido(ppid) ? ppid : null);
}

// pid que um comando `ah` grava: só o declarado (o próprio processo do `ah` morre logo).
export function pidDeComando(env) {
  return pidDoTexto(env?.AH_PID_AGENTE);
}

export function prazoMs(config) {
  return (config?.sessoes?.prazoDoSinalMin ?? PADROES.sessoes.prazoDoSinalMin) * 60000;
}

export function estadoDaSessao(sessao, { idadeDoSinalMs: idade, prazoMs: prazo, existe = processoExiste, inicio = inicioDoProcesso }) {
  if (!sessao) return { estado: 'desconhecida', motivo: 'sem registro' };
  if (sessao.fim) return { estado: 'encerrada', motivo: sessao.motivoFim ? `encerrada (${sessao.motivoFim})` : 'encerrada' };
  if (idade === null || idade === undefined || idade > prazo) return { estado: 'morta', motivo: 'sinal vencido' };
  if (sessao.pid != null) {
    if (!existe(sessao.pid)) return { estado: 'morta', motivo: 'processo não existe' };
    if (sessao.pidInicio != null) {
      const atual = inicio(sessao.pid);
      if (atual != null && atual !== sessao.pidInicio) return { estado: 'morta', motivo: 'pid reaproveitado' };
    }
  }
  return { estado: 'viva', motivo: 'viva' };
}

// O pid gravado morreu mas os ganchos da sessão continuam chegando: era o de um processo de
// vida curta (decisão 3). Descarta pid e hora de início; a vida passa a depender só do sinal.
// Grava a sessão: chamar sob comTrava(dirEstado, 'frentes').
export function descartarPidMorto(dirEstado, id, existe = processoExiste) {
  const s = lerSessao(dirEstado, id);
  if (!s || s.pid == null || existe(s.pid)) return false;
  gravarSessao(dirEstado, { ...s, pid: null, pidInicio: null });
  registrarEvento(dirEstado, { tipo: 'pid-instavel', sessao: id, pid: s.pid });
  return true;
}

export function vidaDaSessao(dirEstado, id, { config, agora = Date.now(), existe, inicio } = {}) {
  const sessao = lerSessao(dirEstado, id);
  const idade = sessao ? idadeDoSinalMs(dirEstado, id, agora) : null;
  const opcoes = { idadeDoSinalMs: idade, prazoMs: prazoMs(config) };
  if (existe) opcoes.existe = existe;
  if (inicio) opcoes.inicio = inicio;
  return { ...estadoDaSessao(sessao, opcoes), idadeDoSinalMs: idade };
}

// O processo do `ah open` que gravou o registro `abrindo` ({pid, inicio}) ainda está de pé?
// true/false; null quando o registro não guarda o processo. Sem hora de início gravada, vale só o pid;
// com ela, hora diferente é pid reaproveitado (morto); hora que não se lê agora não desmente o pid.
export function aberturaEmCurso(processo, { existe = processoExiste, inicio = inicioDoProcesso } = {}) {
  if (!processo || !pidValido(processo.pid)) return null;
  if (!existe(processo.pid)) return false;
  if (processo.inicio == null) return true;
  const atual = inicio(processo.pid);
  return atual == null || atual === processo.inicio;
}

// Registro `abrindo` parado: o processo do open morreu; registro sem processo: a dona não está viva.
export function aberturaParada(frente, donaViva, opcoes) {
  const emCurso = aberturaEmCurso(frente?.processo, opcoes);
  return emCurso === null ? !donaViva : !emCurso;
}

// Vida da dona de uma frente, a mesma para quem decide se ela pode ser tomada (takeover, sweep, board).
// null sem dona; registro que não existe é `desconhecida` (sem dona viva); registro que não se lê (JSON
// quebrado, esquema de um harness mais novo) é `ilegivel`, com o erro em `erro`: a dona pode estar viva.
export function vidaDaDona(dirEstado, id, opcoes = {}) {
  if (!id) return null;
  try {
    return vidaDaSessao(dirEstado, id, opcoes);
  } catch (e) {
    if (e?.name !== 'ErroDeEstado') throw e;
    return { estado: 'ilegivel', motivo: 'registro ilegível', idadeDoSinalMs: null, erro: e };
  }
}

// Frente órfã: ativa sem dona viva (dona morta, encerrada, sem registro ou nenhuma). Com o registro da dona
// ilegível não é órfã: ninguém a pode tomar até o arquivo ser consertado.
export const frenteOrfa = (f, vida) => f?.estado === 'ativa' && (!vida || (vida.estado !== 'viva' && vida.estado !== 'ilegivel'));
