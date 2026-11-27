// Extensão `wiki`: a wiki do projeto como base de conhecimento com evidência conferida.
//
// Dor: conhecimento espalhado pelos documentos do projeto e respostas plausíveis sem fonte. A wiki
// (`docs/wiki/<tema>/<artigo>.md`, com index.md e log.md) é escrita pelo agente com as skills wiki-ingerir,
// wiki-consultar e wiki-conferir; o formato está em formato.md, nesta pasta. Esta extensão traz a parte
// determinística: `ah wiki conferir` (a invariante de evidência), `ah wiki fontes` (o que a wiki pode citar, pela
// configuração) e o aviso do doctor. Ela sugere e relata; nunca recusa o trabalho.
//
// Configuração opcional em extensoes.wiki: {pasta, fontes, foraDasFontes} (ver fontes.mjs).
// A conferência é reescrita de astro-han/karpathy-llm-wiki (MIT, commit eafcc77; LICENSE-karpathy-llm-wiki).

import fs from 'node:fs';
import path from 'node:path';
import { configDaWiki, listarFontes, validarConfig } from './fontes.mjs';
import { conferir, contagem, ehArtigo, existeWiki, relatorio } from './conferir.mjs';

const USO = 'ah wiki conferir [--json] [--pendentes] [<artigo>...] | fontes [--json]';

const recusa = (ctx, motivo, saida) => new ctx.ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);

// A raiz do checkout em que o comando roda: dentro do worktree de uma frente, a wiki e as fontes são as dele.
function raizDoTrabalho(ctx) {
  const r = ctx.git(['rev-parse', '--show-toplevel'], { cwd: ctx.cwd ?? ctx.raiz });
  return r.codigo === 0 && r.saida.trim() ? r.saida.trim() : ctx.raiz;
}

function lerOpcoes(args, ctx, aceitas) {
  const o = { json: false, pendentes: false, posicionais: [] };
  for (const a of args) {
    if (a === '--json' && aceitas.includes(a)) o.json = true;
    else if (a === '--pendentes' && aceitas.includes(a)) o.pendentes = true;
    else if (a.startsWith('--')) throw recusa(ctx, `Opção desconhecida: ${a.slice(0, 40)}`, `use ${USO}`);
    else o.posicionais.push(a);
  }
  return o;
}

function subConferir(args, ctx) {
  const o = lerOpcoes(args, ctx, ['--json', '--pendentes']);
  const cfg = configDaWiki(ctx.config);
  const raiz = raizDoTrabalho(ctx);
  if (!existeWiki(raiz, cfg)) {
    throw recusa(ctx, `Não achei a wiki em ${cfg.pasta} (${raiz}).`, `faça a primeira ingestão com a skill wiki-ingerir, que cria ${cfg.pasta}/index.md e log.md`);
  }
  const artigos = o.posicionais.map(a => {
    const rel = path.relative(raiz, path.resolve(ctx.cwd ?? raiz, a)).split(path.sep).join('/');
    if (!ehArtigo(rel, cfg)) {
      throw recusa(ctx, `${a.slice(0, 120)} não é artigo da wiki (fica fora de ${cfg.pasta}, ou é index.md ou log.md).`, `passe caminhos de artigos, relativos à raiz, como ${cfg.pasta}/<tema>/<artigo>.md`);
    }
    if (!fs.existsSync(path.join(raiz, rel))) throw recusa(ctx, `Não achei o artigo ${a.slice(0, 120)}.`, 'confira o caminho, relativo à raiz do projeto');
    return rel;
  });
  const r = conferir(raiz, cfg, artigos.length ? artigos : undefined);
  ctx.escrever(o.json ? `${JSON.stringify(r)}\n` : relatorio(r, { pendentes: o.pendentes }));
  return 0;
}

function subFontes(args, ctx) {
  const o = lerOpcoes(args, ctx, ['--json']);
  if (o.posicionais.length) throw recusa(ctx, `Argumento a mais: ${o.posicionais[0].slice(0, 40)}`, `use ${USO}`);
  const fontes = listarFontes(raizDoTrabalho(ctx), configDaWiki(ctx.config));
  ctx.escrever(o.json ? `${JSON.stringify({ fontes })}\n` : fontes.map(f => `${f}\n`).join(''));
  return 0;
}

const SUBCOMANDOS = { conferir: subConferir, fontes: subFontes };

export default {
  versaoDaInterface: 1,
  descricao: 'wiki do projeto com a evidência conferida nas fontes',
  validarConfig,

  comandos: {
    wiki: {
      descricao: 'confere a evidência da wiki e lista as fontes',
      uso: USO,
      requisitos: { sessao: false },
      executar([sub, ...args], ctx) {
        if (!Object.hasOwn(SUBCOMANDOS, sub ?? '')) {
          throw recusa(ctx, sub ? `Subcomando desconhecido: ${sub.slice(0, 40)}` : 'Falta o subcomando.', `use ${USO}`);
        }
        return SUBCOMANDOS[sub](args, ctx);
      },
    },
  },

  verificacoes: [{
    item: 'Evidência da wiki',
    // Só avisa: o suspeito é candidato, e quem julga é a skill wiki-conferir. Sem wiki ainda, nada a conferir.
    conferir(ctx) {
      const cfg = configDaWiki(ctx.config);
      if (!existeWiki(ctx.raiz, cfg)) return { estado: 'ok' };
      const { suspeitos, erros } = contagem(conferir(ctx.raiz, cfg));
      if (!suspeitos && !erros) return { estado: 'ok' };
      return {
        estado: 'aviso',
        detalhe: `${suspeitos} suspeito(s) de fidelidade e ${erros} erro(s) de evidência`,
        conserto: 'rode tools/ah wiki conferir e julgue cada um com a skill wiki-conferir',
      };
    },
  }],
};
