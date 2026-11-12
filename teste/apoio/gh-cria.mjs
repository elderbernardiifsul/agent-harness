// gh de mentira que, no primeiro comentário em ticket, mexe no worktree GH_CRIA (corrida com o close):
// GH_MODO=sujo deixa um arquivo novo; commit faz um commit novo; ign cria um arquivo ignorado.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
try { fs.readFileSync(0); } catch { /* sem entrada */ }
const dir = process.env.GH_CRIA;
if (argv[0] === 'issue' && argv[1] === 'comment' && dir && !fs.existsSync(path.join(dir, 'novo.txt'))) {
  fs.writeFileSync(path.join(dir, 'novo.txt'), 'x');
  if (process.env.GH_MODO === 'commit') {
    execFileSync('git', ['add', 'novo.txt'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'tarde'], { cwd: dir, stdio: 'ignore' });
  }
}
process.exit(0);
