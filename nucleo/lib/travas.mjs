// Travas que leem o texto de um comando (já interpretado por shell.mjs) e decidem
// recusar ou permitir. São puras: nada de git nem de disco; tudo vem pelo `ctx`.
//
//   T0  texto que não dá para ler com segurança e que menciona git ou gh
//   T1  troca de ramo no checkout principal
//   T2  git add/commit que pega tudo, no checkout principal
//   T3  reset, clean, checkout/restore em massa, stash e rebase no checkout principal
//   T4  escrita no worktree (ou no ramo) da frente de outra sessão viva: git, comandos que
//       escrevem arquivo, redirecionamentos e edição de arquivo
//   T5  push e merge de PR em ramo protegido
//   T6  comando de uma classe de trabalho pesado (pesado.classes) fora do `ah pesado`
//   <extensão>/<id>  travas das extensões ligadas (`ctx.extensoes`), avaliadas depois destas
//
// Limites conhecidos (a trava enxerga a mais, não a tudo): apelidos do git
// (`-c alias.x=push`), `gh api` direto, `push.default` e `remote.*.push` da
// configuração, `git add` com glob do shell que cobre tudo sem ser `*` solto
// (`*.*`, `[a-z]*`) e caminhos que chegam por `xargs` ou `--pathspec-from-file`. Na T4: caminho
// relativo com cwd desconhecido, caminho com variável, crase ou `~`, e programas que escrevem
// arquivo fora da lista (um script, `npm`, `python -c`) não são avaliados.
import path from 'node:path';
import { comandosSimples, ErroDeShell } from './shell.mjs';
import { recusa } from './recusa.mjs';
import { dentroDe } from './caminhos.mjs';
import { idCurto } from './sessao.mjs';
import { classeQueCasa, textoDoArgv } from './fila.mjs';

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

// ---------------------------------------------------------------- T1 e T3

// O cwd em que T1 e T3 avaliam: null quando não sei (cwd desconhecido ou repositório apontado
// por opção ou variável; recusa como a T2), undefined quando não é o checkout principal.
function cwdDoPrincipal(cwd, incerto, ctx) {
  if (incerto || cwd == null) return null;
  return ctx.topoDe(cwd) === ctx.raiz ? cwd : undefined;
}
const ondeDe = cwd => (cwd == null ? 'em uma pasta que não consegui determinar' : 'no checkout principal');

// `a` (sem o `=valor`) é a opção longa `nome` ou uma abreviação dela com pelo menos `minimo`
// caracteres; o git aceita abreviação inequívoca, e cada `minimo` é o que a torna inequívoca.
function ehLonga(a, nome, minimo = nome.length) {
  if (!a.startsWith('--')) return false;
  const n = a.includes('=') ? a.slice(0, a.indexOf('=')) : a;
  return n.length >= minimo && nome.startsWith(n);
}

// Opções e posicionais de um subcomando. `curtas` são as letras que levam valor (junto ou no
// argumento seguinte); `longas`, as longas que levam o valor no argumento seguinte. Devolve
// {opcoes: [nome], posicionais (antes do --), depois (depois do --), comTraco}.
function lerArgs(args, curtas = new Set(), longas = new Set()) {
  const opcoes = [];
  const posicionais = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') return { opcoes, posicionais, depois: args.slice(k + 1), comTraco: true };
    if (a.startsWith('--')) {
      opcoes.push(a);
      if (!a.includes('=') && longas.has(a)) k++;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let i = 1; i < a.length; i++) {
        opcoes.push(`-${a[i]}`);
        if (curtas.has(a[i])) { if (i === a.length - 1) k++; break; }
      }
      continue;
    }
    posicionais.push(a);
  }
  return { opcoes, posicionais, depois: [], comTraco: false };
}

const SWITCH_CURTAS = new Set(['c', 'C']);
const SWITCH_LONGAS = new Set(['--create', '--force-create', '--orphan']);
const CHECKOUT_CURTAS = new Set(['b', 'B']);
const CHECKOUT_LONGAS = new Set(['--orphan', '--pathspec-from-file']);
const RESTORE_CURTAS = new Set(['s']);
const RESTORE_LONGAS = new Set(['--source', '--pathspec-from-file']);

// `git switch` troca de ramo: cria, desliga do ramo, volta ao anterior ou vai para outro que não a base.
function switchTrocaRamo(args, base) {
  const { opcoes, posicionais } = lerArgs(args, SWITCH_CURTAS, SWITCH_LONGAS);
  if (opcoes.some(o => ['-c', '-C', '-d'].includes(o) || ehLonga(o, '--create', 4) || ehLonga(o, '--force-create', 8)
    || ehLonga(o, '--orphan', 4) || ehLonga(o, '--detach', 4))) return true;
  return posicionais.length > 0 && (posicionais[0] === '-' || posicionais[0] !== base);
}

// `git checkout` troca de ramo: -b, -B, --orphan, --detach, `-`, ou um único posicional (sem `--`)
// que não é a base e é uma referência, mesmo que também exista como caminho (o git prefere o ramo).
// Sem `ehRef` no ctx, o posicional solto não recusa.
function checkoutTrocaRamo(args, cwd, ctx) {
  const { opcoes, posicionais, comTraco } = lerArgs(args, CHECKOUT_CURTAS, CHECKOUT_LONGAS);
  if (opcoes.some(o => o === '-b' || o === '-B' || ehLonga(o, '--orphan', 4) || ehLonga(o, '--detach', 4))) return true;
  if (comTraco || posicionais.length !== 1) return false;
  const [alvo] = posicionais;
  if (alvo === '-') return true;
  if (alvo === ctx.config.git.base || naoLiteral(alvo)) return false;
  if (typeof ctx.ehRef !== 'function') return false;
  return ctx.ehRef(cwd ?? ctx.raiz, alvo) === true;
}

function travaT1(cmd, ctx) {
  const nome = nomeDe(cmd.argv[0]);
  let incerto = false;
  let troca = null; // função que decide, já com o cwd
  if (nome === 'gh') {
    let k = 1;
    while (k < cmd.argv.length && cmd.argv[k].startsWith('-')) k += GH_COM_VALOR.has(cmd.argv[k]) ? 2 : 1;
    if (cmd.argv[k] === 'pr' && cmd.argv[k + 1] === 'checkout') troca = () => true;
  } else if (nome === 'git') {
    const g = subcomandoGit(cmd.argv, cmd.env);
    if (!g) return null;
    incerto = g.incerto;
    if (g.sub === 'switch') troca = () => switchTrocaRamo(g.args, ctx.config.git.base);
    else if (g.sub === 'checkout') troca = cwd => checkoutTrocaRamo(g.args, cwd, ctx);
  }
  if (!troca) return null;
  const cwd = cwdDoPrincipal(cmd.cwd, incerto, ctx);
  if (cwd === undefined || !troca(cwd)) return null;
  const motivo = cwd == null
    ? 'trocar de ramo em uma pasta que não consegui determinar (pode ser o checkout principal) muda o chão das outras sessões'
    : 'trocar o ramo do checkout principal muda o chão das outras sessões';
  return recusa('T1', motivo, `trabalhe no worktree de uma frente (tools/ah open <nome>); o checkout principal fica em ${ctx.config.git.base}`);
}

// Forma de `git checkout`/`git restore` com pathspec que pega tudo (a regra da T2), ou null.
function pathspecDescarta(sub, pathspecs, cwd, raiz) {
  const c = classificarPathspecs(pathspecs, cwd, raiz);
  if (c === 'tudo') return `git ${sub} com caminho que pega tudo (., :/, a raiz)`;
  if (c === 'ilegivel') return `git ${sub} com caminho que não consegui ler (variável ou substituição)`;
  return null;
}

// A forma de descartar ou esconder trabalho que o subcomando usa, ou null.
function formaQueDescarta(sub, args, cwd, raiz) {
  if (sub === 'reset') {
    const { opcoes } = lerArgs(args);
    if (opcoes.some(o => ehLonga(o, '--hard', 4))) return 'git reset --hard';
    if (opcoes.some(o => ehLonga(o, '--keep', 4))) return 'git reset --keep';
    if (opcoes.some(o => ehLonga(o, '--merge', 4))) return 'git reset --merge';
    return null;
  }
  if (sub === 'clean') {
    const { opcoes } = lerArgs(args, new Set(['e']), new Set(['--exclude']));
    const forca = opcoes.some(o => o === '-f' || ehLonga(o, '--force', 4));
    const ensaio = opcoes.some(o => o === '-n' || ehLonga(o, '--dry-run', 3));
    return forca && !ensaio ? 'git clean -f' : null;
  }
  if (sub === 'checkout') {
    const { opcoes, posicionais, depois } = lerArgs(args, CHECKOUT_CURTAS, CHECKOUT_LONGAS);
    if (opcoes.some(o => o === '-f' || ehLonga(o, '--force', 4))) return 'git checkout -f';
    return pathspecDescarta('checkout', [...posicionais, ...depois], cwd, raiz);
  }
  if (sub === 'restore') {
    const { posicionais, depois } = lerArgs(args, RESTORE_CURTAS, RESTORE_LONGAS);
    return pathspecDescarta('restore', [...posicionais, ...depois], cwd, raiz);
  }
  if (sub === 'switch') {
    const { opcoes } = lerArgs(args, SWITCH_CURTAS, SWITCH_LONGAS);
    if (opcoes.some(o => o === '-f' || o === '--force')) return 'git switch -f';
    if (opcoes.some(o => ehLonga(o, '--discard-changes', 4))) return 'git switch --discard-changes';
    return null;
  }
  if (sub === 'stash') {
    const acao = args[0] == null || args[0].startsWith('-') ? null : args[0];
    if (acao === 'list' || acao === 'show') return null;
    return acao ? `git stash ${acao}` : 'git stash';
  }
  if (sub === 'rebase') {
    if (args.some(a => ehLonga(a, '--abort', 4) || a === '--quit')) return null;
    return 'git rebase';
  }
  return null;
}

function travaT3(cmd, ctx) {
  if (nomeDe(cmd.argv[0]) !== 'git') return null;
  const g = subcomandoGit(cmd.argv, cmd.env);
  if (!g) return null;
  const cwd = cwdDoPrincipal(cmd.cwd, g.incerto, ctx);
  if (cwd === undefined) return null;
  const forma = formaQueDescarta(g.sub, g.args, cwd, ctx.raiz);
  if (!forma) return null;
  return recusa('T3', `${forma} ${ondeDe(cwd)} descarta ou esconde trabalho que pode ser de outra sessão`,
    'faça isso no worktree da sua frente; no checkout principal, guarde por caminho (git add <caminhos> e git commit) ou combine com a dona das mudanças');
}

// ---------------------------------------------------------------- T4

// `ctx.frentes`: as ativas de outras sessões ({id, nome, ramo, worktree normalizado, dona});
// `ctx.viva(id)`; `ctx.normalizar(p)` (caminho real, o mesmo do worktree).

function recusaT4(caminho, f) {
  const curto = idCurto(f.dona);
  return recusa('T4', `${caminho} está no worktree da frente ${f.id} ${f.nome}, da sessão ${curto}, que está viva`,
    `escreva só no worktree da sua frente; para mexer em ${f.nome}, peça à sessão ${curto} (ah handoff) ou, se ela morrer, ah takeover ${f.nome}`);
}

const temFrentes = ctx => Array.isArray(ctx.frentes) && ctx.frentes.length > 0 && typeof ctx.viva === 'function';

// A frente viva de outra sessão em cujo worktree `alvo` (relativo a `base`) cai, ou null. Com `arvore`
// (o comando age na árvore inteira: rm -r, mv, chmod -R), vale também `alvo` que contém o worktree.
// Caminho com variável, crase ou `~`, ou relativo com base desconhecida, não é avaliado.
function frenteDoCaminho(alvo, base, ctx, arvore = false) {
  if (typeof alvo !== 'string' || alvo === '' || /[$`]/.test(alvo) || alvo.startsWith('~')) return null;
  let bruto;
  if (path.isAbsolute(alvo)) bruto = alvo;
  else if (base == null) return null;
  else bruto = `${base}${path.sep}${alvo}`;
  const normalizar = typeof ctx.normalizar === 'function' ? ctx.normalizar : x => x;
  if (CURINGA.test(bruto)) {
    const f = frenteDoCuringa(path.resolve(bruto), normalizar, ctx, arvore);
    return f ? { frente: f, caminho: path.resolve(bruto) } : null;
  }
  const n = normalizar(bruto);
  const f = ctx.frentes.find(fr => fr.worktree && (dentroDe(n, fr.worktree) || (arvore && dentroDe(fr.worktree, n))) && ctx.viva(fr.dona));
  return f ? { frente: f, caminho: path.resolve(bruto) } : null;
}

// Curinga do shell (`*`, `?`, `[`) num caminho.
const CURINGA = /[*?[]/;

// Expressão de um componente com curinga; `**` casa qualquer sequência de componentes.
function regexDoComponente(c) {
  let r = '';
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === '*') r += '.*';
    else if (ch === '?') r += '.';
    else if (ch === '[') {
      const fim = c.indexOf(']', i + 2);
      if (fim < 0) { r += '\\['; continue; }
      let classe = c.slice(i + 1, fim);
      if (classe.startsWith('!')) classe = `^${classe.slice(1)}`;
      r += `[${classe.replace(/\\/g, '\\\\')}]`;
      i = fim;
    } else r += ch.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${r}$`, process.platform === 'win32' ? 'i' : '');
}

// A frente viva alheia cujo worktree o caminho com curinga pode atingir: compara pelo prefixo até o
// primeiro componente com curinga e casa o resto componente a componente contra o worktree. Recusa
// quando o que casa é o worktree ou algo dentro dele, e, com `arvore`, também uma pasta acima dele.
function frenteDoCuringa(bruto, normalizar, ctx, arvore) {
  const partes = bruto.split(/[\\/]+/);
  const k = partes.findIndex(p => CURINGA.test(p));
  const prefixo = normalizar(partes.slice(0, k).join(path.sep) + (k === 1 ? path.sep : ''));
  const padrao = partes.slice(k).filter(p => p !== '');
  return ctx.frentes.find(fr => {
    if (!fr.worktree || !ctx.viva(fr.dona)) return false;
    if (dentroDe(prefixo, fr.worktree)) return true;
    if (!dentroDe(fr.worktree, prefixo)) return false;
    const wt = path.relative(prefixo, fr.worktree).split(/[\\/]+/).filter(p => p !== '');
    for (let i = 0; i < padrao.length; i++) {
      if (padrao[i] === '**') return true;
      if (i >= wt.length) return true; // casa algo dentro do worktree
      if (!regexDoComponente(padrao[i]).test(wt[i])) return false;
    }
    return padrao.length === wt.length || arvore;
  });
}

function primeiraRecusa(alvos, base, ctx, arvore = false) {
  for (const a of alvos) {
    const achado = frenteDoCaminho(a, base, ctx, arvore);
    if (achado) return recusaT4(achado.caminho, achado.frente);
  }
  return null;
}

const GIT_ESCRITA = new Set(['add', 'stage', 'commit', 'reset', 'checkout', 'switch', 'restore', 'rebase', 'merge', 'pull', 'push', 'stash', 'clean',
  'cherry-pick', 'revert', 'am', 'apply', 'mv', 'rm', 'tag', 'notes']);
const BRANCH_CURTAS = new Set(['u', 't']);
const BRANCH_LONGAS = new Set(['--set-upstream-to', '--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort', '--format', '--color', '--track']);
const BRANCH_MEXE = o => ['-d', '-D', '-m', '-M', '-f'].includes(o) || ehLonga(o, '--delete', 5) || ehLonga(o, '--move', 4) || ehLonga(o, '--force', 4);
const nomeDoRamo = r => r.replace(/^refs\/heads\//, '');
const TAG_CURTAS = new Set(['m', 'F', 'u', 'n']);
const TAG_LONGAS = new Set(['--message', '--file', '--local-user', '--sort', '--format', '--contains', '--no-contains', '--points-at', '--merged', '--no-merged', '--cleanup', '--color']);

// Subcomandos da lista de escrita que, nesta forma, só leem.
function gitSoLe(sub, args) {
  if (sub === 'stash') return args[0] === 'list' || args[0] === 'show';
  if (sub === 'notes') return args.length === 0 || args[0] === 'show' || args[0] === 'list';
  if (sub === 'checkout') return args.length === 0;
  if (sub === 'tag') {
    const { opcoes, posicionais, depois } = lerArgs(args, TAG_CURTAS, TAG_LONGAS);
    if (opcoes.some(o => o === '-d' || ehLonga(o, '--delete', 3))) return false;
    return opcoes.some(o => o === '-l' || ehLonga(o, '--list', 3)) || posicionais.length + depois.length === 0;
  }
  return false;
}

function t4Git(cmd, ctx) {
  const g = subcomandoGit(cmd.argv, cmd.env);
  if (!g) return null;
  const cwd = g.incerto ? null : cmd.cwd;
  if (g.sub === 'branch') {
    const { opcoes, posicionais, depois } = lerArgs(g.args, BRANCH_CURTAS, BRANCH_LONGAS);
    if (!opcoes.some(BRANCH_MEXE)) return null;
    const nomes = [...posicionais, ...depois].map(nomeDoRamo);
    const f = ctx.frentes.find(fr => fr.ramo && nomes.includes(fr.ramo) && ctx.viva(fr.dona));
    if (!f) return null;
    const curto = idCurto(f.dona);
    return recusa('T4', `o ramo ${f.ramo} é da frente ${f.id} ${f.nome}, da sessão ${curto}, que está viva; apagar, renomear ou mover o ramo tira o trabalho dela do lugar`,
      `deixe o ramo ${f.ramo} como está; para mexer nele, peça à sessão ${curto} (ah handoff) ou, se ela morrer, ah takeover ${f.nome}`);
  }
  if (g.sub === 'worktree') {
    const [acao, ...resto] = g.args;
    if (acao !== 'remove' && acao !== 'move') return null;
    const { posicionais, depois } = lerArgs(resto);
    return primeiraRecusa([...posicionais, ...depois], cwd, ctx, true);
  }
  if (GIT_ESCRITA.has(g.sub) && cwd != null && !gitSoLe(g.sub, g.args)) return primeiraRecusa([cwd], null, ctx);
  return null;
}

// Posicionais (o que não é opção) de um comando comum; `comValor` são as opções cujo valor vem no seguinte.
function posicionaisDe(args, comValor = new Set()) {
  const pos = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') { pos.push(...args.slice(k + 1)); break; }
    if (a.startsWith('-') && a.length > 1) { if (comValor.has(a)) k++; continue; }
    pos.push(a);
  }
  return pos;
}

// Destino de `-t <pasta>` / `--target-directory=<pasta>` (cp, mv, install, ln).
function pastaAlvo(args) {
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') break;
    if (a === '-t' || a === '--target-directory') return args[k + 1] ?? null;
    if (a.startsWith('--target-directory=')) return a.slice('--target-directory='.length);
    if (/^-[^-]*t/.test(a) && !a.startsWith('--')) {
      const resto = a.slice(a.indexOf('t') + 1);
      return resto || (args[k + 1] ?? null);
    }
  }
  return null;
}

// Arquivos que `sed -i` / `perl -i` reescrevem: os posicionais depois do script (o primeiro
// posicional é o script, salvo se veio por -e/-f, ou -e/-E no perl). null sem -i.
function arquivosNoLugar(args, perl) {
  let noLugar = false;
  let script = false;
  const pos = [];
  const valorCurto = perl ? new Set(['e', 'E', 'I', 'M', 'm', 'x', 'C', 'd', 'D', 'l', '0']) : new Set(['e', 'f', 'l']);
  const comScript = perl ? new Set(['e', 'E']) : new Set(['e', 'f']);
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') { pos.push(...args.slice(k + 1)); break; }
    if (a.startsWith('--')) {
      if (ehLonga(a, '--in-place', 4)) noLugar = true;
      else if (!perl && (ehLonga(a, '--expression', 3) || ehLonga(a, '--file', 3))) { script = true; if (!a.includes('=')) k++; }
      else if (!perl && ehLonga(a, '--line-length', 3) && !a.includes('=')) k++;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let i = 1; i < a.length; i++) {
        const c = a[i];
        if (c === 'i') { noLugar = true; break; } // o resto é o sufixo do backup
        if (valorCurto.has(c)) {
          if (comScript.has(c)) script = true;
          // perl -l e -0 têm valor opcional e sempre junto
          if (i === a.length - 1 && !(perl && (c === 'l' || c === '0'))) k++;
          break;
        }
      }
      continue;
    }
    pos.push(a);
  }
  if (!noLugar) return null;
  return script ? pos : pos.slice(1);
}

const ESCREVE_TODO_POSICIONAL = new Set(['rm', 'rmdir', 'touch', 'mkdir', 'tee', 'truncate', 'chmod', 'chown', 'chgrp', 'mv']);
const ESCREVE_O_ULTIMO = new Set(['cp', 'install', 'ln']);

// O comando age na árvore inteira de cada caminho: rm -r, rmdir, mv, chmod/chown/chgrp -R.
function emArvore(nome, args) {
  if (nome === 'rmdir' || nome === 'mv') return true;
  const letra = nome === 'rm' ? /[rR]/ : /R/;
  if (nome !== 'rm' && nome !== 'chmod' && nome !== 'chown' && nome !== 'chgrp') return false;
  for (const a of args) {
    if (a === '--') break;
    if (a.startsWith('--')) { if (ehLonga(a, '--recursive', 3)) return true; continue; }
    if (a.startsWith('-') && letra.test(a.slice(1))) return true;
  }
  return false;
}

// Caminhos em que o comando escreve, pelos argumentos; [] quando não escreve ou não sei.
function caminhosEscritos(cmd) {
  const nome = nomeDe(cmd.argv[0]);
  const args = cmd.argv.slice(1);
  if (ESCREVE_TODO_POSICIONAL.has(nome) || ESCREVE_O_ULTIMO.has(nome)) {
    const comValor = nome === 'truncate' ? new Set(['-s', '-r']) : nome === 'mkdir' ? new Set(['-m']) : nome === 'install' ? new Set(['-m', '-o', '-g', '-S']) : new Set();
    const pasta = nome === 'cp' || nome === 'mv' || nome === 'install' || nome === 'ln' ? pastaAlvo(args) : null;
    if (pasta) comValor.add('-t');
    const pos = posicionaisDe(args, comValor);
    const lista = ESCREVE_O_ULTIMO.has(nome) ? (pasta ? [] : pos.slice(-1)) : pos;
    return pasta ? [...lista, pasta] : lista;
  }
  if (nome === 'sed' || nome === 'perl') return arquivosNoLugar(args, nome === 'perl') ?? [];
  if (nome === 'dd') return args.filter(a => a.startsWith('of=')).map(a => a.slice(3));
  return [];
}

function travaT4(cmd, ctx) {
  if (!temFrentes(ctx)) return null;
  if (nomeDe(cmd.argv[0]) === 'git') return t4Git(cmd, ctx);
  return primeiraRecusa(caminhosEscritos(cmd), cmd.cwd, ctx, emArvore(nomeDe(cmd.argv[0]), cmd.argv.slice(1)));
}

// Destinos de redirecionamento: valem para qualquer comando, mesmo o só de redirecionamento.
function travaT4Escritas(cmd, cwd, ctx) {
  if (!temFrentes(ctx) || !cmd.escritas?.length) return null;
  return primeiraRecusa(cmd.escritas, cwd, ctx);
}

function travaT4Edicao(acao, ctx) {
  if (!temFrentes(ctx)) return null;
  return primeiraRecusa([acao.arquivo], acao.cwd ?? ctx.raiz, ctx);
}

// ---------------------------------------------------------------- T6

// O comando casa com uma classe pesada e não roda pelo `ah pesado` (o `ah` é o programa, então ele e o que
// vem depois do `--` não casam). Chamada aninhada passa só conferida por quem monta o ctx (`ctx.aninhado`:
// a senha do ambiente do gancho está rodando na fila); o prefixo `AH_PESADO_ANINHADO=…` no texto não libera.
// Sem classes, nada.
function travaT6(cmd, ctx) {
  const classes = ctx.config?.pesado?.classes;
  if (!classes || ctx.aninhado) return null;
  const classe = classeQueCasa(cmd.argv, classes);
  if (!classe) return null;
  return recusa('T6', `${cmd.argv[0]} é trabalho pesado (classe ${classe}) e roda fora da fila; vários juntos esgotam a memória da máquina`,
    `tools/ah pesado -- ${textoDoArgv(cmd.argv)}`);
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

const TRAVAS = [travaT1, travaT2, travaT3, travaT4, travaT5, travaT6];

// ---------------------------------------------------------------- travas de extensão

const SAIDA_DA_TRAVA_QUEBRADA = 'corrija a extensão ou desligue-a em .harness/config.json';

// `AH_GUARD=off` libera a trava de extensão quando todo comando simples da linha (fora o `cd`) o traz: a trava
// julga a ação inteira e não diz qual comando a ofendeu.
function liberavel(comandos) {
  const contam = (comandos ?? []).filter(c => c.argv.length && nomeDe(c.argv[0]) !== 'cd');
  return contam.length > 0 && contam.every(c => c.env?.AH_GUARD === 'off');
}

// As travas das extensões (`ctx.extensoes`: [{id: '<extensão>/<id>', avaliar(acao)}]), depois das do núcleo.
// `avaliar` é síncrona e devolve null ou {motivo, saida}; a que lança (ou devolve promessa) recusa.
function travasDeExtensao(acao, comandos, ctx, liberadaAntes) {
  let liberada = liberadaAntes;
  const lista = Array.isArray(ctx.extensoes) ? ctx.extensoes : [];
  if (lista.length) {
    const vista = Object.freeze({
      ...acao,
      ...(comandos ? { comandos: comandos.map(c => Object.freeze({ argv: [...c.argv], cwd: c.cwd ?? null, env: { ...(c.env ?? {}) } })) } : {}),
    });
    for (const t of lista) {
      let r;
      try {
        r = t.avaliar(vista);
        if (r && typeof r.then === 'function') {
          r.then(null, () => {});
          throw new Error('avaliar devolveu uma promessa; a trava de extensão é síncrona');
        }
      } catch (e) {
        r = { motivo: `a trava falhou: ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}`, saida: SAIDA_DA_TRAVA_QUEBRADA };
      }
      if (!r) continue;
      const saida = typeof r.saida === 'string' && r.saida.trim() ? r.saida : `veja a extensão ${t.id.split('/')[0]}, ou desligue-a em .harness/config.json`;
      if (liberavel(comandos)) { liberada ??= t.id; continue; }
      return recusa(t.id, String(r.motivo ?? 'recusado pela extensão'), saida);
    }
  }
  return liberada ? { permite: true, liberada } : { permite: true };
}

export function avaliar(acao, ctx) {
  if (acao?.tipo === 'edicao') return travaT4Edicao(acao, ctx) ?? travasDeExtensao(acao, null, ctx);
  if (acao?.tipo !== 'comando') throw new TypeError(`avaliar: tipo de ação desconhecido: ${acao?.tipo}`);
  let comandos;
  try {
    comandos = comandosSimples(acao.comando, acao.cwd ?? null);
  } catch (e) {
    if (!(e instanceof ErroDeShell)) throw e;
    return PALAVRA_GIT.test(acao.comando) ? recusaT0(`não consegui ler o comando (${e.message}) e ele menciona git ou gh`) : travasDeExtensao(acao, null, ctx);
  }
  let liberada;
  const trocas = novasTrocas(ctx);
  for (const cmd of comandos) {
    let r = null;
    // Um cd que pode ter falhado antes de `;` deixa outros cwds possíveis: vale a recusa de qualquer um.
    const cwds = [cmd.cwd, ...(cmd.cwdsAlternativos ?? [])];
    if (cmd.argv.length === 0) {
      // Só redirecionamento (`> f`): só os destinos contam.
    } else if (nomeIlegivel(cmd.argv)) {
      if (PALAVRA_GIT.test(acao.comando)) r = recusaT0('o nome do comando vem de uma variável e o texto menciona git ou gh');
    } else {
      const ctxDoComando = trocas.vazio ? ctx : { ...ctx, ramoAtual: c => trocas.ramoAtual(c) };
      for (const cwd of cwds) {
        const umCmd = cwd === cmd.cwd ? cmd : { ...cmd, cwd };
        for (const trava of TRAVAS) { r = trava(umCmd, ctxDoComando); if (r) break; }
        if (r) break;
      }
    }
    for (const cwd of cwds) { if (r) break; r = travaT4Escritas(cmd, cwd, ctx); }
    if (cmd.argv.length) trocas.registrar(cmd);
    if (!r) continue;
    if (r.trava !== 'T0' && cmd.env?.AH_GUARD === 'off') { liberada ??= r.trava; continue; }
    return r;
  }
  return travasDeExtensao(acao, comandos, ctx, liberada);
}
