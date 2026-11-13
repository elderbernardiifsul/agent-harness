import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliar } from '../nucleo/lib/travas.mjs';
import { recusa, textoDaRecusa } from '../nucleo/lib/recusa.mjs';
import { aplicarPadroes } from '../nucleo/lib/config.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizarCaminho } from '../nucleo/lib/caminhos.mjs';

const ctx = {
  config: aplicarPadroes({}),
  raiz: '/r',
  topoDe: c => (c && c.startsWith('/w') ? '/w' : '/r'),
  ramoAtual: c => (c?.startsWith('/w') ? 'feat/x' : 'dev'),
  baseDoPr: n => ({ 7: 'dev', 8: 'main' })[n] ?? null,
  ehRef: (c, n) => ['main', 'stage', 'dev', 'feat/x', 'v1'].includes(n),
  existe: c => c.endsWith('arquivo.txt'),
};
const av = (comando, cwd = '/r') => avaliar({ tipo: 'comando', comando, cwd }, ctx);
const comRamo = ramo => ({ ...ctx, ramoAtual: () => ramo });

// ---- T2
for (const c of ['git add -A', 'git add .', 'git add --all', 'git commit -am "x"', 'git commit -a', `bash -c 'git add .'`, 'cd . && git add -u',
  'git add -- .', 'git add ./', 'git add :/', 'git add -Au', 'git add --update', 'git commit --all -m x', 'git -c x=y add -A', 'git commit -sam x', 'git commit -m x -a'])
  test(`T2 recusa: ${c}`, () => { const r = av(c); assert.equal(r.trava, 'T2'); assert.ok(r.saida); });
test('T2 não vale no worktree da frente', () => assert.ok(av('git add -A', '/w').permite));
test('T2 permite adicionar por caminho', () => assert.ok(av('git add src/a.js docs/').permite));
test('T2 não confunde mensagem com opção', () => {
  assert.ok(av('git commit -m "-a"').permite);
  assert.ok(av('git commit -m x --amend').permite);
  assert.ok(av('git commit -ma').permite); // -m com valor "a"
  assert.ok(av('git commit -F -a').permite);
});
test('T2 recusa com cwd desconhecido, e git -C para fora do checkout principal permite', () => {
  assert.equal(avaliar({ tipo: 'comando', comando: 'git add -A', cwd: null }, ctx).trava, 'T2');
  assert.equal(av('cd $X && git add -A').trava, 'T2');
  assert.ok(av('git -C /w add -A').permite);
});

// ---- T5
for (const c of ['git push origin main', 'git push origin dev:stage', 'git push origin HEAD:refs/heads/main', 'git push --all', 'git push --mirror origin',
  'git push origin +main', 'env X=1 git push origin main', 'sudo git push origin stage', 'command git push origin main', 'git -C /r push origin main', 'gh pr merge 8', 'gh pr merge',
  'git -C /outro push origin main', 'git push --force-with-lease origin +main', 'git push origin dev main', 'git -c x=y push origin main', 'git --no-pager push origin main',
  `bash -c 'git push origin main'`, 'echo ok && git push origin main && echo fim', 'git push -f origin :main', 'git push origin refs/heads/*:refs/heads/*',
  'git push --repo origin main', 'git push -o ci.skip origin main', 'git push origin HEAD:main', '/usr/bin/git push origin main', 'gh pr merge 8 --squash', 'gh pr merge -R exemplo/loja 7',
  'gh pr merge https://github.com/exemplo/loja/pull/8', 'gh pr merge feat/x'])
  test(`T5 recusa: ${c}`, () => { const r = av(c); assert.equal(r.trava, 'T5'); assert.ok(r.saida); });
test('T5 permite a base e o ramo da frente', () => {
  assert.ok(av('git push origin dev').permite); assert.ok(av('git push', '/r').permite);
  assert.ok(av('git push -u origin feat/x', '/w').permite); assert.ok(av('gh pr merge 7').permite);
  assert.ok(av('git push --force-with-lease=feat/x:abc origin feat/x', '/w').permite);
  assert.ok(av('git push -o main origin feat/x', '/w').permite);
  assert.ok(av('gh pr merge --squash 7').permite);
  assert.ok(av('git status && git log').permite);
});
test('push sem destino num checkout em ramo protegido é recusado', () => {
  assert.equal(avaliar({ tipo: 'comando', comando: 'git push', cwd: '/r' }, comRamo('main')).trava, 'T5');
  assert.equal(avaliar({ tipo: 'comando', comando: 'git push origin', cwd: '/r' }, comRamo('stage')).trava, 'T5');
  assert.equal(avaliar({ tipo: 'comando', comando: 'git push origin HEAD', cwd: '/r' }, comRamo('main')).trava, 'T5');
  assert.equal(avaliar({ tipo: 'comando', comando: 'git push', cwd: '/r' }, comRamo(null)).trava, 'T5');
  assert.ok(avaliar({ tipo: 'comando', comando: 'git push origin HEAD', cwd: '/w' }, ctx).permite);
});
test('cwd desconhecido: push sem destino é recusado, com destino seguro permite', () => {
  assert.equal(avaliar({ tipo: 'comando', comando: 'git push', cwd: null }, ctx).trava, 'T5');
  assert.ok(avaliar({ tipo: 'comando', comando: 'git push origin feat/x', cwd: null }, ctx).permite);
});

// ---- AH_GUARD
test('AH_GUARD=off libera só o comando que traz o prefixo', () => {
  assert.equal(av('AH_GUARD=off git push origin main').liberada, 'T5');
  assert.equal(av('AH_GUARD=off true && git push origin main').trava, 'T5');
  assert.equal(av('AH_GUARD=off git add -A').liberada, 'T2');
  assert.equal(av('AH_GUARD=off git add -A && git push origin main').trava, 'T5');
  assert.equal(av('AH_GUARD=on git push origin main').trava, 'T5');
});

// ---- T0
test('texto ilegível com git recusa; sem git permite', () => {
  assert.equal(av(`git push "origin`).trava, 'T0'); assert.ok(av(`echo "a`).permite);
  assert.ok(av(`echo "digit`).permite);
  assert.equal(av(`GH pr "x`).trava, 'T0');
});
test('nome de comando vindo de variável', () => {
  assert.equal(av('$GIT push origin main').trava, 'T0');
  assert.ok(av('$EDITOR notas.txt').permite);
  assert.equal(av('`which git` push origin main').trava, 'T0');
  assert.equal(av('eval "$CMD" git').trava, 'T0');
  assert.ok(av('source $HOME/.perfil').permite);
});

// ---- edição, recusa
test('edição de arquivo sempre permite nesta fatia', () => assert.ok(avaliar({ tipo: 'edicao', arquivo: 'src/a.js', cwd: '/r' }, ctx).permite));
test('ação de tipo desconhecido é erro de programação', () => assert.throws(() => avaliar({ tipo: 'x' }, ctx), TypeError));
test('recusa sem saída é erro de programação', () => { assert.throws(() => recusa('T9', 'motivo', '')); assert.throws(() => recusa('T9', 'motivo')); });
test('textoDaRecusa traz o Faça', () => assert.match(textoDaRecusa(av('git add -A')), /^Recusado \(T2\): .+\nFaça: .+/));

// ---- rodada de consertos 1
test('1. refspec com $ ou crase é destino desconhecido', () => {
  for (const c of ['git push origin $(git branch --show-current)', 'git push -u origin "$(git rev-parse --abbrev-ref HEAD)"', 'B=main; git push origin $B', 'git push origin $B', 'git push origin `echo main`'])
    assert.equal(av(c, '/w').trava, 'T5', c);
  assert.ok(av('git push $REMOTO feat/x', '/w').permite);
});
test('2. --repo=origin não descarta o refspec', () => {
  assert.equal(av('git push --repo=origin main').trava, 'T5');
  assert.ok(av('git push --repo=origin feat/x', '/w').permite);
});
test('3. --branches e abreviações inequívocas', () => {
  for (const c of ['git push --branches', 'git push --branches origin', 'git push --al', 'git push --mirr origin', 'git push --branch', 'git push --del origin main'])
    assert.equal(av(c).trava, 'T5', c);
  assert.ok(av('git push --dry origin feat/x', '/w').permite);
});
test('4. T0 nunca é liberada por AH_GUARD=off', () => {
  assert.equal(av('AH_GUARD=off eval $X git').trava, 'T0');
  assert.equal(av('AH_GUARD=off `echo git` push origin main').trava, 'T0');
  assert.equal(av('AH_GUARD=off git push "origin').trava, 'T0');
});
test('5. repositório apontado por opção ou variável', () => {
  for (const c of ['GIT_DIR=/x/.git git add -A', 'GIT_WORK_TREE=/x git commit -a', 'git --git-dir=/x add -A', 'git --git-dir /x add -A', 'git --work-tree=/x add .', 'git --work-tree /x add .'])
    assert.equal(av(c, '/w').trava, 'T2', c);
  for (const c of ['GIT_DIR=/x git push', 'git --git-dir=/x push', 'git --work-tree /x push', 'env GIT_DIR=/x git push'])
    assert.equal(av(c, '/w').trava, 'T5', c);
  assert.ok(av('GIT_DIR=/x git push origin feat/x', '/w').permite);
});
test('6. nome-base do comando', () => {
  assert.equal(av('/usr/bin/git push origin main').trava, 'T5');
  assert.equal(av('/usr/local/bin/gh pr merge 8').trava, 'T5');
  assert.equal(av('C:/Git/git.exe push origin main').trava, 'T5');
  assert.equal(av('/usr/bin/git add -A').trava, 'T2');
});
test('7. git stage é git add', () => assert.equal(av('git stage -A').trava, 'T2'));
test('8. heads/x completa para refs/heads/x', () => {
  assert.equal(av('git push origin dev:heads/main').trava, 'T5');
  assert.equal(av('git push origin dev:refs/heads/stage').trava, 'T5');
});
test('9. --recurse-submodules com valor separado', () => {
  for (const v of ['on-demand', 'check', 'only', 'no']) {
    assert.equal(avaliar({ tipo: 'comando', comando: `git push --recurse-submodules ${v} origin`, cwd: '/r' }, comRamo('main')).trava, 'T5', v);
    assert.ok(avaliar({ tipo: 'comando', comando: `git push --recurse-submodules ${v} origin`, cwd: '/r' }, comRamo('feat/x')).permite, v);
  }
  assert.equal(av('git push --recurse-submodules=check origin main').trava, 'T5');
});
test('10. gh pr merge com opções de valor antes do número', () => {
  for (const o of ['--body x', '-b x', '-t titulo', '--subject s', '--body-file f', '-F f', '--match-head-commit sha', '--author-email e', '-A e']) {
    assert.ok(av(`gh pr merge ${o} 7`).permite, o);
    assert.equal(av(`gh pr merge ${o} 8`).trava, 'T5', o);
  }
});
test('AH_GUARD exportado ou solto em comando anterior não vale para o seguinte', () => {
  assert.equal(av('export AH_GUARD=off; git push origin main').trava, 'T5');
  assert.equal(av('AH_GUARD=off; git push origin main').trava, 'T5');
});

// ---- onda final: C2 (troca de ramo na mesma linha)
// A T1 recusa antes a troca de ramo no checkout principal; com a troca liberada (AH_GUARD=off
// só nela), a T5 continua enxergando o ramo que a troca deixa em uso.
const soTrocaLiberada = c => c.replace(/\bgit (checkout|switch)\b/g, 'AH_GUARD=off git $1');
const C2_RECUSA = ['git checkout main && git push', 'git switch main && git merge dev && git push', 'git checkout stage && git merge dev && git push origin HEAD',
  'git checkout main; git push', 'git switch main && git push origin', 'git checkout $RAMO && git push', 'git checkout - && git push',
  'git switch --detach && git push', '(git checkout main) && git push', 'git switch -C main && git push', 'git checkout -B stage && git push',
  'git switch --track origin/main && git push'];
test('C2. checkout/switch para ramo protegido antes do push, na mesma linha', () => {
  for (const c of C2_RECUSA) assert.equal(av(soTrocaLiberada(c)).trava, 'T5', c);
  for (const c of C2_RECUSA.filter(c => !c.includes('$RAMO'))) assert.equal(av(c).trava, 'T1', c);
});
test('C2. o que não troca para ramo protegido continua passando na T5', () => {
  for (const c of ['git checkout -b x && git push -u origin x', 'git switch dev && git merge --no-ff feat/x && git push origin dev',
    'git switch -c nova && git push', 'git checkout main -- arquivo.txt && git push', 'git checkout -- arquivo.txt && git push',
    'git -C /w checkout main && git push', 'git checkout main && git -C /w push', 'git checkout main && git merge dev'])
    assert.ok(av(soTrocaLiberada(c)).permite, c);
  for (const c of ['git switch dev && git merge --no-ff feat/x && git push origin dev', 'git checkout main -- arquivo.txt && git push',
    'git checkout -- arquivo.txt && git push', 'git -C /w checkout main && git push'])
    assert.ok(av(c).permite, c);
  for (const c of ['git checkout -b x && git push -u origin x', 'git switch -c nova && git push', 'git checkout main && git -C /w push', 'git checkout main && git merge dev'])
    assert.equal(av(c).trava, 'T1', c);
});
test('C2. troca que pode não ter acontecido não afrouxa o ramo protegido que já estava em uso', () => {
  const emMain = c => avaliar({ tipo: 'comando', comando: c, cwd: '/r' }, comRamo('main'));
  // A troca pode falhar (;, ||, segundo plano, negação) ou não ser troca (checkout de arquivo,
  // corpo de função, status de outro comando): o ramo de antes continua possível.
  for (const c of ['git switch dev; git push', 'git checkout src/a.js && git push', 'git switch dev || true && git push',
    'git switch dev & git push', '! git switch dev && git push', 'git switch dev | cat && git push', 'f() { git switch dev; } && git push',
    `bash -c 'exit 0; git switch dev' && git push`, `bash -c 'false || git switch dev' && git push`, 'setsid git switch dev && git push',
    'xargs -r git switch dev && git push', 'coproc git switch dev && git push', 'git checkout nao-existe && git push',
    'case x in y) git switch dev;; esac && git push', '{ git switch dev; true; } && git push', 'AH_GUARD=off git switch HEAD && git push'])
    assert.equal(emMain(c).trava, 'T5', c);
  // No worktree (sem T1): a troca para main deu certo; a para dev, depois do `;`, pode ter falhado.
  assert.equal(av('git switch main && git switch dev; git push', '/w').trava, 'T5');
});
test('C2. troca que deu certo antes do push define o ramo do push (pendência 7)', () => {
  // No worktree da frente a T1 não vale: o push roda na dev, último destino.
  assert.ok(av('git switch main && git pull && git switch dev && git push', '/w').permite);
  assert.ok(av(soTrocaLiberada('git switch main && git pull && git switch dev && git push')).permite);
  const emMain = c => avaliar({ tipo: 'comando', comando: c, cwd: '/r' }, comRamo('main'));
  for (const c of ['git switch dev && git push', 'git checkout dev && git push', '(git switch dev) && git push', `bash -c 'git switch dev' && git push`,
    'git switch dev && { git pull; git push; }', 'git switch dev && bash -c "git pull; git push"', 'AH_GUARD=off git switch -c nova && git push'])
    assert.ok(emMain(c).permite, c);
  // E o último destino conhecido protegido recusa, mesmo vindo de um ramo livre.
  assert.equal(av('git switch dev && AH_GUARD=off git switch main && git push', '/w').trava, 'T5');
});
test('C2. a troca que deu certo só descarta as que certamente rodaram antes dela (terceira revisão)', () => {
  // Corpo de função, texto de trap, segundo plano e coproc rodam em outro momento: podem trocar depois.
  for (const c of ['f() { git switch main; }; git switch dev && f && git push', 'function f { git switch main; }; git switch dev && f && git push',
    'f() { git switch main; } && git switch dev && f && git push', 'f() { git switch main; }\ngit switch dev && f && git push',
    'trap "git switch main" DEBUG; git switch dev && git push', `trap 'git switch main' RETURN; git switch dev && git push`,
    '(sleep 1; git switch main) & git switch dev && sleep 2 && git push', 'git switch main & git switch dev && sleep 2 && git push',
    'coproc { sleep 1; git switch main; }; git switch dev && sleep 2 && git push', 'coproc git switch main; git switch dev && git push',
    'git switch dev && f() { git switch main; } && f && git push', `eval 'f() { git switch main; }'; git switch dev && f && git push`])
    assert.equal(av(c, '/w').trava, 'T5', c);
  // A que certamente rodou antes (só && entre as duas) continua descartada, também dentro do corpo e do trap.
  for (const c of ['git switch main && git pull && git switch dev && git push', 'f() { git status; }; git switch main && git switch dev && f && git push',
    'trap "git status" EXIT; git switch main && git switch dev && git push', 'f() { git switch main && git switch dev && git push; }; f',
    '(sleep 1; git status) & git switch main && git switch dev && git push', 'git switch main && { git switch feat/x && git switch dev; } && git push'])
    assert.ok(av(c, '/w').permite, c);
});

// ---- onda final: I4 (formas de "tudo" no checkout principal)
test('I4. pathspec que cobre a raiz, * solto e caminho que não dá para ler', () => {
  for (const [c, cwd] of [['git add *', '/r'], ['cd src && git add ..', '/r'], ['git add /r', '/r'], ['git add /r/', '/r'], ['git add "$(pwd)"', '/r'],
    ['git commit . -m x', '/r'], ['git commit -m x -- .', '/r'], ['git add $(git ls-files -m)', '/r'], ['git add ./*', '/r'], ['git add ../*', '/r/src'],
    ['git add /', '/r'], ['git add ../..', '/r/a/b'], ['git commit -m x $ARQ', '/r'], ['git add -- "$X"', '/r']]) {
    const r = avaliar({ tipo: 'comando', comando: c, cwd }, ctx);
    assert.equal(r.trava, 'T2', c);
  }
  assert.match(av('git add $(git ls-files -m)').motivo, /não consegui ler os caminhos/);
});
test('I4. caminhos literais e opções seguem passando', () => {
  for (const c of ['git add src/a.js docs/', 'git add -- arquivo', 'git commit -m x', 'git add -p', 'git commit -m "$(cat msg.txt)"',
    'git commit --message="$X"', 'git commit -m x -- src/a.js', 'git add src/*.js', 'cd src && git add a.js', 'git add ..x'])
    assert.ok(av(c).permite, c);
  assert.ok(av('git add $(git ls-files -m)', '/w').permite);
  assert.ok(av('git add .', '/w').permite);
});
test('T2: $ ou crase em caminho literal (aspas simples, escape) não é expansão (pendência 8)', () => {
  for (const c of [`git add 'a$b.txt'`, "git add 'src/`x`.js'", `git commit -m x -- 'a$b'`, `git add "a\\$b"`, `git add a\\$b`,
    `bash -c "git add 'a\\$b'"`, `git stage -- 'docs/$ver.md' src/a.js`])
    assert.ok(av(c).permite, c);
  // O que expande continua ilegível, mesmo ao lado (ou com o mesmo texto) de um literal.
  for (const c of [`git add "$X"`, `git add 'a'$X`, `git add 'a$b' a$b`, `git add 'a$b' "$X"`, 'git add "src/`x`.js"',
    `git commit -m x -- "$(pwd)"`, `git add 'a$b'*`, `bash -c 'git add "$X"'`]) {
    const r = av(c);
    assert.equal(r.trava, 'T2', c);
    assert.match(r.motivo, /não consegui ler os caminhos/, c);
  }
  assert.equal(av(`git add 'a$b' .`).trava, 'T2'); // o literal não esconde o "tudo" ao lado
});
test('T2: no texto relido que veio de palavra com expansão, as aspas simples não seguram o $ (terceira revisão)', () => {
  // A camada de fora expande o $ (e a crase) antes de o texto ser relido: não é literal.
  for (const c of [`bash -c "git add '$(pwd)'"`, "bash -c \"git add '`pwd`'\"", `bash -c "git commit -m x -- '$PWD'"`, `eval "git add '$X'"`,
    `su -c "git add '$X'"`, `bash -c "bash -c \\"git add '\\$X'\\""`, `echo "git add '$X'" | sh`, `sh <<EOF\ngit add '$X'\nEOF`,
    `sh <<< "git add '$X'"`, `trap "git add '$X'" EXIT`, `env -S "git add '$X'"`, `env -S"git add '$X'"`, `sudo bash -c "git add '$X'"`])
    assert.equal(av(c).trava, 'T2', c);
  // Sem expansão na camada de fora, o literal continua literal.
  for (const c of [`sh -c "git add 'a\\$b'"`, `sh <<'EOF'\ngit add 'a$b'\nEOF`, `bash -c 'git add '"'"'a$b'"'"`, `echo "git add 'a\\$b'" | sh`,
    `env -S "git add 'a\\$b'"`, `eval 'git add '"'"'a$b'"'"`])
    assert.ok(av(c).permite, c);
});

// ---- onda final: M6 (cd que pode falhar seguido de ;)
test('M6. cd seguido de ; avalia também na pasta de antes', () => {
  assert.equal(av('cd nao-existe; git add -A').trava, 'T2');
  assert.equal(av('cd /w; git add -A').trava, 'T2');
  assert.ok(av('cd /w && git add -A').permite);
  assert.ok(av('cd /w || exit 1; git add -A').permite);
  assert.equal(av('cd /w; git push').trava, undefined); // dev no checkout principal: passa nos dois
  assert.equal(avaliar({ tipo: 'comando', comando: 'cd /w; git push', cwd: '/r' }, { ...ctx, ramoAtual: c => (c?.startsWith('/w') ? 'feat/x' : 'main') }).trava, 'T5');
});

// ---- T1 e T3 (checkout principal)
for (const c of ['git switch main', 'git switch -c nova', 'git switch -', 'git switch --detach', 'git checkout main', 'git checkout -b nova',
  'git checkout -', 'git checkout --detach HEAD~1', 'git checkout v1', 'gh pr checkout 7', 'cd . && git checkout stage', `bash -c 'git switch main'`])
  test(`T1 recusa: ${c}`, () => { const r = av(c); assert.equal(r.trava, 'T1'); assert.match(textoDaRecusa(r), /Faça: .*tools\/ah open/); });
test('T1 permite voltar à base e restaurar arquivo', () => {
  for (const c of ['git switch dev', 'git checkout dev', 'git checkout arquivo.txt', 'git checkout main -- arquivo.txt', 'git checkout nao-existe']) assert.ok(av(c).permite, c);
});
test('T1 e T3 não valem no worktree da frente', () => { for (const c of ['git switch -c outra', 'git reset --hard', 'git stash', 'git rebase dev']) assert.ok(av(c, '/w').permite, c); });
for (const c of ['git reset --hard', 'git reset --hard HEAD~1', 'git reset --keep x', 'git reset --merge', 'git clean -fd', 'git clean -xdf', 'git clean --force',
  'git checkout .', 'git checkout -- .', 'git restore .', 'git restore :/', 'git checkout -f dev', 'git switch --discard-changes dev',
  'git stash', 'git stash pop', 'git stash push -m x', 'git rebase dev', 'git rebase -i HEAD~2'])
  test(`T3 recusa: ${c}`, () => assert.equal(av(c).trava, 'T3'));
test('T3 permite', () => { for (const c of ['git stash list', 'git stash show', 'git rebase --abort', 'git reset', 'git reset HEAD arquivo.txt', 'git clean -n', 'git restore arquivo.txt']) assert.ok(av(c).permite, c); });
test('T1 e T3 recusam com cwd desconhecido', () => { assert.equal(av('cd "$X" && git stash').trava, 'T3'); });
test('AH_GUARD=off libera T1 e T3 no próprio comando', () => { assert.equal(av('AH_GUARD=off git switch main').liberada, 'T1'); assert.equal(av('AH_GUARD=off git reset --hard').liberada, 'T3'); });
test('troca de ramo seguida de push no principal agora cai na T1', () => assert.equal(av('git switch main && git pull && git switch dev && git push').trava, 'T1'));

test('T1 e T3: o texto da recusa', () => {
  const r1 = av('git switch main');
  assert.equal(textoDaRecusa(r1), 'Recusado (T1): trocar o ramo do checkout principal muda o chão das outras sessões\n'
    + 'Faça: trabalhe no worktree de uma frente (tools/ah open <nome>); o checkout principal fica em dev');
  const r3 = av('git reset --hard');
  assert.match(r3.motivo, /^git reset --hard no checkout principal descarta ou esconde trabalho que pode ser de outra sessão$/);
  assert.equal(r3.saida, 'faça isso no worktree da sua frente; no checkout principal, guarde por caminho (git add <caminhos> e git commit) ou combine com a dona das mudanças');
});
test('T1 vem antes da T3 quando as duas recusariam', () => {
  assert.equal(av('git checkout -f main').trava, 'T1');
  assert.equal(av('git switch --discard-changes main').trava, 'T1');
  assert.equal(av('git checkout main -- .').trava, 'T3');
});
test('T1 e T3 com opções globais do git antes do subcomando', () => {
  assert.equal(av('git -C /r switch main', '/w').trava, 'T1');
  assert.ok(av('git -C /w switch main').permite);
  assert.equal(av('git -c x=y reset --hard').trava, 'T3');
  assert.equal(av('git -c x=y switch main').trava, 'T1');
  assert.equal(av('git -C /r reset --hard', '/w').trava, 'T3');
  assert.ok(av('git -C /w reset --hard').permite);
  assert.equal(av('git --git-dir=/x reset --hard', '/w').trava, 'T3');
  assert.equal(av('gh -R exemplo/loja pr checkout 7').trava, 'T1');
});
test('T1: outras formas de troca de ramo', () => {
  for (const c of ['git switch --create nova', 'git switch --force-create nova', 'git switch --orphan nova', 'git switch -d', 'git switch -C nova',
    'git switch --track origin/main', 'git checkout -B nova', 'git checkout --orphan nova', 'git checkout -bnova', 'git checkout --orphan=nova',
    'git switch -q main', 'git checkout -q main', 'cd /w; git switch main'])
    assert.equal(av(c).trava, 'T1', c);
});
test('T1: checkout com mais de um posicional ou depois de -- não troca de ramo', () => {
  for (const c of ['git checkout main arquivo.txt', 'git checkout main -- src/a.js', 'git checkout -- main', 'git checkout -p', 'git checkout']) assert.ok(av(c).permite, c);
});
test('T1: sem ehRef nem existe no ctx (contexto antigo), checkout de nome solto não recusa', () => {
  const { ehRef, existe, ...antigo } = ctx;
  assert.ok(avaliar({ tipo: 'comando', comando: 'git checkout main', cwd: '/r' }, antigo).permite);
  assert.equal(avaliar({ tipo: 'comando', comando: 'git switch main', cwd: '/r' }, antigo).trava, 'T1');
  assert.equal(avaliar({ tipo: 'comando', comando: 'git checkout -b x', cwd: '/r' }, antigo).trava, 'T1');
});
test('T1: a pasta que chega a ehRef', () => {
  const vistos = [];
  const c = { ...ctx, ehRef: (d, n) => { vistos.push(['ehRef', d, n]); return true; } };
  assert.equal(avaliar({ tipo: 'comando', comando: 'git checkout x', cwd: '/r/src' }, c).trava, 'T1');
  assert.deepEqual(vistos, [['ehRef', '/r/src', 'x']]);
});
test('T1: nome que é ramo e caminho ao mesmo tempo recusa', () => {
  const c = { ...ctx, existe: () => true };
  assert.equal(avaliar({ tipo: 'comando', comando: 'git checkout main', cwd: '/r' }, c).trava, 'T1');
  assert.ok(avaliar({ tipo: 'comando', comando: 'git checkout arquivo.txt', cwd: '/r' }, c).permite, 'só caminho passa');
});
test('T3: formas abreviadas e combinadas', () => {
  for (const c of ['git reset --ha', 'git reset --me', 'git reset --ke HEAD', 'git clean -ffdx', 'git clean -df', 'git clean --fo', 'git checkout --force dev',
    'git checkout -fq dev', 'git switch -f dev', 'git switch --force dev', 'git switch --di dev', 'git restore --staged .', 'git restore -s main -- .',
    'git checkout main .', 'git checkout ..', 'git stash -m x', 'git stash drop', 'git stash clear', 'git rebase --continue', 'git rebase --onto dev x',
    'git checkout "$ARQ"', 'git restore $(git diff --name-only)'])
    assert.equal(av(c).trava, 'T3', c);
});
test('T3: o que não descarta passa', () => {
  for (const c of ['git reset --soft HEAD~1', 'git reset --mixed', 'git reset -q', 'git clean -nfd', 'git clean --dry-run -f', 'git clean -e f -n',
    'git restore src/a.js', 'git restore -s main arquivo.txt', 'git rebase --quit', 'git stash list --stat', 'git checkout -- src/a.js'])
    assert.ok(av(c).permite, c);
});

// ---- T4 (worktree de frente de outra sessão viva)
const ctx4 = {
  ...ctx, sessao: 'eu', frentes: [{ id: 'cd-1', nome: 'frete', ramo: 'feat/frete', worktree: '/wt/frete', dona: 'outra' }],
  viva: id => id === 'outra', normalizar: x => x,
};
const av4 = (comando, cwd = '/r/x') => avaliar({ tipo: 'comando', comando, cwd }, ctx4);
for (const c of ['git -C /wt/frete commit -m x', 'cd /wt/frete && git add a.js', 'git worktree remove --force /wt/frete', 'git branch -D feat/frete',
  'rm -rf /wt/frete', 'rm /wt/frete/src/a.js', 'cp a.js /wt/frete/a.js', 'mv /wt/frete/a.js b.js', 'echo x > /wt/frete/a.js',
  'cat <<EOF > /wt/frete/a.js\nx\nEOF', 'sed -i s/a/b/ /wt/frete/a.js', 'tee /wt/frete/a.js', 'touch ../../wt/frete/a.js'])
  test(`T4 recusa: ${JSON.stringify(c)}`, () => { const r = av4(c); assert.equal(r.trava, 'T4'); assert.match(textoDaRecusa(r), /cd-1 frete[\s\S]*Faça: .*ah handoff/); });
test('T4 permite ler o alheio, copiar dele e escrever nele quando a dona morreu', () => {
  for (const c of ['cat /wt/frete/a.js', 'cp /wt/frete/a.js meu.js', 'git -C /wt/frete log', 'git -C /wt/frete status', 'grep x -r /wt/frete']) assert.ok(av4(c).permite, c);
  assert.ok(avaliar({ tipo: 'comando', comando: 'rm -rf /wt/frete', cwd: '/r' }, { ...ctx4, viva: () => false }).permite);
});
test('T4 na edição: recusa no alheio, permite no principal; AH_GUARD não libera', () => {
  assert.equal(avaliar({ tipo: 'edicao', arquivo: '/wt/frete/a.js', cwd: '/r' }, ctx4).trava, 'T4');
  assert.ok(avaliar({ tipo: 'edicao', arquivo: 'src/a.js', cwd: '/r' }, ctx4).permite);
  assert.equal(av4('AH_GUARD=off rm /wt/frete/a.js').liberada, 'T4');
});
test('T4: texto exato do motivo e da saída', () => {
  const r = av4('rm /wt/frete/a.js');
  assert.equal(textoDaRecusa(r), 'Recusado (T4): /wt/frete/a.js está no worktree da frente cd-1 frete, da sessão outra, que está viva\n'
    + 'Faça: escreva só no worktree da sua frente; para mexer em frete, peça à sessão outra (ah handoff) ou, se ela morrer, ah takeover frete');
});
test('T4: mais formas que escrevem no alheio', () => {
  for (const c of ['git worktree move /wt/frete /wt/outro', 'git branch --delete feat/frete', 'git branch -m feat/frete novo', 'git branch -f feat/frete HEAD',
    'git -C /wt/frete/src stash', 'cd /wt/frete; git reset --hard', 'install a.js /wt/frete/a.js', 'ln -s a /wt/frete/l', 'cp -t /wt/frete a.js',
    'perl -pi -e s/a/b/ /wt/frete/a.js', 'sed -n -e s/a/b/ -i /wt/frete/a.js', 'sed --in-place=.bak s/a/b/ /wt/frete/a.js', 'dd if=a of=/wt/frete/a',
    'chmod +x /wt/frete/a.sh', 'mkdir -p /wt/frete/novo', 'truncate -s 0 /wt/frete/a', '> /wt/frete/a', 'X=1 >> /wt/frete/a', '( x ) > /wt/frete/a',
    'bash -c "rm /wt/frete/a"', 'git -C /b status > /wt/frete/a', 'cd /wt/frete && echo x > a.js', 'cd /wt; rm -r frete', 'rm -- /wt/frete'])
    assert.equal(av4(c).trava, 'T4', c);
});
test('T4: o que não é da frente alheia ou não dá para avaliar passa', () => {
  for (const c of ['git branch feat/frete-2', 'git branch -D feat/frete-2', 'git branch --list feat/frete', 'git -C /wt/frete2 commit -m x', 'rm /wt/frete2/a',
    'sed s/a/b/ /wt/frete/a.js', 'perl -ne print /wt/frete/a.js', 'cp /wt/frete/a b', 'echo x > $D/a', 'rm `pwd`/a', 'rm ~/a', 'echo x 2>&1', 'dd if=/wt/frete/a of=b',
    'git -C /wt/frete diff > /r/d.txt'])
    assert.ok(av4(c).permite, c);
  assert.ok(avaliar({ tipo: 'comando', comando: 'rm a.js', cwd: null }, ctx4).permite);
  assert.ok(avaliar({ tipo: 'comando', comando: 'rm /wt/frete/a', cwd: '/r' }, ctx).permite, 'sem frentes no ctx a T4 não age');
  assert.ok(avaliar({ tipo: 'edicao', arquivo: '/wt/frete/a.js', cwd: '/r' }, ctx).permite);
});
test('T4: o cd que pode ter falhado também conta, e a edição relativa resolve contra o cwd', () => {
  assert.equal(av4('cd /wt/frete; cd /r/nao-existe; rm a.js').trava, 'T4');
  assert.equal(avaliar({ tipo: 'edicao', arquivo: 'a.js', cwd: '/wt/frete/src' }, ctx4).trava, 'T4');
  assert.equal(avaliar({ tipo: 'edicao', arquivo: '../wt/frete/a.js', cwd: null }, ctx4).trava, 'T4', 'cwd nulo na edição: resolve contra a raiz');
});

// Foco 2: o worktree alheio escrito por outro caminho.
test('T4 pega o worktree alheio por link simbólico e por ..', { skip: process.platform === 'win32' }, t => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ah-teste-t4-')));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'wt', 'frete'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'wt', 'x'), { recursive: true });
  fs.symlinkSync(path.join(tmp, 'wt'), path.join(tmp, 'atalho'));
  fs.symlinkSync(path.join(tmp, 'wt', 'frete', 'nada'), path.join(tmp, 'pendurado'));
  const c = { ...ctx4, normalizar: normalizarCaminho, frentes: [{ ...ctx4.frentes[0], worktree: normalizarCaminho(path.join(tmp, 'wt', 'frete')) }] };
  assert.equal(avaliar({ tipo: 'edicao', arquivo: path.join(tmp, 'atalho', 'frete', 'a.js'), cwd: '/r' }, c).trava, 'T4');
  assert.equal(avaliar({ tipo: 'comando', comando: `touch ${tmp}/wt/x/../frete/b.js`, cwd: '/r' }, c).trava, 'T4');
  assert.equal(avaliar({ tipo: 'comando', comando: `echo x > ${tmp}/pendurado`, cwd: '/r' }, c).trava, 'T4');
  assert.equal(avaliar({ tipo: 'comando', comando: 'git add a.js', cwd: path.join(tmp, 'atalho', 'frete') }, c).trava, 'T4');
  assert.equal(avaliar({ tipo: 'comando', comando: `touch '${tmp}/wt/frete/a\\..\\..\\x'`, cwd: '/r' }, c).trava, 'T4');
  assert.ok(avaliar({ tipo: 'comando', comando: `touch ${tmp}/atalho/x/b.js`, cwd: '/r' }, c).permite);
  assert.equal(avaliar({ tipo: 'comando', comando: `rm -rf ${tmp}/atalho/*`, cwd: '/r' }, c).trava, 'T4', 'curinga pelo link');
  assert.ok(avaliar({ tipo: 'comando', comando: `rm -rf ${tmp}/atalho/x*`, cwd: '/r' }, c).permite);
});

// ---- Consertos da revisão da T4
test('T4: apagar, mover ou mudar permissão em árvore de uma pasta que contém o worktree alheio recusa', () => {
  for (const c of ['rm -rf /wt', 'rm -r /', 'rm --recursive /wt', 'rm -R -- /wt', 'mv /wt /tmp/x', 'mv a /wt', 'cd /wt/frete/src && rm -rf ../..', 'rmdir /wt',
    'chmod -R 700 /wt', 'chown --recursive x /wt', 'mv -t /wt a'])
    assert.equal(av4(c).trava, 'T4', c);
  for (const c of ['rm /wt', 'chmod 700 /wt', 'rm -rf /wt2', 'rm -rf /wt/outra', 'touch /wt', 'cp -r /wt /tmp/copia'])
    assert.ok(av4(c).permite, c);
});
test('T4: leituras do git no worktree alheio passam', () => {
  for (const c of ['git -C /wt/frete stash list', 'git -C /wt/frete stash show -p', 'git -C /wt/frete tag', 'git -C /wt/frete tag -l "v*"', 'git -C /wt/frete tag --list',
    'git -C /wt/frete notes', 'git -C /wt/frete notes show HEAD', 'git -C /wt/frete notes list', 'git -C /wt/frete checkout'])
    assert.ok(av4(c).permite, c);
  for (const c of ['git -C /wt/frete stash', 'git -C /wt/frete stash pop', 'git -C /wt/frete tag v1', 'git -C /wt/frete tag -d v1', 'git -C /wt/frete notes add -m x',
    'git -C /wt/frete checkout x'])
    assert.equal(av4(c).trava, 'T4', c);
});

// ---- Onda final: curinga do shell no alvo da T4
test('T4: curinga que pode casar o worktree alheio recusa', () => {
  for (const c of ['rm -rf /wt/*', 'rm -rf /wt/fr?te', 'rm -rf /wt/[f]rete', 'rm -rf /wt/f*', 'rm -rf /*', 'rm -rf /w*', 'rm /wt/frete/*.js',
    'rm -rf /wt/*/src', 'touch /wt/fr*/a', 'mv /wt/f* /x', 'rm -rf /wt/*/x/y', 'touch /wt/*'])
    assert.equal(av4(c).trava, 'T4', c);
  assert.equal(avaliar({ tipo: 'comando', comando: 'rm -rf *', cwd: '/wt' }, ctx4).trava, 'T4');
  assert.equal(av4('cd /wt && rm -rf *').trava, 'T4');
  assert.equal(av4('cd /wt && rm -rf ./f*').trava, 'T4');
});
test('T4: curinga que não casa nenhum worktree alheio vivo passa', () => {
  for (const c of ['rm -rf /wt/x*', 'rm -rf /wt/fr?t', 'rm -rf /wt/[a-e]rete', 'rm -rf /outra/*', 'rm -rf /wt/frete?', 'rm -rf /wt2/*'])
    assert.ok(av4(c).permite, c);
  assert.ok(avaliar({ tipo: 'comando', comando: 'rm -rf /wt/*', cwd: '/r' }, { ...ctx4, viva: () => false }).permite, 'dona morta');
});
test('T4: *, ? e [!…] não casam o ponto do começo de um nome (pendência 9)', () => {
  const oculto = { ...ctx4, frentes: [{ ...ctx4.frentes[0], worktree: '/loja/.wt/frete' }] };
  const av = (c, cwd = '/loja') => avaliar({ tipo: 'comando', comando: c, cwd }, oculto);
  for (const c of ['rm -rf *', 'rm -rf ./*', 'rm -rf /loja/*', 'rm -rf /loja/?wt', 'rm -rf /loja/[!x]wt', 'rm -rf /loja/*/frete', 'chmod -R 700 *'])
    assert.ok(av(c).permite, c);
  // O ponto escrito, a lista entre colchetes (o POSIX deixa em aberto), o dotglob e a pasta comum acima recusam.
  for (const c of ['rm -rf .*', 'rm -rf .w*', 'rm -rf /loja/.wt/*', 'rm -rf /loja/.??', 'rm -rf /loja/[.]wt', 'rm -rf /loja/.wt/fre*',
    'shopt -s dotglob; rm -rf *', 'setopt globdots; rm -rf *', 'GLOBIGNORE=x; rm -rf *', 'rm -rf /*'])
    assert.equal(av(c).trava, 'T4', c);
  const funda = { ...ctx4, frentes: [{ ...ctx4.frentes[0], worktree: '/loja/a/.wt/frete' }] };
  assert.equal(avaliar({ tipo: 'comando', comando: 'rm -rf /loja/*', cwd: '/r' }, funda).trava, 'T4', 'rm -r de uma pasta comum leva o oculto junto');
  assert.ok(avaliar({ tipo: 'comando', comando: 'rm -rf /loja/*/*', cwd: '/r' }, funda).permite);
});

test('T4: recusa própria para git branch sobre o ramo de frente alheia', () => {
  assert.equal(textoDaRecusa(av4('git branch -D feat/frete')),
    'Recusado (T4): o ramo feat/frete é da frente cd-1 frete, da sessão outra, que está viva; apagar, renomear ou mover o ramo tira o trabalho dela do lugar\n'
    + 'Faça: deixe o ramo feat/frete como está; para mexer nele, peça à sessão outra (ah handoff) ou, se ela morrer, ah takeover frete');
});

// ---- T6
const CLASSES_T6 = { exclusivo: { vagas: 'todas', padroes: ['npm run e2e*'] }, grande: { vagas: 1, padroes: ['npm run build*', 'tsc'] } };
const ctxT6 = { ...ctx, config: aplicarPadroes({ pesado: { classes: CLASSES_T6 } }) };
const av6 = (comando, extra = {}) => avaliar({ tipo: 'comando', comando, cwd: '/w' }, { ...ctxT6, ...extra });
for (const c of ['npm run build', 'npm run build:prod -- --x', 'echo a && npm run e2e', '(cd sub && npm run build)', `bash -c 'npm run build'`,
  'env CI=1 npm run build', 'cd /w && tsc', 'true; /usr/bin/npm run e2e', `sh -c "echo; npm run build"`, 'time npm run build', 'npm run build | tee log'])
  test(`T6 recusa: ${c}`, () => {
    const r = av6(c);
    assert.equal(r.trava, 'T6', c);
    assert.match(r.saida, /^tools\/ah pesado -- /);
  });
test('T6: a saída repete o comando', () => {
  assert.equal(av6('npm run build:prod --x').saida, 'tools/ah pesado -- npm run build:prod --x');
  assert.equal(av6(`bash -c 'tsc -p "a b"'`).saida, `tools/ah pesado -- tsc -p 'a b'`);
});
test('T6: o prefixo AH_PESADO_ANINHADO no texto não libera (só AH_GUARD=off)', () => {
  assert.equal(av6('AH_PESADO_ANINHADO=3 npm run build').trava, 'T6');
  assert.equal(av6('export AH_PESADO_ANINHADO=1; npm run build').trava, 'T6');
});
test('T6 passa: pela fila, liberada, aninhada, sem classes, comando que não casa', () => {
  assert.ok(av6('tools/ah pesado -- npm run build').permite);
  assert.ok(av6(`./tools/ah pesado -- bash -c 'npm run e2e'`).permite);
  assert.ok(av6('tools/ah pesado --classe npm run build').permite);
  assert.equal(av6('AH_GUARD=off npm run build').liberada, 'T6');
  assert.ok(av6('npm run build', { aninhado: true }).permite);
  assert.ok(avaliar({ tipo: 'comando', comando: 'npm run build', cwd: '/w' }, ctx).permite);
  assert.ok(av6('npm test && npm run lint && echo npm run build').permite);
});

// ---- pendência 10: cd que pode falhar no meio
test('M6. cd x && a; b: a avaliado só em x, b também na pasta de antes', () => {
  assert.ok(av('cd /w && git add -A; git status').permite);
  for (const c of ['cd /w && git status; git add -A', 'cd /w && git log && git status; git add -A', 'cd /w && true; git commit -a -m x'])
    assert.equal(av(c).trava, 'T2', c);
});

// ---- pendência 11: merge de PR pela API
test('T5: gh api …/pulls/<n>/merge com PUT é avaliado como gh pr merge (pendência 11)', () => {
  for (const c of ['gh api -X PUT repos/{owner}/{repo}/pulls/8/merge', 'gh api repos/:owner/:repo/pulls/8/merge --method PUT',
    'gh api --method=put /repos/{owner}/{repo}/pulls/8/merge -f merge_method=squash', 'gh api -XPUT repos/{owner}/{repo}/pulls/8/merge',
    'gh api repos/{owner}/{repo}/pulls/8/merge -f merge_method=squash', 'gh api repos/exemplo/loja/pulls/7/merge -X PUT',
    'gh api repos/{owner}/{repo}/pulls/9/merge -X PUT', 'gh api repos/{owner}/{repo}/pulls/8/merge -X $M', 'gh api repos/{owner}/{repo}/pulls/$N/merge -X PUT',
    'gh api https://api.github.com/repos/exemplo/loja/pulls/8/merge -X PUT', 'gh api -H "Accept: x" repos/{owner}/{repo}/pulls/8/merge/ -X PUT']) {
    const r = av(c);
    assert.equal(r.trava, 'T5', c);
    assert.ok(r.saida, c);
  }
  assert.match(av('gh api -X PUT repos/{owner}/{repo}/pulls/8/merge').motivo, /main/);
  // A base livre passa; ler o estado do merge (GET) e outras rotas também.
  for (const c of ['gh api -X PUT repos/{owner}/{repo}/pulls/7/merge', 'gh api repos/{owner}/{repo}/pulls/8/merge', 'gh api repos/{owner}/{repo}/pulls/8/merge -X GET',
    'gh api repos/{owner}/{repo}/pulls/8', 'gh api -X PATCH repos/{owner}/{repo}/pulls/8 -f title=x', 'gh api repos/{owner}/{repo}/pulls/8/merge --jq .merged'])
    assert.ok(av(c).permite, c);
});

// ---- pendência 12: caminhos que chegam pelo xargs
test('T2: xargs git add/commit no checkout principal tem caminhos que não dá para ler (pendência 12)', () => {
  for (const c of ['git ls-files -m | xargs git add', 'xargs -0 git add < lista.txt', `find . -name '*.js' -print0 | xargs -0 git add --`,
    'xargs -I{} git add {}', 'xargs git commit -m x', 'xargs git stage', 'xargs -r -n 10 git add', 'cat lista | xargs git -C /r add']) {
    const r = av(c);
    assert.equal(r.trava, 'T2', c);
    assert.match(r.motivo, /xargs/, c);
    assert.ok(r.saida, c);
  }
  assert.match(av('xargs git add -A').motivo, /git add com tudo/);
  for (const c of ['xargs git status', 'git ls-files -m | xargs git diff --', 'xargs grep x', 'xargs echo git add'])
    assert.ok(av(c).permite, c);
  assert.ok(av('git ls-files -m | xargs git add', '/w').permite, 'no worktree da frente');
});
