// Sessão viva: o processo do agente existe e o sinal de vida não venceu (desenho, seção 6).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PADROES } from './config.mjs';
import { lerSessao, idadeDoSinalMs } from './sessao.mjs';

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
// (em tiques desde o boot); macOS e outros: `ps -o lstart=`; Windows não confere.
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
    const saida = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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

export function vidaDaSessao(dirEstado, id, { config, agora = Date.now(), existe, inicio } = {}) {
  const sessao = lerSessao(dirEstado, id);
  const idade = sessao ? idadeDoSinalMs(dirEstado, id, agora) : null;
  const opcoes = { idadeDoSinalMs: idade, prazoMs: prazoMs(config) };
  if (existe) opcoes.existe = existe;
  if (inicio) opcoes.inicio = inicio;
  return { ...estadoDaSessao(sessao, opcoes), idadeDoSinalMs: idade };
}
