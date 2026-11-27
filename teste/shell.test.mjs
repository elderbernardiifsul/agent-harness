import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { comandosSimples, deuCerto, ErroDeShell } from '../nucleo/lib/shell.mjs';

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
test('env só leva o prefixo e o invólucro (R10)', () => {
  assert.deepEqual(so('AH_GUARD=off; git push'), ['git push']);
  assert.equal(comandosSimples('AH_GUARD=off; git push', '/r')[0].env.AH_GUARD, undefined);
  assert.equal(comandosSimples('export AH_GUARD=off; git push', '/r').at(-1).env.AH_GUARD, undefined);
  assert.equal(comandosSimples('export AH_GUARD=off && git push', '/r').at(-1).env.AH_GUARD, undefined);
  assert.equal(comandosSimples('AH_GUARD=off eval true; git push', '/r').at(-1).env.AH_GUARD, undefined);
  assert.equal(comandosSimples(`AH_GUARD=off eval 'git push'`, '/r')[0].env.AH_GUARD, 'off');
  assert.deepEqual(comandosSimples('env A=1 git push', '/r')[0].env, { A: '1' });
});
test('env do lado de fora chega ao bash -c', () => {
  const [c] = comandosSimples(`AH_GUARD=off bash -c 'git push'`, '/r');
  assert.equal(c.env.AH_GUARD, 'off');
  assert.deepEqual(c.argv, ['git', 'push']);
});

// Rodada de consertos 1.
test('escapes de printf e echo entregues a um shell', () => {
  const ultimo = t => comandosSimples(t, '/r').filter(c => c.argv[0] === 'git').map(c => c.argv);
  const alvo = [['git', 'push', 'origin', 'main']];
  assert.deepEqual(ultimo(`printf 'git push origin main\\n' | sh`), alvo);
  assert.deepEqual(ultimo(`printf 'git push origin main\\n' | bash`), alvo);
  // echo sem -e: a leitura crua (bash) e a decodificada (dash) aparecem as duas.
  assert.ok(ultimo(`echo 'git push origin main\\n' | sh`).some(x => x.join(' ') === 'git push origin main'));
  assert.deepEqual(ultimo(`echo -e 'git\\x20push origin main' | sh`), alvo);
  assert.deepEqual(ultimo(`printf '%s %s\\n' 'git push' 'origin main' | sh`), alvo);
  assert.deepEqual(ultimo(`printf '%b' 'git\\tpush\\040origin main' | sh`), alvo);
  assert.deepEqual(ultimo(`printf 'git\\0160ush origin main' | sh`).length, 0);
  assert.deepEqual(ultimo(`printf 'git \\160ush origin main' | sh`), alvo);
  assert.deepEqual(ultimo(`echo -e 'git \\0160ush origin main' | sh`), alvo);
  assert.throws(() => so(`printf '%s' "$X" | sh`), erro);
  assert.throws(() => so(`printf "$F" | sh`), erro);
  assert.deepEqual(so(`printf '%s' "$X"`), ['printf %s $X']);
});
test('cd X || cmd: o lado direito roda no cwd de antes (R11)', () => {
  const cs = comandosSimples('cd /w || git add -A', '/r');
  assert.equal(cs[1].cwd, '/r');
  assert.equal(comandosSimples('cd a && x || y', '/r').at(-1).cwd, null);
  assert.equal(comandosSimples('cd /w || git add -A; git log', '/r').at(-1).cwd, path.resolve('/w'));
  assert.equal(comandosSimples('cd sub || exit 1; git log', '/r').at(-1).cwd, path.resolve('/r', 'sub'));
  assert.equal(comandosSimples('cd a && git x', '/r').at(-1).cwd, path.resolve('/r', 'a'));
});
// O orçamento vigia crescimento exponencial (uma cadeia de eval que levaria minutos). O limite de 10 s é
// folgado de propósito: medido no relógio, o teste falhava com 2 s quando várias suítes rodavam juntas na
// mesma máquina (carga média 28), sem defeito nenhum no código.
test('cadeia de eval tem orçamento global', () => {
  for (const t of ['eval '.repeat(95) + 'a '.repeat(50000), 'eval '.repeat(95) + 'a '.repeat(250000), 'eval '.repeat(300) + 'a '.repeat(1000)]) {
    const inicio = Date.now();
    try { comandosSimples(t, '/r'); } catch (e) { assert.ok(erro(e), String(e)); }
    assert.ok(Date.now() - inicio < 10000, `lento: ${Date.now() - inicio} ms para ${t.length} caracteres`);
  }
});
test('env - é o -i do POSIX', () => assert.deepEqual(comandosSimples('env - git push origin main', '/r')[0].argv, ['git', 'push', 'origin', 'main']));
test('chave com alternativa vazia some', () => {
  assert.deepEqual(comandosSimples('{,git} push origin main', '/r')[0].argv, ['git', 'push', 'origin', 'main']);
  assert.deepEqual(comandosSimples('{git,} push origin main', '/r')[0].argv, ['git', 'push', 'origin', 'main']);
  assert.deepEqual(comandosSimples('""git push', '/r')[0].argv, ['git', 'push']);
  assert.deepEqual(comandosSimples('echo "" x', '/r')[0].argv, ['echo', '', 'x']);
});
test('invólucro e git -C pelo nome-base, argv[0] fiel', () => {
  assert.deepEqual(comandosSimples('/usr/bin/env git push', '/r')[0].argv, ['git', 'push']);
  const [a] = comandosSimples('/usr/bin/git -C x push', '/r');
  assert.deepEqual(a.argv, ['/usr/bin/git', 'push']); assert.equal(a.cwd, path.resolve('/r', 'x'));
  const [b] = comandosSimples('~/bin/git -C x push', '/r');
  assert.deepEqual(b.argv, ['~/bin/git', 'push']); assert.equal(b.cwd, path.resolve('/r', 'x'));
});

// Rodada de consertos 2.
test('printf que multiplica o formato estoura o orçamento, não a memória', () => {
  const casos = [
    "printf '" + 'x'.repeat(20000) + "%s' " + 'a '.repeat(20000) + '| sh',
    'echo ' + '{a,b}'.repeat(20) + ' | sh',
    ('echo ' + 'x'.repeat(1000) + ' | sh; ').repeat(90),
    "echo $'" + '\\x41'.repeat(20000) + "' | sh",
  ];
  for (const t of casos) {
    const inicio = Date.now();
    try { comandosSimples(t, '/r'); } catch (e) { assert.ok(erro(e), String(e)); }
    assert.ok(Date.now() - inicio < 2000, `lento: ${t.slice(0, 20)}`);
  }
  assert.throws(() => comandosSimples(casos[0], '/r'), erro);
  assert.throws(() => comandosSimples(casos[1], '/r'), erro);
});
test('printf para shell: só %s simples, %b, %q e %%', () => {
  for (const t of [
    `printf '%.3s push origin main' gitzzz | sh`,
    `printf '%c%c%c push origin main' gx ix tx | sh`,
    `printf 'git push origin m%xin' 10 | sh`,
    `printf 'git push %d' '' | sh`,
    `printf '%*s push' 3 git | sh`,
  ]) assert.throws(() => comandosSimples(t, '/r'), erro, t);
  const git = t => comandosSimples(t, '/r').filter(c => c.argv[0] === 'git').map(c => c.argv.join(' '));
  assert.deepEqual(git(`printf '%s push origin main%%' git | sh`), ['git push origin main%']);
  assert.deepEqual(git(`printf '%q push origin main' git | sh`), ['git push origin main']);
  assert.deepEqual(so(`printf '%.3s %c %d' a b 1`), ['printf %.3s %c %d a b 1']);
});
test('cd em lista com || e &&: só o operando logo depois do || herda o cwd de antes', () => {
  const cwds = t => comandosSimples(t, '/r').map(c => c.cwd);
  assert.deepEqual(cwds('cd /w || echo falhou && git add -A'), ['/r', '/r', null]);
  assert.deepEqual(cwds('x || cd /w && y'), ['/r', '/r', null]);
  assert.deepEqual(cwds('! cd /w || cmd'), ['/r', null]);
  assert.deepEqual(cwds('cd /w || git add -A'), ['/r', '/r']);
  assert.deepEqual(cwds('cd /w && cmd'), ['/r', path.resolve('/w')]);
  assert.deepEqual(cwds('cd /w; cmd'), ['/r', path.resolve('/w')]);
  assert.deepEqual(cwds('cd sub && npm test || echo falhou'), ['/r', path.resolve('/r', 'sub'), null]);
});
test('echo com -e e -E: as duas leituras', () => {
  const git = t => comandosSimples(t, '/r').filter(c => c.argv[0] === 'git').map(c => c.argv.join(' '));
  for (const t of [`echo -eE 'git push origin main\\n' | sh`, `echo -e -E 'git push origin main\\n' | sh`, `echo -E -e 'git push origin main\\n' | sh`]) {
    assert.ok(git(t).includes('git push origin main'), t);
  }
  assert.deepEqual(git(`echo -eE 'git push origin main\\n' | sh`).length, 2);
});
test('caminho do Windows entre aspas preserva as barras', () => {
  assert.deepEqual(comandosSimples(`"C:\\Git\\git.exe" push origin main`, '/r')[0].argv, ['C:\\Git\\git.exe', 'push', 'origin', 'main']);
  assert.deepEqual(comandosSimples(`'C:\\Git\\git.exe' push origin main`, '/r')[0].argv, ['C:\\Git\\git.exe', 'push', 'origin', 'main']);
  const [c] = comandosSimples(`"C:\\Git\\git.exe" -C x push`, '/r');
  assert.deepEqual(c.argv, ['C:\\Git\\git.exe', 'push']);
  assert.equal(c.cwd, path.resolve('/r', 'x'));
});

// Rodada de consertos 3.
test('printf para shell: largura e flags lançam ErroDeShell', () => {
  for (const t of [
    `printf 'git%1spush origin main' '' | sh`,
    `printf 'git%-1spush origin main' '' | sh`,
    `printf '%05s push origin main' git | sh`,
    `printf 'git%1bpush origin main' '' | sh`,
    `printf '%-5s push origin main' git | sh`,
  ]) assert.throws(() => comandosSimples(t, '/r'), erro, t);
});
test('printf para shell: %q só com argumento que não muda ao citar', () => {
  assert.throws(() => comandosSimples(`printf 'x%q; git push origin main\\n' ' #' | sh`, '/r'), erro);
  assert.throws(() => comandosSimples(`printf 'x%q; git push\\n' '' | sh`, '/r'), erro);
  const git = t => comandosSimples(t, '/r').filter(c => c.argv[0] === 'git').map(c => c.argv.join(' '));
  assert.deepEqual(git(`printf '%q push origin main' git | sh`), ['git push origin main']);
  assert.deepEqual(git(`printf 'git push %q' origin/main_1.x=a:bc+d@e%f-g | sh`), ['git push origin/main_1.x=a:bc+d@e%f-g']);
  // O bash cita a vírgula (`a\,b`): não dá para montar.
  assert.throws(() => comandosSimples(`printf 'git push %q' a,b | sh`, '/r'), erro);
});
test('printf para shell: %b monta # , nova linha e \\c como o bash', () => {
  const git = t => comandosSimples(t, '/r').filter(c => c.argv[0] === 'git').map(c => c.argv.join(' '));
  assert.deepEqual(git(`printf '%b' 'x #y\\ngit push origin main' | sh`), ['git push origin main']);
  assert.deepEqual(git(`printf '%bgit push origin main' 'echo a\\c' | sh`), []);
  assert.deepEqual(git(`printf '%b%s\\n' 'git push ' 'origin main' | sh`), ['git push origin main']);
});
test('printf fora de shell não muda; os comuns seguem lidos', () => {
  assert.deepEqual(so(`printf '%-10s|\\n' a`), ['printf %-10s|\\n a']);
  assert.deepEqual(so(`printf '%5s' x > arq`), ['printf %5s x']);
  assert.deepEqual(so(`printf '%s\\n' a b c | sh`), ['printf %s\\n a b c', 'sh', 'a', 'b', 'c']);
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
  assert.deepEqual(so('{ git a; git b; } > log'), ['git a', 'git b', '']); // o último é o comando só de redirecionamento (escritas)
  assert.deepEqual(comandosSimples('while x; do y; done > out', '/r').at(-1).escritas, ['out']);
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

// ---- fatia 2: escritas (destinos de redirecionamento, para a T4)
test('escritas traz os destinos de redirecionamento', () => {
  assert.deepEqual(comandosSimples('echo a > x.txt 2>&1 >> y.txt', '/r')[0].escritas, ['x.txt', 'y.txt']);
  const [s] = comandosSimples('> z.txt', '/r'); assert.deepEqual([s.argv, s.escritas], [[], ['z.txt']]);
  assert.equal(comandosSimples('cat < a.txt', '/r')[0].escritas, undefined);
});
test('escritas: todos os operadores que escrevem; >& com número ou - não é arquivo', () => {
  assert.deepEqual(comandosSimples('a >| b 3<> c &> d &>> e 2>&f >&2 >&- 1>&3-', '/r')[0].escritas, ['b', 'c', 'd', 'e', 'f']);
  assert.equal(comandosSimples('a <<< x <&3 <<EOF\nx\nEOF', '/r')[0].escritas, undefined);
});
test('escritas de comando composto, de eval e de bash -c saem num comando só de redirecionamento, no cwd de fora', () => {
  const c = comandosSimples('cd /a && ( cd /b; x ) > f1; { y; } > f2', '/r');
  assert.deepEqual(c.filter(s => s.escritas).map(s => [s.argv, s.cwd, s.escritas]), [[[], '/a', ['f1']], [[], '/a', ['f2']]]);
  for (const t of ["eval 'x' > f", "bash -c 'cd /b; x' > f", "su -c 'x' > f"]) {
    const e = comandosSimples(t, '/r').filter(s => s.escritas);
    assert.deepEqual(e.map(s => [s.argv, s.cwd, s.escritas]), [[[], '/r', ['f']]], t);
  }
});
test('escritas com git -C ou env -C: o redirecionamento vale no cwd do shell', () => {
  for (const t of ['git -C /b status > f', 'env -C /b x > f']) {
    const c = comandosSimples(t, '/r');
    assert.equal(c.find(s => s.argv.length).escritas, undefined, t);
    assert.deepEqual(c.filter(s => s.escritas).map(s => [s.argv, s.cwd, s.escritas]), [[[], '/r', ['f']]], t);
  }
});

// ---- pendência 7: o que certamente deu certo antes de cada comando
test('aposSucesso: só && encadeia; ;, ||, &, ! e corpo de função não', () => {
  // Índices dos comandos anteriores que certamente deram certo para o último rodar.
  const antes = t => { const cs = comandosSimples(t, '/r'); const u = cs.at(-1); return cs.slice(0, -1).map((_, i) => i).filter(i => deuCerto(u, i)); };
  assert.deepEqual(antes('a && b && c'), [0, 1]);
  assert.deepEqual(antes('a; b && c'), [1]);
  assert.deepEqual(antes('a || b && c'), []);
  assert.deepEqual(antes('a & b && c'), [1]);
  assert.deepEqual(antes('! a && c'), []);
  assert.deepEqual(antes('a | b && c'), [1]);
  assert.deepEqual(antes('(a; b) && c'), [1]);
  assert.deepEqual(antes(`bash -c 'a && b' && c`), [0, 1]);
  assert.deepEqual(antes(`bash -c 'exit 0; a' && c`), []);
  assert.deepEqual(antes('a && f() { b; }'), []);
  assert.deepEqual(antes('a && { b; c; }'), [0]);
  assert.deepEqual(antes('xargs a && c'), []);
});

// ---- pendência 8: $ e crase literais
test('literais: $ e crase entre aspas simples ou escapados; o que expande fica de fora', () => {
  const lit = t => comandosSimples(t, '/r')[0].literais;
  assert.deepEqual(lit(`git add 'a$b' "c\\$d" e\\$f $'g$h'`), ['a$b', 'c$d', 'e$f', 'g$h']);
  assert.equal(lit(`git add "$X" $Y \`z\``), undefined);
  assert.deepEqual(lit(`git add 'a$b' a$b 'c$d'`), ['c$d']);
  assert.deepEqual(lit(`git -C /w add 'a$b'`), ['a$b']);
});
test('literais: texto relido que veio de palavra com expansão não tem literais (terceira revisão)', () => {
  const lit = t => comandosSimples(t, '/r').filter(c => c.argv[0] === 'git').map(c => c.literais);
  for (const t of [`bash -c "git add '$X'"`, `eval "git add '$X'"`, `su -c "git add '$X'"`, `trap "git add '$X'" EXIT`, `echo "git add '$X'" | sh`,
    `sh <<EOF\ngit add '$X'\nEOF`, `sh <<< "git add '$X'"`, `env -S "git add '$X'"`, `bash -c "bash -c \\"git add '\\$X'\\""`])
    assert.deepEqual(lit(t), [undefined], t);
  // O que vem depois, fora do texto relido, volta a ter literais.
  assert.deepEqual(lit(`bash -c "git add '$X'"; git add 'a$b'`), [undefined, ['a$b']]);
  for (const t of [`sh -c "git add 'a\\$b'"`, `sh <<'EOF'\ngit add 'a$b'\nEOF`, `env -S "git add 'a\\$b'"`])
    assert.deepEqual(lit(t), [['a$b']], t);
});

// ---- pendência 10: cd que pode falhar no meio de uma lista && seguida de ;
test('cd x && a; b: a só roda em x; b roda em x ou na pasta de antes', () => {
  const cs = comandosSimples('cd /w && a; b', '/r');
  assert.deepEqual(cs.map(c => [c.argv[0], c.cwd, c.cwdsAlternativos]), [['cd', '/r', undefined], ['a', '/w', undefined], ['b', '/w', ['/r']]]);
  const [, , , d] = comandosSimples('cd /w && a && b; d', '/r');
  assert.deepEqual([d.cwd, d.cwdsAlternativos], ['/w', ['/r']]);
  const [, , e] = comandosSimples('cd /w || exit 1; e', '/r');
  assert.deepEqual([e.cwd, e.cwdsAlternativos], ['/w', undefined]);
  // Com o cwd de entrada já incerto, o cd relativo deixa o de depois desconhecido.
  assert.equal(comandosSimples('cd /w && x || y && cd sub; z', '/r').at(-1).cwd, null);
});
test('cd absoluto que deu certo faz as pastas alternativas convergirem; git -C leva as alternativas junto (terceira revisão)', () => {
  const alt = (t, nome) => { const c = comandosSimples(t, '/r').findLast(x => x.argv[0] === nome); return [c.cwd, c.cwdsAlternativos]; };
  assert.deepEqual(alt('cd /w && a; cd /w && b; c', 'b'), ['/w', undefined]);
  assert.deepEqual(alt('cd /w && a; cd /w && b; c', 'c'), ['/w', ['/r']]);
  assert.deepEqual(alt('cd /w && a; cd /w || exit; c', 'c'), ['/w', undefined]);
  assert.deepEqual(alt('cd /w && a; cd /x && b', 'b'), ['/x', undefined]);
  assert.deepEqual(alt('cd /w && a; cd sub && b', 'b'), ['/w/sub', ['/r/sub']]);
  assert.deepEqual(alt('cd /w; git -C /w x', 'git'), ['/w', undefined]);
  assert.deepEqual(alt('cd /w; git -C sub x', 'git'), ['/w/sub', ['/r/sub']]);
  assert.deepEqual(alt('cd /w; env -C /x y', 'y'), ['/x', undefined]);
});
