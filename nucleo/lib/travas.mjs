// Travas que leem o texto de um comando (já interpretado por shell.mjs) e decidem
// recusar ou permitir. São puras: nada de git nem de disco; tudo vem pelo `ctx`.
//
//   T0  texto que não dá para ler com segurança e que menciona git ou gh
//   T2  git add/commit que pega tudo, no checkout principal
//   T5  push e merge de PR em ramo protegido
//
// Limites conhecidos (a trava enxerga a mais, não a tudo): apelidos do git
// (`-c alias.x=push`), `gh api` direto, `push.default` e `remote.*.push` da
// configuração, `git add` com glob do shell que cobre tudo sem ser `*` solto
// (`*.*`, `[a-z]*`) e caminhos que chegam por `xargs` ou `--pathspec-from-file`.
import path from 'node:path';
import { comandosSimples, ErroDeShell } from './shell.mjs';
import { recusa } from './recusa.mjs';

const PALAVRA_GIT = /(?<![A-Za-z0-9_])(git|gh)(?![A-Za-z0-9_])/i;

const nomeDe = argv0 => (argv0 ?? '').split(/[\\/]/).pop().replace(/\.exe$/i, '');

// Opções globais do git que levam um valor separado.
const GIT_GLOBAL_COM_VALOR = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--exec-path']);

// Separa `git [opções] sub args...`. Devolve {sub, args} ou null se não há subcomando.
// `incerto` é verdadeiro quando uma opção global ou variável aponta para outro repositório.
const ehRepoExplicito = a => /^--(git-dir|work-tree)(=|$)/.test(a);
function subcomandoGit(argv, env = {}) {
  let k = 1;
  let incerto = env.GIT_DIR !== undefined || env.GIT_WORK_TREE !== undefined;
  while (k < argv.length && argv[k].startsWith('-')) {
    if (ehRepoExplicito(argv[k])) incerto = true;
    k += GIT_GLOBAL_COM_VALOR.has(argv[k]) ? 2 : 1;
  }
  if (k >= argv.length) return null;
  return { sub: argv[k], args: argv.slice(k + 1), incerto };
}

// `--al` e `--all` valem; o git aceita abreviação única.
const ehLongoAll = a => a.length >= 4 && '--all'.startsWith(a);

// ---------------------------------------------------------------- T2

const ADD_TUDO = new Set(['.', './', ':/', ':(top)']);
const naoLiteral = a => /[$`]/.test(a);

// O caminho `p` é a raiz do repositório ou uma pasta acima dela.
function cobreARaiz(p, raiz) {
  const r = path.relative(path.resolve(p), path.resolve(raiz));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

// Um pathspec pega tudo quando é uma das formas de "tudo", `*` solto (ou `<pasta>/*`) numa pasta
// que cobre a raiz, ou um caminho que resolve para a raiz ou acima dela. Com cwd desconhecido,
// um caminho relativo com `..` pode ser a raiz.
function pathspecPegaTudo(a, cwd, raiz) {
  if (ADD_TUDO.has(a) || a.startsWith(':(top')) return true;
  if (a.startsWith(':')) return false;
  const partes = a.split(/[\\/]/);
  const pasta = partes.at(-1) === '*' ? (partes.length === 1 ? '.' : partes.slice(0, -1).join('/') || '/') : a;
  if (path.isAbsolute(pasta)) return cobreARaiz(pasta, raiz);
  if (cwd == null) return pasta === '.' || pasta.split(/[\\/]/).includes('..');
  return cobreARaiz(path.resolve(cwd, pasta), raiz);
}

// Classifica os pathspecs: 'tudo', 'ilegivel' (variável ou substituição) ou null.
function classificarPathspecs(pathspecs, cwd, raiz) {
  let ilegivel = false;
  for (const a of pathspecs) {
    if (naoLiteral(a)) { ilegivel = true; continue; }
    if (pathspecPegaTudo(a, cwd, raiz)) return 'tudo';
  }
  return ilegivel ? 'ilegivel' : null;
}

function addPegaTudo(args, cwd, raiz) {
  let fimDasOpcoes = false;
  const pathspecs = [];
  for (const a of args) {
    if (!fimDasOpcoes && a === '--') { fimDasOpcoes = true; continue; }
    if (!fimDasOpcoes && a.startsWith('--')) {
      if (ehLongoAll(a) || '--update'.startsWith(a) && a.length >= 4) return 'tudo';
      continue;
    }
    if (!fimDasOpcoes && a.startsWith('-') && a.length > 1) {
      if (/[Au]/.test(a.slice(1))) return 'tudo';
      continue;
    }
    pathspecs.push(a);
  }
  return classificarPathspecs(pathspecs, cwd, raiz);
}

// Letras de `git commit` cujo valor vem junto ou no argumento seguinte.
const COMMIT_COM_VALOR = new Set(['m', 'F', 'C', 'c', 't']);
const COMMIT_LONGAS_COM_VALOR = new Set(['--message', '--file', '--reuse-message', '--reedit-message', '--template', '--author', '--date', '--cleanup', '--fixup', '--squash', '--trailer', '--pathspec-from-file']);

function commitPegaTudo(args, cwd, raiz) {
  const pathspecs = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') { pathspecs.push(...args.slice(k + 1)); break; }
    if (a.startsWith('--')) {
      if (ehLongoAll(a)) return 'tudo';
      if (COMMIT_LONGAS_COM_VALOR.has(a)) k++;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let i = 1; i < a.length; i++) {
        const c = a[i];
        if (c === 'a') return 'tudo';
        if (COMMIT_COM_VALOR.has(c)) { if (i === a.length - 1) k++; break; }
        if (c === 'u' || c === 'S') break; // valor opcional, sempre junto
      }
      continue;
    }
    pathspecs.push(a);
  }
  return classificarPathspecs(pathspecs, cwd, raiz);
}

function travaT2(cmd, ctx) {
  if (nomeDe(cmd.argv[0]) !== 'git') return null;
  const g = subcomandoGit(cmd.argv, cmd.env);
  if (!g || (g.sub !== 'add' && g.sub !== 'stage' && g.sub !== 'commit')) return null;
  const cwd = g.incerto ? null : cmd.cwd;
  const pega = (g.sub === 'commit' ? commitPegaTudo : addPegaTudo)(g.args, cwd, ctx.raiz);
  if (!pega) return null;
  if (cwd != null && ctx.topoDe(cwd) !== ctx.raiz) return null;
  const onde = cwd == null ? 'em uma pasta que não consegui determinar' : 'no checkout principal';
  const sub = g.sub === 'commit' ? 'git commit' : 'git add';
  if (pega === 'ilegivel') {
    return recusa('T2', `não consegui ler os caminhos do ${sub} ${onde} (variável ou substituição de comando); ele pode levar junto o trabalho de outras frentes`,
      `escreva os caminhos por extenso (${sub} -- <caminhos>), ou trabalhe no worktree da frente`);
  }
  const forma = g.sub !== 'commit' ? 'git add com tudo (-A, ., -u, *, a raiz)' : 'git commit -a (ou com a raiz como caminho)';
  return recusa('T2', `${forma} ${onde} leva junto o trabalho de outras frentes`,
    'git add <caminhos> com só os arquivos que você mudou (e git commit sem -a), ou trabalhe no worktree da frente');
}

// ---------------------------------------------------------------- T5

const PUSH_COM_VALOR = new Set(['-o', '--push-option', '--receive-pack', '--exec', '--repo']);
const PUSH_LONGAS = ['--all', '--branches', '--mirror', '--delete', '--tags', '--follow-tags', '--force', '--force-with-lease', '--force-if-includes',
  '--dry-run', '--porcelain', '--prune', '--repo', '--receive-pack', '--exec', '--push-option', '--recurse-submodules', '--set-upstream',
  '--signed', '--atomic', '--thin', '--no-thin', '--verbose', '--quiet', '--progress', '--verify', '--no-verify', '--ipv4', '--ipv6', '--no-recurse-submodules'];
const SUBMODULOS = new Set(['on-demand', 'check', 'only', 'no']);

// O git aceita abreviação inequívoca de opção longa (`--mirr`). Devolve o nome inteiro.
function opcaoLonga(a) {
  const i = a.indexOf('=');
  const nome = i < 0 ? a : a.slice(0, i);
  const resto = i < 0 ? '' : a.slice(i);
  if (PUSH_LONGAS.includes(nome)) return nome + resto;
  const achadas = PUSH_LONGAS.filter(o => o.startsWith(nome));
  return (achadas.length === 1 ? achadas[0] : nome) + resto;
}

// Destino de um refspec (`+src:dst`, `dst`, `HEAD`); null quando é o ramo atual.
function destinoDoRefspec(r) {
  let s = r.startsWith('+') ? r.slice(1) : r;
  const i = s.lastIndexOf(':');
  if (i >= 0) s = s.slice(i + 1);
  if (s === '' || /[*$`]/.test(s)) return { curinga: true };
  if (i < 0 && (s === 'HEAD' || s === '@')) return { atual: true };
  return { nome: s.replace(/^refs\//, '').replace(/^heads\//, '') };
}

function travaT5Push(cmd, args, ctx, incerto) {
  const protegidos = ctx.config.git.protegidos;
  const saida = (nome) => `abra um PR para ${nome} e peça a ordem do executivo; para publicar o seu trabalho, empurre o ramo da frente (git push origin <ramo>)`;
  const posicionais = [];
  let temRepo = false;
  for (let k = 0; k < args.length; k++) {
    let a = args[k];
    if (a.startsWith('--') && a.length > 2) a = opcaoLonga(a);
    if (a === '--all' || a === '--mirror' || a === '--branches') {
      return recusa('T5', `git push ${a} empurra todos os ramos, inclusive os protegidos`, saida('o ramo protegido'));
    }
    if (a === '--') { posicionais.push(...args.slice(k + 1)); break; }
    if (a.startsWith('-')) {
      if (a === '--repo' || a.startsWith('--repo=')) temRepo = true;
      if (PUSH_COM_VALOR.has(a)) k++;
      else if (a === '--recurse-submodules' && SUBMODULOS.has(args[k + 1])) k++;
      continue;
    }
    posicionais.push(a);
  }
  const refspecs = temRepo ? posicionais : posicionais.slice(1);
  let atual;
  const ramoAtual = () => (atual === undefined ? (atual = cmd.cwd == null || incerto ? null : ctx.ramoAtual(cmd.cwd)) : atual);
  const atualProtegidoOuNulo = () => { const r = ramoAtual(); return r == null || protegidos.includes(r); };
  for (const r of refspecs) {
    const d = destinoDoRefspec(r);
    if (d.curinga) {
      return recusa('T5', `o destino "${r}" pode atingir um ramo protegido`, saida(protegidos.join(' ou ')));
    }
    if (d.atual) {
      if (atualProtegidoOuNulo()) return recusaAtual(ramoAtual(), saida, protegidos);
    } else if (protegidos.includes(d.nome)) {
      return recusa('T5', `push para o ramo protegido ${d.nome}`, saida(d.nome));
    }
  }
  if (refspecs.length === 0 && atualProtegidoOuNulo()) return recusaAtual(ramoAtual(), saida, protegidos);
  return null;
}

function recusaAtual(ramo, saida, protegidos) {
  if (ramo == null) return recusa('T5', 'push sem destino explícito e não sei qual é o ramo atual', saida(protegidos.join(' ou ')));
  return recusa('T5', `push sem destino explícito com o ramo protegido ${ramo} em uso`, saida(ramo));
}

const GH_COM_VALOR = new Set(['-R', '--repo']);
const GH_MERGE_COM_VALOR = new Set(['-b', '--body', '-F', '--body-file', '-t', '--subject', '--match-head-commit', '-A', '--author-email']);

function travaT5Merge(args, ctx, cmd) {
  const protegidos = ctx.config.git.protegidos;
  const pos = [];
  let outroRepo = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (GH_COM_VALOR.has(a)) { outroRepo = true; k++; continue; }
    if (a.startsWith('--repo=') || a.startsWith('-R')) { outroRepo = true; continue; }
    if (GH_MERGE_COM_VALOR.has(a)) { k++; continue; }
    if (a.startsWith('-')) continue;
    pos.push(a);
  }
  const saida = 'abra ou atualize o PR e peça a ordem do executivo para o merge em ramo protegido';
  const alvo = pos[0];
  let numero = null;
  let legivel = true;
  if (alvo != null) {
    const m = /^#?(\d+)$/.exec(alvo) ?? /\/pull\/(\d+)(?:[/?#].*)?$/.exec(alvo);
    if (m) numero = Number(m[1]); else legivel = false;
  }
  if (outroRepo || !legivel) {
    return recusa('T5', 'não consigo saber para qual ramo o PR será mesclado', saida);
  }
  const base = ctx.baseDoPr(numero, cmd.cwd);
  if (base == null) return recusa('T5', 'não consegui descobrir o ramo de destino do PR', saida);
  if (protegidos.includes(base)) return recusa('T5', `gh pr merge mescla em ${base}, que é protegido`, saida);
  return null;
}

function travaT5(cmd, ctx) {
  const nome = nomeDe(cmd.argv[0]);
  if (nome === 'git') {
    const g = subcomandoGit(cmd.argv, cmd.env);
    return g?.sub === 'push' ? travaT5Push(cmd, g.args, ctx, g.incerto) : null;
  }
  if (nome === 'gh') {
    let k = 1;
    while (k < cmd.argv.length && cmd.argv[k].startsWith('-')) k += GH_COM_VALOR.has(cmd.argv[k]) ? 2 : 1;
    const resto = cmd.argv.slice(k);
    if (resto[0] === 'pr' && resto[1] === 'merge') {
      // -R antes do subcomando também vale
      const antes = cmd.argv.slice(1, k);
      return travaT5Merge([...antes, ...resto.slice(2)], ctx, cmd);
    }
  }
  return null;
}

// ---------------------------------------------------------------- T0

function recusaT0(motivo) {
  return recusa('T0', motivo, 'escreva o comando por extenso, sem variável, crase nem aspas abertas (git push origin <ramo>)');
}

// Nome do comando que não dá para ler, ou `eval`/`source`/`.` com variável no argumento.
function nomeIlegivel(argv) {
  if (/[$`]/.test(argv[0] ?? '')) return true;
  return ['eval', 'source', '.'].includes(nomeDe(argv[0])) && argv.slice(1).some(a => /[$`]/.test(a));
}

// ---------------------------------------------------------------- troca de ramo na mesma linha

// `git checkout`/`git switch` antes de um push na mesma linha muda o ramo atual em que o push
// roda. Devolve os ramos que podem ficar em uso (null = não sei), ou null se o comando não troca
// de ramo. O ramo de antes sempre fica entre os possíveis: a troca pode falhar (`;`), e uma
// palavra solta no checkout pode ser um arquivo.
const TROCA_COM_VALOR = new Set(['-b', '-B', '-c', '-C', '--create', '--force-create', '--orphan', '--conflict', '--pathspec-from-file']);
const TROCA_CRIA = new Set(['-b', '-B', '-c', '-C', '--create', '--force-create', '--orphan']);

function destinoDaTroca(sub, args) {
  const posicionais = [];
  let novo;
  let comTrack = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') { if (novo === undefined && sub === 'checkout') return null; break; }
    if (a === '--detach' || (sub === 'switch' && a === '-d')) return [null];
    if (a === '-p' || a === '--patch' || a.startsWith('--pathspec-from-file')) return null;
    if (a === '-t' || a === '--track' || a.startsWith('--track=')) { comTrack = true; continue; }
    const igual = a.startsWith('--') ? a.indexOf('=') : -1;
    const opcao = igual > 0 ? a.slice(0, igual) : a;
    if (TROCA_CRIA.has(opcao)) { novo = igual > 0 ? a.slice(igual + 1) : args[++k]; continue; }
    if (/^-[bBcC].+/.test(a)) { novo = a.slice(2); continue; }
    if (TROCA_COM_VALOR.has(opcao)) { if (igual < 0) k++; continue; }
    if (a.startsWith('-') && a !== '-') continue;
    posicionais.push(a);
  }
  const ler = r => (r == null || naoLiteral(r) || r === '-' || r.startsWith('@{') ? null : r);
  if (novo !== undefined) return [ler(novo)];
  if (sub === 'checkout' && posicionais.length !== 1) return null; // nada, ou <árvore> <caminhos>
  if (posicionais.length === 0) return [null];
  const alvo = ler(posicionais[0]);
  // --track origin/main cria `main`; sem saber o remoto, os dois nomes contam.
  return comTrack && alvo?.includes('/') ? [alvo, alvo.slice(alvo.indexOf('/') + 1)] : [alvo];
}

const ANTES = Symbol('ramo de antes');

// Acompanha as trocas de ramo feitas pelos comandos já lidos; `ramoAtual(cwd)` responde com elas.
function novasTrocas(ctx) {
  const porTopo = new Map();
  let tudoIncerto = false;
  return {
    registrar(cmd) {
      if (nomeDe(cmd.argv[0]) !== 'git') return;
      const g = subcomandoGit(cmd.argv, cmd.env);
      if (!g || (g.sub !== 'checkout' && g.sub !== 'switch')) return;
      const destinos = destinoDaTroca(g.sub, g.args);
      if (!destinos) return;
      const topo = cmd.cwd == null || g.incerto ? null : ctx.topoDe(cmd.cwd);
      if (topo == null) { tudoIncerto = true; return; }
      porTopo.set(topo, [...(porTopo.get(topo) ?? [ANTES]), ...destinos]);
    },
    get vazio() { return !tudoIncerto && porTopo.size === 0; },
    ramoAtual(cwd) {
      if (tudoIncerto) return null;
      const lista = porTopo.get(ctx.topoDe(cwd));
      if (!lista) return ctx.ramoAtual(cwd);
      const ramos = lista.map(r => (r === ANTES ? ctx.ramoAtual(cwd) : r));
      if (ramos.includes(null)) return null;
      return ramos.find(r => ctx.config.git.protegidos.includes(r)) ?? ramos[0];
    },
  };
}

// ---------------------------------------------------------------- entrada

const TRAVAS = [travaT2, travaT5];

export function avaliar(acao, ctx) {
  if (acao?.tipo === 'edicao') return { permite: true };
  if (acao?.tipo !== 'comando') throw new TypeError(`avaliar: tipo de ação desconhecido: ${acao?.tipo}`);
  let comandos;
  try {
    comandos = comandosSimples(acao.comando, acao.cwd ?? null);
  } catch (e) {
    if (!(e instanceof ErroDeShell)) throw e;
    return PALAVRA_GIT.test(acao.comando) ? recusaT0(`não consegui ler o comando (${e.message}) e ele menciona git ou gh`) : { permite: true };
  }
  let liberada;
  const trocas = novasTrocas(ctx);
  for (const cmd of comandos) {
    if (cmd.argv.length === 0) continue;
    let r = null;
    if (nomeIlegivel(cmd.argv)) {
      if (PALAVRA_GIT.test(acao.comando)) r = recusaT0('o nome do comando vem de uma variável e o texto menciona git ou gh');
    } else {
      const ctxDoComando = trocas.vazio ? ctx : { ...ctx, ramoAtual: c => trocas.ramoAtual(c) };
      // Um cd que pode ter falhado antes de `;` deixa outros cwds possíveis: vale a recusa de qualquer um.
      for (const cwd of [cmd.cwd, ...(cmd.cwdsAlternativos ?? [])]) {
        const umCmd = cwd === cmd.cwd ? cmd : { ...cmd, cwd };
        for (const trava of TRAVAS) { r = trava(umCmd, ctxDoComando); if (r) break; }
        if (r) break;
      }
    }
    trocas.registrar(cmd);
    if (!r) continue;
    if (r.trava !== 'T0' && cmd.env?.AH_GUARD === 'off') { liberada ??= r.trava; continue; }
    return r;
  }
  return liberada ? { permite: true, liberada } : { permite: true };
}
