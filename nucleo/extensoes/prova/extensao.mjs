// Extensão `prova`: prova por árvore. A dor: o teste ponta a ponta é demorado, e depois do merge da frente na base
// ele costuma ser repetido "por garantia", mesmo quando o merge não mudou nada. O git identifica o conteúdo exato de
// um commit pela árvore (`HEAD^{tree}`): um `merge --no-ff` numa base parada produz a mesma árvore da frente.
//
// `ah prova <rótulo> [-- <comando>]` roda o teste no worktree da frente e, só se ele passar sem mudar a árvore,
// grava o rótulo, a árvore, o commit, o comando e a hora (na frente e numa lista que sobrevive ao close).
// `ah prova --confere <ramo> [<rótulo>]` sai 0 quando a árvore do ramo já foi provada e 3 quando não foi.
// Configuração opcional: `{"comandos": {"e2e": ["npm", "run", "e2e"]}}`, o comando padrão de cada rótulo.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROTULO = /^[a-z][a-z0-9:-]{0,39}$/;
const USO = 'ah prova <rótulo> [-- <comando>…] | ah prova --confere <ramo> [<rótulo>]';
const NAO_PROVADA = 3;

const curto = sha => sha.slice(0, 7);
const recusa = (ctx, motivo, saida) => new ctx.ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);
const provasDe = f => (Array.isArray(f?.extensoes?.prova?.provas) ? f.extensoes.prova.provas : []);
const arquivoDuravel = ctx => path.join(ctx.dirEstado, 'extensoes', 'prova', 'provas.jsonl');

// A lista durável: uma prova por linha, só de acréscimo. Linha ilegível é pulada (não impede as outras).
function lerDuraveis(ctx) {
  let texto = '';
  try { texto = fs.readFileSync(arquivoDuravel(ctx), 'utf8'); } catch { return []; }
  return texto.split('\n').flatMap(l => { try { return l ? [JSON.parse(l)] : []; } catch { return []; } });
}

function arvoreDe(ctx, ref, cwd) {
  const r = ctx.git(['rev-parse', '--verify', '-q', `${ref}^{tree}`], { cwd });
  return r.codigo === 0 ? r.saida.trim() : null;
}

// O que está no disco e não no commit: arquivo rastreado alterado e arquivo novo não rastreado (o teste o usaria,
// e a árvore do HEAD não o tem). O que o .gitignore ignora não conta.
function alterados(ctx, cwd) {
  const r = ctx.git(['status', '--porcelain'], { cwd });
  if (r.codigo !== 0) throw recusa(ctx, `não consegui ler o estado do worktree ${cwd}: ${r.erro.trim()}`, 'confira o worktree com git status');
  return r.saida.split('\n').filter(Boolean).map(l => l.slice(3));
}

async function gravar([rotulo, ...resto], ctx) {
  if (!ctx.sessaoId) throw recusa(ctx, 'não sei qual é a sessão', 'defina AH_SESSAO ou ligue o adaptador do agente');
  if (!ctx.frente) throw recusa(ctx, 'Esta sessão não tem frente.', 'abra uma com ah open <nome>');
  if (!ROTULO.test(rotulo ?? '')) throw recusa(ctx, `Rótulo inválido: ${String(rotulo).slice(0, 40)}`, 'use minúsculas, números, hífen e dois-pontos, começando por letra (ex.: e2e)');
  if (resto.length && resto[0] !== '--') throw recusa(ctx, `Argumento a mais: ${resto[0].slice(0, 40)}`, `use ${USO}`);
  const comando = resto.length ? resto.slice(1) : ctx.config.comandos?.[rotulo];
  if (!comando?.length) {
    throw recusa(ctx, `Não sei qual é o teste ${rotulo}.`, `diga depois de -- (ah prova ${rotulo} -- npm test) ou declare em extensoes.prova.comandos.${rotulo}`);
  }
  const f = ctx.frente;
  const wt = f.worktree;
  const sujos = alterados(ctx, wt);
  if (sujos.length) {
    throw recusa(ctx, `o worktree tem mudança fora do commit (${sujos.slice(0, 5).join(', ')}${sujos.length > 5 ? ', …' : ''}): a árvore testada não seria a do HEAD.`,
      'commite, ponha no .gitignore o que é gerado, ou desfaça, e rode ah prova de novo');
  }
  const antes = arvoreDe(ctx, 'HEAD', wt);
  // Depois de --, um argumento só vai para o shell (como no ah pesado); vários rodam direto. O da configuração
  // é sempre uma lista argv, rodada sem shell.
  const umSo = resto.length === 2;
  const r = spawnSync(comando[0], comando.slice(1), { cwd: wt, env: ctx.env, stdio: 'inherit', shell: umSo });
  const codigo = r.status ?? 1;
  if (r.error || codigo !== 0) {
    ctx.escrever(`O teste ${rotulo} falhou (código ${codigo}${r.error ? `, ${r.error.message}` : ''}): nada gravado.\n`);
    return codigo || 1;
  }
  // O teste pode ter gerado arquivo rastreado (snapshot, formatação) ou commitado: então a árvore provada não é a de antes.
  if (alterados(ctx, wt).length || arvoreDe(ctx, 'HEAD', wt) !== antes) {
    throw recusa(ctx, `o teste ${rotulo} passou, mas a árvore mudou durante o teste; nada gravado.`, 'commite o que o teste gerou (ou ponha no .gitignore) e rode ah prova de novo');
  }
  const prova = { rotulo, arvore: antes, commit: ctx.git(['rev-parse', 'HEAD'], { cwd: wt }).saida.trim(), comando, em: new Date().toISOString() };
  // Uma prova por rótulo na frente: a nova substitui a anterior do mesmo rótulo.
  const anteriores = secao => (Array.isArray(secao.provas) ? secao.provas : []).filter(p => p.rotulo !== rotulo);
  await ctx.gravarCampos(f.nome, secao => ({ provas: [...anteriores(secao), prova] }));
  fs.mkdirSync(path.dirname(arquivoDuravel(ctx)), { recursive: true });
  fs.appendFileSync(arquivoDuravel(ctx), `${JSON.stringify({ id: f.id, frente: f.nome, ...prova })}\n`);
  ctx.escrever(`Prova gravada: ${rotulo} na frente ${f.id} ${f.nome}, árvore ${curto(antes)} (commit ${curto(prova.commit)}).\n`);
  return 0;
}

function conferir([ref, rotulo, ...resto], ctx) {
  if (!ref || resto.length) throw recusa(ctx, 'Faltam ou sobram argumentos.', `use ${USO}`);
  const arvore = arvoreDe(ctx, ref);
  if (!arvore) throw recusa(ctx, `${ref.slice(0, 60)} não é um ramo nem um commit deste repositório.`, 'confira o nome com git branch -a');
  const vivas = ctx.frentes().flatMap(f => provasDe(f).map(p => ({ id: f.id, frente: f.nome, ...p })));
  const achada = [...lerDuraveis(ctx), ...vivas].find(p => p.arvore === arvore && (!rotulo || p.rotulo === rotulo));
  if (!achada) {
    ctx.escrever(`Árvore ${curto(arvore)} de ${ref}: nenhuma prova${rotulo ? ` ${rotulo}` : ''}. Rode o teste.\n`);
    return NAO_PROVADA;
  }
  ctx.escrever(`Árvore ${curto(arvore)} de ${ref} provada pela frente ${achada.id} ${achada.frente} (${achada.rotulo}, commit ${curto(achada.commit)}, em ${achada.em}): não precisa repetir o teste.\n`);
  return 0;
}

export default {
  versaoDaInterface: 1,
  descricao: 'prova por árvore: grava a árvore testada e confere antes de repetir o teste',

  validarConfig(c) {
    for (const k of Object.keys(c)) if (k !== 'comandos') return `campo desconhecido: ${k} (só vale comandos)`;
    const cs = c.comandos;
    if (cs === undefined) return null;
    if (cs === null || typeof cs !== 'object' || Array.isArray(cs)) return 'comandos deve ser um objeto {rótulo: ["programa", "argumento", …]}';
    for (const [r, argv] of Object.entries(cs)) {
      if (!ROTULO.test(r)) return `rótulo inválido em comandos: ${r}`;
      if (!Array.isArray(argv) || !argv.length || !argv.every(a => typeof a === 'string' && a !== '')) return `comandos.${r} deve ser uma lista não vazia de textos, como ["npm", "test"]`;
    }
    return null;
  },

  comandos: {
    prova: {
      descricao: 'grava a árvore testada depois que o teste passa, ou confere se a árvore de um ramo já foi provada',
      uso: USO,
      // --confere só lê; gravar exige sessão e frente, e recusa sem elas.
      requisitos: { sessao: false },
      executar(args, ctx) {
        return args[0] === '--confere' ? conferir(args.slice(1), ctx) : gravar(args, ctx);
      },
    },
  },

  colunas: [{
    titulo: 'PROVA',
    valor: f => {
      const p = provasDe(f).at(-1);
      return p ? `${p.rotulo} ${curto(p.arvore)}` : '';
    },
  }],
};
