// Coleção de skills de mentira: um repositório git local descartável que faz o papel da origem de uma coleção
// (nenhum teste usa a rede). Tem as skills dadas, um arquivo LICENSE e, se pedido, uma tag.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// `skills`: {<pasta>: {<arquivo>: conteúdo}}. `executaveis`: caminhos (a partir da raiz da coleção) que levam o bit
// de execução. `tag`: nome da tag posta no primeiro commit.
export function criarColecao({ skills = {}, executaveis = [], tag = null } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ah-colecao-')));
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: path.join(dir, '.nada'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'ana-souza', GIT_AUTHOR_EMAIL: 'ana@exemplo.test',
    GIT_COMMITTER_NAME: 'ana-souza', GIT_COMMITTER_EMAIL: 'ana@exemplo.test',
  };
  const git = (...args) => {
    const r = spawnSync('git', ['-C', dir, ...args], { env, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const gravar = (caminho, conteudo) => {
    const alvo = path.join(dir, caminho);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, conteudo);
  };

  git('init', '-q', '-b', 'main');
  // Permite buscar um commit pelo número, como o GitHub permite.
  git('config', 'uploadpack.allowAnySHA1InWant', 'true');
  gravar('LICENSE', 'Licença de mentira (MIT)\n');
  for (const [pasta, arquivos] of Object.entries(skills)) {
    for (const [arquivo, conteudo] of Object.entries(arquivos)) gravar(path.join(pasta, arquivo), conteudo);
  }
  for (const e of executaveis) fs.chmodSync(path.join(dir, e), 0o755);
  git('add', '-A');
  git('commit', '-q', '-m', 'primeira versão');
  if (tag) git('tag', tag);

  return {
    origem: `file://${dir}`,
    commit: git('rev-parse', 'HEAD'),
    dir,
    // `mudancas`: {<caminho>: conteúdo, ou null para apagar}. Devolve o commit novo.
    novoCommit(mudancas) {
      for (const [caminho, conteudo] of Object.entries(mudancas)) {
        if (conteudo === null) fs.rmSync(path.join(dir, caminho), { force: true });
        else gravar(caminho, conteudo);
      }
      git('add', '-A');
      git('commit', '-q', '-m', 'nova versão');
      return git('rev-parse', 'HEAD');
    },
    limpar() { fs.rmSync(dir, { recursive: true, force: true }); },
  };
}
