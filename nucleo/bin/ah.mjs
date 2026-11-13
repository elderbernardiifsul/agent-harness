#!/usr/bin/env node
import { readdirSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ErroDeUso, raizPrincipal, dirEstado as caminhoDoEstado } from '../lib/caminhos.mjs';
import { ErroDeConfig, carregarConfig, configAusente } from '../lib/config.mjs';
import { ErroDeEstado, registrarEvento } from '../lib/estado.mjs';
import { idDaSessao, lerSessao } from '../lib/sessao.mjs';
import { carregarExtensoes, comandosDasExtensoes, frenteDaSessao, mensagemDe, montarCtx, CONSERTO_PADRAO } from '../lib/extensoes.mjs';

const DIR_COMANDOS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'comandos');
const NOME_VALIDO = /^[a-z][a-z0-9-]*$/;
const REQUISITOS_PADRAO = { config: true, sessao: true, repositorio: true };

const listar = dir => readdirSync(dir).filter(f => f.endsWith('.mjs')).map(f => f.slice(0, -4)).filter(n => NOME_VALIDO.test(n)).sort();

function recusar(avisar, motivo, saida) {
  avisar(`Recusado: ${motivo}\nFaça: ${saida}\n`);
  return 1;
}

// Os comandos das extensões ligadas no projeto de `cwd` (Map vazio fora de projeto ou com configuração inválida).
// `avisar`: avisa das extensões que não carregaram.
async function comandosDeExtensao(cwd, avisar = null) {
  let raiz;
  let config;
  try {
    raiz = raizPrincipal(cwd);
    config = carregarConfig(raiz);
  } catch {
    return new Map();
  }
  try {
    return comandosDasExtensoes((await carregarExtensoes({ raiz, config }, { avisar })).ativas);
  } catch {
    return new Map();
  }
}

async function ajuda(dir, escrever, cwd) {
  const nomes = listar(dir);
  const extras = await comandosDeExtensao(cwd);
  const largura = Math.max(0, ...nomes.map(n => n.length), ...[...extras.keys()].map(n => n.length));
  escrever('Uso: ah <comando> [argumentos]\n\nComandos:\n');
  for (const n of nomes) {
    const m = await import(pathToFileURL(path.join(dir, `${n}.mjs`)).href);
    escrever(`  ${n.padEnd(largura)}  ${m.descricao ?? ''}\n`);
  }
  if (extras.size) {
    escrever('\nComandos de extensões:\n');
    for (const [n, { extensao, comando }] of [...extras].sort(([a], [b]) => (a < b ? -1 : 1))) {
      escrever(`  ${n.padEnd(largura)}  ${comando.descricao} (extensão ${extensao.nome})\n`);
    }
  }
  escrever('\nPara o uso de um comando: ah <comando> --help\n');
  return 0;
}

// Um comando de extensão no formato de módulo de comando do núcleo: o `executar` recebe o ctx da extensão, com a
// frente em foco da sessão. Erro que não é recusa vira recusa com o nome da extensão.
function moduloDaExtensao(nome, { extensao, comando }) {
  return {
    descricao: comando.descricao,
    uso: comando.uso ?? `ah ${nome}`,
    requisitos: comando.requisitos,
    async executar(args, amb) {
      const ctx = montarCtx(extensao, amb, { frente: frenteDaSessao(amb.dirEstado, amb.sessaoId, lerSessao) });
      try {
        const codigo = await comando.executar(args, ctx);
        return Number.isInteger(codigo) ? codigo : 0;
      } catch (e) {
        if (e instanceof ErroDeUso || e instanceof ErroDeEstado) throw e;
        throw new ErroDeUso(`a extensão ${extensao.nome} falhou no comando ${nome}: ${mensagemDe(e)}\nPróximo passo: ${CONSERTO_PADRAO}`);
      }
    },
  };
}

// `--help` ou `-h` antes de um `--` pede a ajuda do comando.
const pedeAjuda = args => {
  const fim = args.indexOf('--');
  return (fim < 0 ? args : args.slice(0, fim)).some(a => a === '--help' || a === '-h');
};

export async function despachar(argv, {
  cwd = process.cwd(), env = process.env, dirComandos = DIR_COMANDOS,
  escrever = t => process.stdout.write(t), avisar = t => process.stderr.write(t),
} = {}) {
  const [nome, ...args] = argv;
  if (nome === undefined || nome === '--help' || nome === '-h') return ajuda(dirComandos, escrever, cwd);
  // O nome vem do usuário: só vale se casar com o padrão E for um arquivo da pasta de comandos ou um comando de
  // extensão ligada.
  const doNucleo = NOME_VALIDO.test(nome) && listar(dirComandos).includes(nome);
  const daExtensao = !doNucleo && NOME_VALIDO.test(nome) ? (await comandosDeExtensao(cwd, avisar)).get(nome) : undefined;
  if (!doNucleo && !daExtensao) {
    return recusar(avisar, `comando desconhecido: ${nome.slice(0, 40)}`, 'rode `ah --help` para ver os comandos');
  }
  let amb = null;
  try {
    const modulo = daExtensao ? moduloDaExtensao(nome, daExtensao) : await import(pathToFileURL(path.join(dirComandos, `${nome}.mjs`)).href);
    if (pedeAjuda(args)) {
      escrever(`ah ${nome}: ${modulo.descricao ?? ''}\nUso: ${modulo.uso ?? `ah ${nome}`}\n`);
      return 0;
    }
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
          if (configAusente(e)) {
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

    amb = {
      cwd, env, raiz, config,
      dirEstado: config ? caminhoDoEstado(config.projeto, env, process.platform, os.homedir()) : null,
      sessaoId: sessaoId || null,
      escrever, avisar,
    };
    return await modulo.executar(args, amb);
  } catch (e) {
    if (e instanceof ErroDeUso || e instanceof ErroDeEstado) {
      const [motivo, ...resto] = e.saida.split('\n');
      // Recusa de comando também vai para os eventos (decisão 12); falhar aqui não muda a recusa. A de uma
      // simulação (`semRegistro`) não: simular não grava nada.
      if (e instanceof ErroDeUso && !e.semRegistro && amb?.dirEstado) {
        try {
          registrarEvento(amb.dirEstado, { tipo: 'recusa-de-comando', comando: nome, sessao: amb.sessaoId, motivo });
        } catch { /* sem como registrar: a recusa sai do mesmo jeito */ }
      }
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
