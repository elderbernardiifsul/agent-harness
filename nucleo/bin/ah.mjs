#!/usr/bin/env node
import { readdirSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ErroDeUso, raizPrincipal, dirEstado as caminhoDoEstado } from '../lib/caminhos.mjs';
import { ErroDeConfig, carregarConfig } from '../lib/config.mjs';
import { ErroDeEstado } from '../lib/estado.mjs';
import { idDaSessao } from '../lib/sessao.mjs';

const DIR_COMANDOS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'comandos');
const NOME_VALIDO = /^[a-z][a-z0-9-]*$/;
const REQUISITOS_PADRAO = { config: true, sessao: true, repositorio: true };

const listar = dir => readdirSync(dir).filter(f => f.endsWith('.mjs')).map(f => f.slice(0, -4)).filter(n => NOME_VALIDO.test(n)).sort();

function recusar(avisar, motivo, saida) {
  avisar(`Recusado: ${motivo}\nFaça: ${saida}\n`);
  return 1;
}

async function ajuda(dir, escrever) {
  const nomes = listar(dir);
  const largura = Math.max(0, ...nomes.map(n => n.length));
  escrever('Uso: ah <comando> [argumentos]\n\nComandos:\n');
  for (const n of nomes) {
    const m = await import(pathToFileURL(path.join(dir, `${n}.mjs`)).href);
    escrever(`  ${n.padEnd(largura)}  ${m.descricao ?? ''}\n`);
  }
  return 0;
}

export async function despachar(argv, {
  cwd = process.cwd(), env = process.env, dirComandos = DIR_COMANDOS,
  escrever = t => process.stdout.write(t), avisar = t => process.stderr.write(t),
} = {}) {
  const [nome, ...args] = argv;
  if (nome === undefined || nome === '--help' || nome === '-h') return ajuda(dirComandos, escrever);
  // O nome vem do usuário: só vale se casar com o padrão E for um arquivo da pasta de comandos.
  if (!NOME_VALIDO.test(nome) || !listar(dirComandos).includes(nome)) {
    return recusar(avisar, `comando desconhecido: ${nome.slice(0, 40)}`, 'rode `ah --help` para ver os comandos');
  }
  try {
    const modulo = await import(pathToFileURL(path.join(dirComandos, `${nome}.mjs`)).href);
    const req = { ...REQUISITOS_PADRAO, ...(modulo.requisitos ?? {}) };

    let raiz = null;
    try {
      raiz = raizPrincipal(cwd);
    } catch (e) {
      if (req.repositorio !== false) throw e;
    }

    let config = null;
    if (raiz) {
      try {
        config = carregarConfig(raiz);
      } catch (e) {
        if (!(e instanceof ErroDeConfig)) throw e;
        if (req.config) {
          // Arquivo ausente: ainda não há projeto; arquivo existente mas inválido: mostra o erro.
          if (e.erros.every(x => x.motivo.includes('ENOENT'))) {
            return recusar(avisar, 'este projeto ainda não tem .harness/config.json', 'peça ao agente: prepare meu projeto (`ah init`)');
          }
          return recusar(avisar, e.message, 'corrija .harness/config.json (ou rode `ah doctor`)');
        }
      }
    }

    const sessaoId = idDaSessao(env);
    if (req.sessao && !sessaoId) {
      return recusar(avisar, 'não sei qual é a sessão', 'defina AH_SESSAO ou ligue o adaptador do agente');
    }

    const amb = {
      cwd, env, raiz, config,
      dirEstado: config ? caminhoDoEstado(config.projeto, env, process.platform, os.homedir()) : null,
      sessaoId: sessaoId || null,
      escrever, avisar,
    };
    return await modulo.executar(args, amb);
  } catch (e) {
    if (e instanceof ErroDeUso || e instanceof ErroDeEstado) {
      const [motivo, ...resto] = e.saida.split('\n');
      return recusar(avisar, motivo, resto.join('\n').replace(/^Próximo passo:\s*/, '') || 'rode `ah doctor`');
    }
    if (e instanceof ErroDeConfig) return recusar(avisar, e.message, 'corrija .harness/config.json');
    throw e;
  }
}

const eExecutavel = (() => {
  try {
    return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (eExecutavel) {
  despachar(process.argv.slice(2)).then(c => { process.exitCode = c; }, e => {
    process.stderr.write(`Erro inesperado: ${e?.message ?? e}\n`);
    process.exitCode = 2;
  });
}
