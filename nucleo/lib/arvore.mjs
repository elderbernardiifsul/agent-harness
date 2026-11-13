// Rodar o comando da fila e matar a árvore inteira dele (desenho, seção 7), sem `/proc`.
// POSIX: o comando nasce em grupo de processos próprio (`detached`) e o sinal vai para o grupo.
// Windows: `taskkill /T /F` derruba a árvore pelo pid.
// Limite: um neto que sai do grupo (`setsid`, `nohup` em sessão nova) escapa no POSIX.
import { spawn, spawnSync } from 'node:child_process';

const dormir = ms => new Promise(r => setTimeout(r, ms));

const aspasDoCmd = a => (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(a) ? a : `"${String(a).replaceAll('"', '""')}"`);

// `comando`: texto (vai para o shell) ou argv (roda direto; no Windows, pelo cmd, para achar `.cmd`).
export function iniciar(comando, { cwd, env, plataforma = process.platform, stdio = 'inherit' } = {}) {
  const opcoes = { cwd, env, stdio };
  if (plataforma === 'win32') {
    const texto = Array.isArray(comando) ? comando.map(aspasDoCmd).join(' ') : comando;
    return spawn(env?.ComSpec ?? process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${texto}"`], { ...opcoes, windowsVerbatimArguments: true });
  }
  opcoes.detached = true;
  return Array.isArray(comando) ? spawn(comando[0], comando.slice(1), opcoes) : spawn('/bin/sh', ['-c', comando], opcoes);
}

// O grupo de processos `pgid` ainda tem algum processo? (POSIX; no Windows, sempre false.)
export function grupoExiste(pgid, plataforma = process.platform) {
  if (plataforma === 'win32' || !Number.isInteger(pgid) || pgid <= 0) return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

export function sinalNoGrupo(pgid, sinal, plataforma = process.platform) {
  if (plataforma === 'win32' || !Number.isInteger(pgid) || pgid <= 0) return;
  try { process.kill(-pgid, sinal); } catch { /* o grupo já acabou */ }
}

// Grupo do filho (POSIX: o pid dele, porque nasce líder do próprio grupo); null no Windows.
export const grupoDo = (filho, plataforma = process.platform) => (plataforma === 'win32' || !filho?.pid ? null : filho.pid);

// Mata a árvore do filho e só resolve quando ela acabou (ou depois do SIGKILL). `graçaMs`: quanto o
// SIGTERM tem antes do SIGKILL.
export async function matarArvore(filho, { plataforma = process.platform, gracaMs = 3000 } = {}) {
  const pid = filho?.pid;
  if (!pid) return;
  if (plataforma === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  sinalNoGrupo(pid, 'SIGTERM');
  const limite = Date.now() + gracaMs;
  while (grupoExiste(pid) && Date.now() < limite) await dormir(25);
  if (grupoExiste(pid)) {
    sinalNoGrupo(pid, 'SIGKILL');
    const fim = Date.now() + 2000;
    while (grupoExiste(pid) && Date.now() < fim) await dormir(25);
  }
}
