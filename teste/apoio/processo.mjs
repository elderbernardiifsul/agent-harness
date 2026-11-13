import { spawn } from 'node:child_process';

// Processo filho que fica de pé até `matar()`, que só resolve depois do `exit`.
export function processoVivo() {
  const filho = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1e6)'], { stdio: 'ignore' });
  return {
    pid: filho.pid,
    matar() {
      return new Promise(resolve => {
        if (filho.exitCode !== null || filho.signalCode !== null) return resolve();
        filho.once('exit', () => resolve());
        filho.kill();
      });
    },
  };
}

// Filho que cria um neto, grava os dois pids e fica de pé.
export const SCRIPT_PAI_E_NETO = `
const { spawn } = require('node:child_process');
const neto = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1e6)'], { stdio: 'ignore' });
require('node:fs').writeFileSync(process.argv[1], JSON.stringify({ filho: process.pid, neto: neto.pid }));
setInterval(() => {}, 1e6);
`;
