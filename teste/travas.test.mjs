import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliar } from '../nucleo/lib/travas.mjs';
import { recusa, textoDaRecusa } from '../nucleo/lib/recusa.mjs';
import { aplicarPadroes } from '../nucleo/lib/config.mjs';

const ctx = {
  config: aplicarPadroes({}),
  raiz: '/r',
  topoDe: c => (c && c.startsWith('/w') ? '/w' : '/r'),
  ramoAtual: c => (c?.startsWith('/w') ? 'feat/x' : 'dev'),
  baseDoPr: n => ({ 7: 'dev', 8: 'main' })[n] ?? null,
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
