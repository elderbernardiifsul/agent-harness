import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { comandosSimples, ErroDeShell } from '../nucleo/lib/shell.mjs';

const so = (t, cwd = '/r') => comandosSimples(t, cwd).map(c => c.argv.join(' '));
const erro = e => e instanceof ErroDeShell && e.name === 'ErroDeShell';

// Casos do resumo.
test('encadeamento', () => assert.deepEqual(so('a 1 && b 2; c | d'), ['a 1', 'b 2', 'c', 'd']));
test('cd muda o cwd dos seguintes', () => {
  const [, g] = comandosSimples('cd sub && git status', '/r');
  assert.equal(g.cwd, path.resolve('/r', 'sub'));
});
test('cd dentro de subshell não vaza', () => {
  const cs = comandosSimples('(cd sub && git a); git b', '/r');
  assert.equal(cs.at(-1).cwd, '/r');
});
test('bash -c e eval são lidos por dentro', () => {
  assert.deepEqual(so(`bash -c 'git push origin main'`), ['git push origin main']);
  assert.deepEqual(so(`eval "git add -A"`), ['git add -A']);
});
test('substituição de comando e crases', () => assert.ok(so('echo $(git push) `git add .`').includes('git push')));
test('env e envoltórios', () => {
  const [c] = comandosSimples('AH_GUARD=off git push origin main', '/r');
  assert.equal(c.env.AH_GUARD, 'off'); assert.deepEqual(c.argv, ['git', 'push', 'origin', 'main']);
  assert.deepEqual(so('env X=1 git push'), ['git push']);
  assert.deepEqual(so('sudo command git push'), ['git push']);
});
test('git -C troca o cwd', () => {
  const [c] = comandosSimples('git -C ../outro push', '/r/a');
  assert.equal(c.cwd, path.resolve('/r/a', '../outro')); assert.deepEqual(c.argv, ['git', 'push']);
});
test('aspas preservam o argumento', () => assert.deepEqual(comandosSimples(`git commit -m "a && b; c"`, '/r')[0].argv, ['git', 'commit', '-m', 'a && b; c']));
test('heredoc comum é ignorado; heredoc para bash é lido', () => {
  assert.deepEqual(so('cat <<EOF\ngit push\nEOF'), ['cat']);
  assert.ok(so('bash <<EOF\ngit push\nEOF').includes('git push'));
});
test('aspas sem fechar lançam ErroDeShell', () => assert.throws(() => comandosSimples(`echo "a`, '/r'), e => e.name === 'ErroDeShell'));

// Separadores e palavras.
test('todos os separadores', () => {
  assert.deepEqual(so('a || b & c\nd |& e'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(so('a;b&&c||d|e'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(so('a &\n\nb'), ['a', 'b']);
  assert.deepEqual(so('a &&\n b ||\n c |\n d'), ['a', 'b', 'c', 'd']);
});
test('aspas simples, duplas e barra invertida', () => {
  const argv = t => comandosSimples(t, '/r')[0].argv;
  assert.deepEqual(argv(`echo 'a "b" $c' "d 'e' \\"f\\""`), ['echo', 'a "b" $c', `d 'e' "f"`]);
  assert.deepEqual(argv('echo a\\ b \\; c'), ['echo', 'a b', ';', 'c']);
  assert.deepEqual(argv('git\\\n push'), ['git', 'push']);
  assert.deepEqual(argv(`g'i't "pu"sh`), ['git', 'push']);
  assert.deepEqual(argv(`echo $'a\\tb\\'c\\x41'`), ['echo', "a\tb'cA"]);
  assert.deepEqual(argv(`echo "a\\b" '\\n'`), ['echo', 'a\\b', '\\n']);
});
test('variáveis ficam como texto', () => {
  assert.deepEqual(comandosSimples('echo $HOME "${X:-y}" $1 $@', '/r')[0].argv, ['echo', '$HOME', '${X:-y}', '$1', '$@']);
});
test('comentários', () => {
  assert.deepEqual(so('git status # ; git push\ngit log'), ['git status', 'git log']);
  assert.deepEqual(so('echo a#b'), ['echo a#b']);
  assert.deepEqual(so('# só comentário'), []);
});
test('redirecionamentos saem do argv', () => {
  assert.deepEqual(so('git push > saida.txt 2>&1 < /dev/null'), ['git push']);
  assert.deepEqual(so('git push &> log; git log >> a 2>/dev/null >| b <> c'), ['git push', 'git log']);
  assert.deepEqual(so('>arq git push'), ['git push']);
  assert.throws(() => so('git push >'), erro);
});
test('processo e redirecionamento com substituição são lidos', () => {
  assert.ok(so('diff <(git push) b').includes('git push'));
  assert.ok(so('tee >(git push) < a').includes('git push'));
  assert.ok(so('cat < $(git push)').includes('git push'));
  assert.ok(so('while read l; do echo $l; done < <(git push)').includes('git push'));
});

// Substituições.
test('substituição aninhada, dentro de aspas e em atribuição', () => {
  assert.ok(so('echo "$(echo $(git push))"').includes('git push'));
  assert.ok(so('X=$(git push) echo').includes('git push'));
  assert.ok(so('X=`git push`').includes('git push'));
  assert.ok(so('echo "`git push`"').includes('git push'));
  assert.ok(so('echo ${X:-$(git push)}').includes('git push'));
  assert.ok(so('echo $(( $(git push) + 1 ))').includes('git push'));
  assert.ok(so('A=(a $(git push) b)').includes('git push'));
  assert.deepEqual(so('echo $((1 << 2))\ngit push'), ['echo $((1 << 2))', 'git push']);
});
test('substituição com parênteses e aspas por dentro', () => {
  assert.ok(so('echo $( (git push) )').includes('git push'));
  assert.ok(so('echo $(echo ")"; git push)').includes('git push'));
  assert.throws(() => so('echo $(git push'), erro);
  assert.throws(() => so('echo `git push'), erro);
});
test('cd dentro de $( … ) não vaza', () => {
  const cs = comandosSimples('echo $(cd sub; pwd); git b', '/r');
  assert.equal(cs.find(c => c.argv[0] === 'pwd').cwd, path.resolve('/r', 'sub'));
  assert.equal(cs.at(-1).cwd, '/r');
});

// cd.
test('cd encadeado e relativo', () => {
  const cs = comandosSimples('cd a; cd ../b && git x\ngit y', '/r');
  assert.equal(cs[2].cwd, path.resolve('/r', 'b'));
  assert.equal(cs[3].cwd, path.resolve('/r', 'b'));
  assert.equal(comandosSimples('cd /abs; git x', '/r')[1].cwd, path.resolve('/abs'));
  assert.equal(comandosSimples('cd -P -- sub; git x', '/r')[1].cwd, path.resolve('/r', 'sub'));
});
test('cd desconhecido deixa o cwd null', () => {
  for (const t of ['cd; git x', 'cd $D; git x', 'cd "$D"; git x', 'cd ~/a; git x', 'cd -; git x', 'cd a b; git x', 'cd {a,b}; git x', 'popd; git x']) {
    assert.equal(comandosSimples(t, '/r').at(-1).cwd, null, t);
  }
  const cs = comandosSimples('cd $D; cd sub; git x; cd /abs; git y', '/r');
  assert.equal(cs[2].cwd, null);
  assert.equal(cs[4].cwd, path.resolve('/abs'));
});
test('cd condicional deixa o cwd desconhecido depois da lista', () => {
  const cs = comandosSimples('git fetch && cd sub && git push; git log', '/r');
  assert.equal(cs[2].cwd, path.resolve('/r', 'sub'));
  assert.equal(cs[3].cwd, null);
  assert.equal(comandosSimples('cd sub || exit 1; git log', '/r').at(-1).cwd, path.resolve('/r', 'sub'));
});
test('cd em pipeline, em segundo plano ou em função não vaza', () => {
  assert.equal(comandosSimples('cd sub | cat; git x', '/r').at(-1).cwd, '/r');
  assert.equal(comandosSimples('cd sub & git x', '/r').at(-1).cwd, '/r');
  assert.equal(comandosSimples('f() { cd sub; }; git x', '/r').at(-1).cwd, '/r');
});
test('cd em chaves e em if vaza, como no shell', () => {
  assert.equal(comandosSimples('{ cd sub; }; git x', '/r').at(-1).cwd, path.resolve('/r', 'sub'));
  assert.equal(comandosSimples('if true; then cd sub; fi; git x', '/r').at(-1).cwd, path.resolve('/r', 'sub'));
  assert.equal(comandosSimples('pushd sub; git x', '/r').at(-1).cwd, path.resolve('/r', 'sub'));
});
test('cwd inicial null', () => {
  assert.equal(comandosSimples('git x', null)[0].cwd, null);
  assert.equal(comandosSimples('cd sub; git x', null)[1].cwd, null);
  assert.equal(comandosSimples('git -C /abs x', null)[0].cwd, path.resolve('/abs'));
});

// Ambiente.
test('várias atribuições e a forma +=', () => {
  const [c] = comandosSimples('A=1 B="x y" C+=z git push', '/r');
  assert.deepEqual(c.env, { A: '1', B: 'x y', C: 'z' });
  assert.deepEqual(c.argv, ['git', 'push']);
});
test('atribuição com aspas no nome não é atribuição', () => {
  assert.deepEqual(so(`"A=1" git push`), ['A=1 git push']);
});
test('atribuição solta e export valem para os comandos seguintes', () => {
  const cs = comandosSimples('AH_GUARD=off; git push', '/r');
  assert.deepEqual(so('AH_GUARD=off; git push'), ['git push']);
  assert.equal(cs[0].env.AH_GUARD, 'off');
  assert.equal(comandosSimples('export AH_GUARD=off && git push', '/r')[1].env.AH_GUARD, 'off');
  assert.equal(comandosSimples('export A=1; unset A; git push', '/r').at(-1).env.A, undefined);
  assert.equal(comandosSimples('(export A=1); git push', '/r').at(-1).env.A, undefined);
});
test('env do lado de fora chega ao bash -c', () => {
  const [c] = comandosSimples(`AH_GUARD=off bash -c 'git push'`, '/r');
  assert.equal(c.env.AH_GUARD, 'off');
  assert.deepEqual(c.argv, ['git', 'push']);
});

// Envoltórios.
test('envoltórios com opções', () => {
  assert.deepEqual(so('env -i -u HOME -- A=1 git push'), ['git push']);
  assert.deepEqual(so('sudo -u ana-souza -E git push'), ['git push']);
  assert.deepEqual(so('sudo -Eu ana-souza A=1 git push'), ['git push']);
  assert.deepEqual(so('nohup git push &'), ['git push']);
  assert.deepEqual(so('time -p git push'), ['git push']);
  assert.deepEqual(so('/usr/bin/time -f %e git push'), ['git push']);
  assert.deepEqual(so('exec -a nome git push'), ['git push']);
  assert.deepEqual(so('command -p git push'), ['git push']);
  assert.deepEqual(so('xargs -0 -n 1 -I {} git push {}'), ['git push {}']);
  assert.deepEqual(so('git ls-files | xargs -r git add'), ['git ls-files', 'git add']);
  assert.deepEqual(so('/usr/bin/sudo env A=1 nohup command git push'), ['git push']);
  assert.deepEqual(so('nice -n 5 timeout -s KILL 10 git push'), ['git push']);
  assert.deepEqual(so('! git push'), ['git push']);
});
test('envoltório leva env e cwd', () => {
  const [c] = comandosSimples('sudo A=1 env B=2 git push', '/r');
  assert.deepEqual(c.env, { A: '1', B: '2' });
  assert.equal(comandosSimples('env -C sub git push', '/r')[0].cwd, path.resolve('/r', 'sub'));
  assert.equal(comandosSimples('sudo -D /abs git push', '/r')[0].cwd, path.resolve('/abs'));
  assert.deepEqual(so(`env -S 'git push origin'`), ['git push origin']);
});
test('envoltório sem comando fica como está', () => {
  assert.deepEqual(so('sudo -v'), ['sudo -v']);
  assert.deepEqual(so('env'), ['env']);
});

// Shell dentro de shell.
test('sh -c, zsh -c e opções antes do -c', () => {
  assert.deepEqual(so(`sh -c "git push; git log"`), ['git push', 'git log']);
  assert.deepEqual(so(`/bin/zsh -euc 'git push'`), ['git push']);
  assert.deepEqual(so(`bash -o pipefail -c 'git push' arg0 a`), ['git push']);
  assert.deepEqual(so(`bash -lc "bash -c 'sudo git push'"`), ['git push']);
  assert.deepEqual(so(`sudo -u ana-souza sh -c 'cd /tmp/loja && git push'`), ['cd /tmp/loja', 'git push']);
  assert.deepEqual(so(`xargs sh -c 'git push'`), ['git push']);
  assert.deepEqual(so(`su ana-souza -c 'git push'`), ['git push']);
  assert.deepEqual(so(`su -`), ['su -']);
});
test('bash -c roda em processo filho: cd não vaza; eval vaza', () => {
  assert.equal(comandosSimples(`bash -c 'cd sub'; git x`, '/r').at(-1).cwd, '/r');
  assert.equal(comandosSimples(`eval 'cd sub'; git x`, '/r').at(-1).cwd, path.resolve('/r', 'sub'));
  assert.deepEqual(so('eval git push origin'), ['git push origin']);
});
test('heredoc: delimitador entre aspas, <<-, vários e o resto da linha', () => {
  assert.deepEqual(so("cat <<'EOF'\ngit push\nEOF\ngit log"), ['cat', 'git log']);
  assert.deepEqual(so('cat <<-FIM\n\tgit push\n\tFIM\ngit log'), ['cat', 'git log']);
  assert.deepEqual(so('cat <<A <<B; git x\n1\nA\n2\nB\ngit y'), ['cat', 'git x', 'git y']);
  assert.ok(so('sh <<-FIM\n\tgit push\n\tFIM').includes('git push'));
  assert.ok(so('sudo bash -s <<"FIM"\ngit push\nFIM').includes('git push'));
  assert.ok(so(`bash <<< 'git push'`).includes('git push'));
  assert.throws(() => so('cat <<EOF\ngit push'), erro);
  assert.throws(() => so('cat <<'), erro);
});
test('heredoc sem aspas no delimitador expande $( … ) do corpo', () => {
  assert.ok(so('cat <<EOF\n$(git push)\nEOF').includes('git push'));
  assert.ok(!so(`cat <<'EOF'\n$(git push)\nEOF`).includes('git push'));
});

test('texto que um pipeline entrega a um shell é lido', () => {
  assert.ok(so("cat <<'EOF' | sh\ngit push\nEOF").includes('git push'));
  assert.ok(so(`echo 'git push' | bash`).includes('git push'));
  assert.ok(so(`printf '%s' "git push" | sudo sh -s`).includes('git push'));
  assert.ok(!so(`echo 'git push' | cat`).includes('git push'));
});

// Construções compostas.
test('chaves, if, while, for e case', () => {
  assert.deepEqual(so('{ git a; git b; } > log'), ['git a', 'git b']);
  assert.deepEqual(so('if git a; then git b; elif git c; then :; else git d; fi'), ['git a', 'git b', 'git c', ':', 'git d']);
  assert.deepEqual(so('while git a; do git b; done'), ['git a', 'git b']);
  assert.deepEqual(so('for x in a $(git a) b; do git b; done'), ['git a', 'git b']);
  assert.deepEqual(so('for ((i=0; i<3; i++)); do git b; done'), ['git b']);
  assert.deepEqual(so('case $x in a|b) git a;; (c) git b;& *) git c;;& esac'), ['git a', 'git b', 'git c']);
  assert.deepEqual(so('[[ -n $(git a) && x < y ]] && git b'), ['git a', '[[ -n $(git a) && x < y ]]', 'git b']);
  assert.deepEqual(so('(( x > 1 )) && git b'), ['git b']);
});
test('função: corpo aparece na lista', () => {
  assert.deepEqual(so('f() { git push; }; f'), ['git push', 'f']);
  assert.deepEqual(so('function g { git push; }'), ['git push']);
});
test('expansão de chaves no nome e nos argumentos', () => {
  assert.deepEqual(so('{git,push}'), ['git push']);
  assert.deepEqual(so('git {push,status}'), ['git push status']);
  assert.deepEqual(so('echo a{1..3}b {x,y{z,w}}'), ['echo a1b a2b a3b x yz yw']);
  assert.deepEqual(so(`echo "{a,b}" {} {a} \\{a,b}`), ['echo {a,b} {} {a} {a,b}']);
  assert.throws(() => so('echo {1..99999999}'), erro);
});
test('trap: a ação é lida como shell', () => assert.ok(so(`trap 'git push' EXIT`).includes('git push')));

// Erros.
test('texto que não dá para ler', () => {
  for (const t of [`echo 'a`, '(git a', 'git a)', 'echo $(( 1 + 2 )', 'echo ${X', '{ git a;', 'a && ', '| a', 'a ;; b', 'echo (x)', 'case x in a) b', "echo $'a"]) {
    assert.throws(() => comandosSimples(t, '/r'), erro, t);
  }
});
test('ErroDeShell é Error com mensagem', () => {
  try { comandosSimples('echo "a', '/r'); assert.fail('não lançou'); } catch (e) {
    assert.ok(e instanceof Error); assert.ok(e.message.length > 0);
  }
});

// Entrada hostil.
test('entrada grande termina rápido', () => {
  const casos = [
    'git a; '.repeat(15000),
    'x'.repeat(100000),
    '"'.repeat(99999) + '"',
    '$('.repeat(50000),
    '('.repeat(100000),
    '{'.repeat(100000),
    '{a,b}'.repeat(20000),
    'echo ' + '{1..9999}'.repeat(11000),
    'echo' + ' {a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}'.repeat(1500),
    'A=1; git x; '.repeat(8000),
    Array.from({ length: 7000 }, (_, k) => `A${k}=1;`).join('') + 'g;'.repeat(20000),
    Array.from({ length: 6000 }, (_, k) => `A${k}=1;g;`).join(''),
    '\\'.repeat(100000),
    '<<A '.repeat(25000),
    '${'.repeat(50000),
    '`'.repeat(100001),
    `echo '${'g;'.repeat(25000)}'` + ' | sh'.repeat(10000),
    'echo $((' + '('.repeat(50000),
  ];
  for (const t of casos) {
    const inicio = Date.now();
    try { comandosSimples(t, '/r'); } catch (e) { assert.ok(erro(e), `${t.slice(0, 10)}: ${e}`); }
    assert.ok(Date.now() - inicio < 2000, `lento: ${t.slice(0, 10)}`);
  }
});
test('aninhamento fundo vira ErroDeShell, não estouro de pilha', () => {
  assert.throws(() => comandosSimples('echo ' + '$('.repeat(5000) + 'x' + ')'.repeat(5000), '/r'), erro);
  assert.throws(() => comandosSimples('( '.repeat(5000) + 'x' + ' )'.repeat(5000), '/r'), erro);
  assert.throws(() => comandosSimples('eval '.repeat(300) + 'git push', '/r'), erro);
  assert.deepEqual(so('eval '.repeat(20) + 'git push'), ['git push']);
});
