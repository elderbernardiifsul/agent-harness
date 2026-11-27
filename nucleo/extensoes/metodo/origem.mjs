// Cache das coleções na máquina e busca da origem num commit ou tag.
// Resolve a dor de baixar a coleção a cada projeto: um clone raso por coleção, reaproveitado enquanto o ref não muda.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// O git da busca nunca para esperando senha (sem terminal, o comando ficaria pendurado) e tem tempo limite folgado.
const TEMPO_DO_GIT_MS = 300000;

// Onde ficam as coleções baixadas: AH_CACHE (relativo vira absoluto), ou o cache da máquina conforme o sistema.
// Variável vazia vale como ausente.
export function dirDoCache(env, plataforma = process.platform, casa = os.homedir()) {
  if (env.AH_CACHE) return path.resolve(env.AH_CACHE);
  let base;
  if (plataforma === 'win32') base = env.LOCALAPPDATA || path.join(casa, 'AppData', 'Local');
  else if (plataforma === 'darwin') base = path.join(casa, 'Library', 'Caches');
  else base = env.XDG_CACHE_HOME || path.join(casa, '.cache');
  return path.join(base, 'agent-harness', 'colecoes');
}

// Garante `<dirCache>/<nome>` com `ref` (commit ou tag) em HEAD destacado e devolve {dir, commit}.
// `git` é o ctx.git: recebe a lista de argumentos e as opções ({env, timeoutMs}) e devolve {codigo, saida, erro}.
// `env` é o ambiente de quem chama. Falha lança Error com a mensagem do git.
export function buscar({ nome, origem, ref, dirCache, git, env = process.env }) {
  // Um ref começando por "-" seria lido pelo git como opção.
  if (!ref || ref.startsWith('-') || /\s/.test(ref)) throw new Error(`ref inválido: ${String(ref).slice(0, 40)} (use um commit completo ou o nome de uma tag)`);
  const dir = path.join(dirCache, nome);
  // LC_ALL=C: as mensagens do git saem sempre em inglês, e quem chama reconhece "ref não encontrado" por elas.
  const opcoes = { env: { ...env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }, timeoutMs: TEMPO_DO_GIT_MS };
  const g = (...args) => git(['-C', dir, ...args], opcoes);
  const certo = (r, o_que) => {
    if (r.codigo !== 0) throw new Error(`${o_que}: ${(r.erro || r.saida).trim()}`);
    return r.saida.trim();
  };

  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(dir, { recursive: true });
    certo(g('init', '-q'), `git init em ${dir}`);
  }
  // A origem pode ter mudado de endereço desde a última vez.
  const atualOrigem = g('remote', 'get-url', 'origin');
  if (atualOrigem.codigo !== 0) certo(g('remote', 'add', 'origin', origem), 'git remote add');
  else if (atualOrigem.saida.trim() !== origem) certo(g('remote', 'set-url', 'origin', origem), 'git remote set-url');

  // Já está no ref? Commit: HEAD igual. Tag: lembramos qual ref trouxe o HEAD de agora.
  const cabeca = g('rev-parse', 'HEAD');
  if (cabeca.codigo === 0) {
    const commit = cabeca.saida.trim();
    const lembrado = g('config', '--get', 'ah.ref');
    if (commit === ref || (lembrado.codigo === 0 && lembrado.saida.trim() === ref)) return { dir, commit };
  }

  certo(g('fetch', '--quiet', '--depth', '1', 'origin', ref), `git fetch ${ref} de ${origem}`);
  certo(g('checkout', '--quiet', '--detach', 'FETCH_HEAD'), 'git checkout');
  const commit = certo(g('rev-parse', 'HEAD'), 'git rev-parse');
  certo(g('config', 'ah.ref', ref), 'git config');
  return { dir, commit };
}
