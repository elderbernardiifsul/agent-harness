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
