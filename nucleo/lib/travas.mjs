// Travas que leem o texto de um comando (já interpretado por shell.mjs) e decidem
// recusar ou permitir. São puras: nada de git nem de disco; tudo vem pelo `ctx`.
//
//   T0  texto que não dá para ler com segurança e que menciona git ou gh
//   T2  git add/commit que pega tudo, no checkout principal
//   T5  push e merge de PR em ramo protegido
//
// Limites conhecidos (a trava enxerga a mais, não a tudo): apelidos do git
// (`-c alias.x=push`), `gh api` direto, `push.default` e `remote.*.push` da
// configuração, e `git add` com glob do shell que cobre tudo.
import { comandosSimples, ErroDeShell } from './shell.mjs';
import { recusa } from './recusa.mjs';

const PALAVRA_GIT = /(?<![A-Za-z0-9_])(git|gh)(?![A-Za-z0-9_])/i;

const nomeDe = argv0 => (argv0 ?? '').split(/[\\/]/).pop().replace(/\.exe$/i, '');

// Opções globais do git que levam um valor separado.
const GIT_GLOBAL_COM_VALOR = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--exec-path']);

// Separa `git [opções] sub args...`. Devolve {sub, args} ou null se não há subcomando.
function subcomandoGit(argv) {
  let k = 1;
  while (k < argv.length && argv[k].startsWith('-')) k += GIT_GLOBAL_COM_VALOR.has(argv[k]) ? 2 : 1;
  if (k >= argv.length) return null;
  return { sub: argv[k], args: argv.slice(k + 1) };
}

// `--al` e `--all` valem; o git aceita abreviação única.
const ehLongoAll = a => a.length >= 4 && '--all'.startsWith(a);

// ---------------------------------------------------------------- T2

const ADD_TUDO = new Set(['.', './', ':/', ':(top)']);

function addPegaTudo(args) {
  let fimDasOpcoes = false;
  for (const a of args) {
    if (!fimDasOpcoes && a === '--') { fimDasOpcoes = true; continue; }
    if (!fimDasOpcoes && a.startsWith('--')) {
      if (ehLongoAll(a) || '--update'.startsWith(a) && a.length >= 4) return true;
      continue;
    }
    if (!fimDasOpcoes && a.startsWith('-') && a.length > 1) {
      if (/[Au]/.test(a.slice(1))) return true;
      continue;
    }
    if (ADD_TUDO.has(a) || a.startsWith(':(top')) return true;
  }
  return false;
}

// Letras de `git commit` cujo valor vem junto ou no argumento seguinte.
const COMMIT_COM_VALOR = new Set(['m', 'F', 'C', 'c', 't']);
const COMMIT_LONGAS_COM_VALOR = new Set(['--message', '--file', '--reuse-message', '--reedit-message', '--template', '--author', '--date', '--cleanup', '--fixup', '--squash', '--trailer', '--pathspec-from-file']);

function commitPegaTudo(args) {
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') return false;
    if (a.startsWith('--')) {
      if (ehLongoAll(a)) return true;
      if (COMMIT_LONGAS_COM_VALOR.has(a)) k++;
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let i = 1; i < a.length; i++) {
        const c = a[i];
        if (c === 'a') return true;
        if (COMMIT_COM_VALOR.has(c)) { if (i === a.length - 1) k++; break; }
        if (c === 'u' || c === 'S') break; // valor opcional, sempre junto
      }
    }
  }
  return false;
}

function travaT2(cmd, ctx) {
  if (nomeDe(cmd.argv[0]) !== 'git') return null;
  const g = subcomandoGit(cmd.argv);
  if (!g || (g.sub !== 'add' && g.sub !== 'commit')) return null;
  const pega = g.sub === 'add' ? addPegaTudo(g.args) : commitPegaTudo(g.args);
  if (!pega) return null;
  if (cmd.cwd != null && ctx.topoDe(cmd.cwd) !== ctx.raiz) return null;
  const onde = cmd.cwd == null ? 'em uma pasta que não consegui determinar' : 'no checkout principal';
  const forma = g.sub === 'add' ? 'git add com tudo (-A, ., -u)' : 'git commit -a';
  return recusa('T2', `${forma} ${onde} leva junto o trabalho de outras frentes`,
    'git add <caminhos> com só os arquivos que você mudou (e git commit sem -a), ou trabalhe no worktree da frente');
}

// ---------------------------------------------------------------- T5

const PUSH_COM_VALOR = new Set(['-o', '--push-option', '--receive-pack', '--exec', '--repo']);

// Destino de um refspec (`+src:dst`, `dst`, `HEAD`); null quando é o ramo atual.
function destinoDoRefspec(r) {
  let s = r.startsWith('+') ? r.slice(1) : r;
  const i = s.lastIndexOf(':');
  if (i >= 0) s = s.slice(i + 1);
  if (s === '' ) return { curinga: true };
  if (s.includes('*')) return { curinga: true };
  if (i < 0 && (s === 'HEAD' || s === '@')) return { atual: true };
  return { nome: s.replace(/^refs\/heads\//, '') };
}

function travaT5Push(cmd, args, ctx) {
  const protegidos = ctx.config.git.protegidos;
  const saida = (nome) => `abra um PR para ${nome} e peça a ordem do executivo; para publicar o seu trabalho, empurre o ramo da frente (git push origin <ramo>)`;
  const posicionais = [];
  let temRepo = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--all' || a === '--mirror') {
      return recusa('T5', `git push ${a} empurra todos os ramos, inclusive os protegidos`, saida('o ramo protegido'));
    }
    if (a === '--') { posicionais.push(...args.slice(k + 1)); break; }
    if (a.startsWith('-')) {
      if (a === '--repo') temRepo = true;
      if (PUSH_COM_VALOR.has(a)) k++;
      continue;
    }
    posicionais.push(a);
  }
  const refspecs = temRepo ? posicionais : posicionais.slice(1);
  let atual;
  const ramoAtual = () => (atual === undefined ? (atual = cmd.cwd == null ? null : ctx.ramoAtual(cmd.cwd)) : atual);
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

function travaT5Merge(args, ctx, cmd) {
  const protegidos = ctx.config.git.protegidos;
  const pos = [];
  let outroRepo = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (GH_COM_VALOR.has(a)) { outroRepo = true; k++; continue; }
    if (a.startsWith('--repo=') || a.startsWith('-R')) { outroRepo = true; continue; }
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
    const g = subcomandoGit(cmd.argv);
    return g?.sub === 'push' ? travaT5Push(cmd, g.args, ctx) : null;
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
  for (const cmd of comandos) {
    if (cmd.argv.length === 0) continue;
    let r = null;
    if (nomeIlegivel(cmd.argv)) {
      if (PALAVRA_GIT.test(acao.comando)) r = recusaT0('o nome do comando vem de uma variável e o texto menciona git ou gh');
    } else {
      for (const trava of TRAVAS) { r = trava(cmd, ctx); if (r) break; }
    }
    if (!r) continue;
    if (cmd.env?.AH_GUARD === 'off') { liberada ??= r.trava; continue; }
    return r;
  }
  return liberada ? { permite: true, liberada } : { permite: true };
}
