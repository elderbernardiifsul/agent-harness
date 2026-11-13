import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ErroDeUso } from './caminhos.mjs';

// Executa o git com lista de argumentos (sem shell). Nunca lança. Processo que não rodou
// ou que morreu por sinal (status nulo, inclusive pelo `timeoutMs`) sai com código 127.
export function git(args, { cwd, env, timeoutMs } = {}) {
  const r = spawnSync('git', args, { cwd, env: env ?? process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...(timeoutMs ? { timeout: timeoutMs } : {}) });
  if (r.error) return { codigo: 127, saida: '', erro: String(r.error.message ?? r.error) };
  if (r.status == null) return { codigo: 127, saida: r.stdout ?? '', erro: r.stderr || `o git morreu (${r.signal ?? 'sem código'})` };
  return { codigo: r.status, saida: r.stdout ?? '', erro: r.stderr ?? '' };
}

export function ramoAtual(cwd, env) {
  const r = git(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd, env });
  return r.codigo === 0 ? r.saida.trim() : null;
}

export function topoDe(cwd, env) {
  const r = git(['rev-parse', '--show-toplevel'], { cwd, env });
  return r.codigo === 0 ? r.saida.trim() : null;
}

export function limpo(cwd, env) {
  const r = git(['status', '--porcelain'], { cwd, env });
  return r.codigo === 0 && r.saida.trim() === '';
}

export function existeRamo(cwd, ramo, { remoto = false, env } = {}) {
  const ref = remoto ? `refs/remotes/${remoto === true ? 'origin' : remoto}/${ramo}` : `refs/heads/${ramo}`;
  return git(['show-ref', '--verify', '--quiet', ref], { cwd, env }).codigo === 0;
}

const OPERACOES = [['rebase-merge', 'rebase'], ['rebase-apply', 'rebase'], ['MERGE_HEAD', 'merge'], ['CHERRY_PICK_HEAD', 'cherry-pick']];
// Como terminar ou abortar cada operação.
export const SAIDA_DA_OPERACAO = {
  rebase: 'git rebase --continue (ou git rebase --abort)',
  merge: 'git commit para terminar o merge (ou git merge --abort)',
  'cherry-pick': 'git cherry-pick --continue (ou git cherry-pick --abort)',
};

// Operação do git em andamento no worktree (`rebase`, `merge`, `cherry-pick`) ou null; o caminho de cada
// marca vem de `git rev-parse --git-path`, resolvido no próprio worktree.
export function operacaoEmAndamento(wt, env) {
  for (const [arquivo, nome] of OPERACOES) {
    const r = git(['rev-parse', '--git-path', arquivo], { cwd: wt, env });
    if (r.codigo !== 0) continue;
    if (fs.existsSync(path.resolve(wt, r.saida.trim()))) return nome;
  }
  return null;
}

// Operação em andamento ou worktree fora do ramo da frente: a recusa (com `comando` na saída) ou null.
// A operação vem antes: com conflito, mandar commitar as alterações concluiria a operação com os marcadores.
export function recusaDoWorktree(frente, wt, env, comando) {
  const op = operacaoEmAndamento(wt, env);
  if (op) {
    return new ErroDeUso(`O worktree ${wt} tem um ${op} em andamento.\nPróximo passo: termine ou aborte a operação no worktree (${SAIDA_DA_OPERACAO[op]}) e rode ${comando} de novo`);
  }
  const ramo = ramoAtual(wt, env);
  if (ramo !== frente.ramo) {
    return new ErroDeUso(`O worktree ${wt} está fora do ramo ${frente.ramo} (${ramo ? `no ramo ${ramo}` : 'HEAD solto'}).\n`
      + `Próximo passo: volte ao ramo da frente (git -C ${wt} switch ${frente.ramo}), trazendo para ele os commits que fez fora (git cherry-pick ou git merge), e rode ${comando} de novo`);
  }
  return null;
}
