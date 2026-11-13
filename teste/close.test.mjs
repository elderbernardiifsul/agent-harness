import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { criarProjeto, envelhecerSinal } from './apoio/repo.mjs';

const HISTORICO = 'docs/agents/historico-das-frentes.md';
const ler = (p, rel) => fs.readFileSync(path.join(p.raiz, rel), 'utf8');
const arquivoDaFrente = (p, nome) => path.join(p.estado, 'loja', 'frentes', `${nome}.json`);
const lerFrenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(arquivoDaFrente(p, nome), 'utf8'));
const eventos = p => fs.readFileSync(path.join(p.estado, 'loja', 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const comentarios = p => p.ghChamadas().filter(c => c.argv[0] === 'issue' && c.argv[1] === 'comment');
const OUTRA = { env: { AH_SESSAO: 'sessao-teste-0002' } };

function comFrente(nome = 'carrinho') { // projeto com a frente aberta e um commit nela
  const p = criarProjeto();
  assert.equal(p.ah(['open', nome, '--tickets', '1']).codigo, 0);
  const wt = lerFrenteDoTeste(p, nome).worktree;
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a');
  p.git(['add', 'a.txt'], { cwd: wt });
  p.git(['commit', '-m', 'feat: a'], { cwd: wt });
  return { p, wt };
}
const mescla = (p, nome = 'carrinho') => assert.equal(p.git(['merge', '--no-ff', `feat/${nome}`, '-m', 'merge']).codigo, 0);

test('close depois do merge remove tudo e grava o histórico', () => {
  const { p, wt } = comFrente();
  mescla(p);
  const r = p.ah(['close', '--resumo', 'soma do carrinho']);
  assert.equal(r.codigo, 0, r.erro);
  assert.ok(!fs.existsSync(wt));
  assert.doesNotMatch(p.git(['branch', '--list']).saida, /feat\/carrinho/);
  assert.match(ler(p, HISTORICO), /^- \d{4}-\d{2}-\d{2} · as-1 · carrinho · @ana-souza · #1 · soma do carrinho$/m);
  assert.match(p.git(['log', '-1', '--format=%s']).saida, /docs\(frentes\): fecha as-1 carrinho/);
  assert.equal(p.git(['status', '--short']).saida.trim(), '');
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, null);
  assert.ok(!fs.existsSync(arquivoDaFrente(p, 'carrinho')));
  assert.match(r.saida, /Frente as-1 carrinho fechada\./);
  assert.match(r.saida, /Falta: git push origin dev/);
  const com = comentarios(p);
  assert.equal(com.length, 2); // abertura e fechamento
  assert.match(com[1].entrada, /^Frente as-1 \(carrinho\) fechada\.\n/);
  assert.match(com[1].entrada, /soma do carrinho/);
  p.limpar();
});

test('o fechamento entra no histórico e o próximo ID é as-2', () => {
  const { p } = comFrente('a1');
  mescla(p, 'a1');
  assert.equal(p.ah(['close']).codigo, 0);
  const r = p.ah(['open', 'b1']);
  assert.match(r.saida, /Frente as-2 b1 aberta\./, r.erro);
  p.limpar();
});

test('sem --resumo, o resumo é o título do último commit do ramo', () => {
  const { p } = comFrente();
  mescla(p);
  assert.equal(p.ah(['close']).codigo, 0);
  assert.match(ler(p, HISTORICO), /· #1 · feat: a$/m);
  p.limpar();
});

test('resumo com várias linhas: o histórico recebe só a primeira, o ticket o texto todo', () => {
  const { p } = comFrente();
  mescla(p);
  assert.equal(p.ah(['close', '--resumo', 'primeira linha\nsegunda linha\n- falso item']).codigo, 0);
  const h = ler(p, HISTORICO);
  assert.match(h, /· #1 · primeira linha$/m);
  assert.doesNotMatch(h, /segunda linha|falso item/);
  assert.match(comentarios(p).at(-1).entrada, /segunda linha/);
  p.limpar();
});

test('resumo que parece opção é texto, não opção', () => {
  const { p } = comFrente();
  mescla(p);
  assert.equal(p.ah(['close', '--resumo=--descartar-ignorados e mais']).codigo, 0);
  assert.match(ler(p, HISTORICO), /· #1 · --descartar-ignorados e mais$/m);
  p.limpar();
});

test('close recusa commits que não estão na base nem no remoto', () => {
  const { p, wt } = comFrente();
  const r = p.ah(['close']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: .*(merge|push)/);
  assert.match(r.erro, /feat: a/);
  assert.ok(fs.existsSync(wt));
  assert.ok(fs.existsSync(arquivoDaFrente(p, 'carrinho')));
  assert.equal(comentarios(p).length, 1);
  p.limpar();
});

test('close aceita ramo só empurrado para o remoto', () => {
  const { p, wt } = comFrente();
  p.git(['push', '-u', 'origin', 'feat/carrinho'], { cwd: wt });
  const r = p.ah(['close']);
  assert.equal(r.codigo, 0, r.erro);
  assert.doesNotMatch(p.git(['branch', '--list']).saida, /feat\/carrinho/);
  p.limpar();
});

test('sem remoto, só a base conta', () => {
  const p = criarProjeto({ remoto: false });
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const wt = lerFrenteDoTeste(p, 'carrinho').worktree;
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a');
  p.git(['add', 'a.txt'], { cwd: wt });
  p.git(['commit', '-m', 'feat: a'], { cwd: wt });
  assert.equal(p.ah(['close']).codigo, 1);
  mescla(p);
  const r = p.ah(['close']);
  assert.equal(r.codigo, 0, r.erro);
  assert.doesNotMatch(r.saida, /Falta:/);
  p.limpar();
});

test('close recusa worktree sujo', () => {
  const { p, wt } = comFrente();
  mescla(p);
  fs.writeFileSync(path.join(wt, 'b.txt'), 'b');
  const r = p.ah(['close']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /b\.txt/);
  assert.match(r.erro, /Faça: .*commit/);
  assert.ok(fs.existsSync(wt));
  p.limpar();
});

test('close recusa arquivo ignorado e aceita com --descartar-ignorados', () => {
  const { p, wt } = comFrente();
  fs.writeFileSync(path.join(wt, '.gitignore'), '*.log\n');
  p.git(['add', '.gitignore'], { cwd: wt });
  p.git(['commit', '-m', 'chore: ignora logs'], { cwd: wt });
  mescla(p);
  fs.writeFileSync(path.join(wt, 'x.log'), 'x');
  const r = p.ah(['close']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /x\.log/);
  assert.match(r.erro, /--descartar-ignorados/);
  assert.ok(fs.existsSync(wt));
  const r2 = p.ah(['close', '--descartar-ignorados']);
  assert.equal(r2.codigo, 0, r2.erro);
  assert.ok(!fs.existsSync(wt));
  p.limpar();
});

test('a lista de ignorados mostra até 20 e diz quantos faltam', () => {
  const { p, wt } = comFrente();
  fs.writeFileSync(path.join(wt, '.gitignore'), '*.log\n');
  p.git(['add', '.gitignore'], { cwd: wt });
  p.git(['commit', '-m', 'chore: ignora logs'], { cwd: wt });
  mescla(p);
  for (let i = 0; i < 25; i++) fs.writeFileSync(path.join(wt, `f${String(i).padStart(2, '0')}.log`), 'x');
  const r = p.ah(['close']);
  assert.equal(r.codigo, 1);
  assert.equal((r.erro.match(/f\d\d\.log/g) ?? []).length, 20);
  assert.match(r.erro, /mais 5/);
  p.limpar();
});

test('close de dentro do worktree recusa com o caminho do principal', () => {
  const { p, wt } = comFrente();
  const r = p.ah(['close'], { cwd: wt });
  assert.equal(r.codigo, 1);
  assert.ok(r.erro.includes(p.raiz) || r.erro.includes(fs.realpathSync(p.raiz)));
  assert.ok(fs.existsSync(wt));
  p.limpar();
});

test('close recusa sem frente, com o principal fora da base e com o histórico alterado', () => {
  const p = criarProjeto();
  const sem = p.ah(['close']);
  assert.equal(sem.codigo, 1);
  assert.match(sem.erro, /não tem frente/);

  const { p: q } = comFrente();
  mescla(q);
  q.git(['switch', '-c', 'outro']);
  const fora = q.ah(['close']);
  assert.equal(fora.codigo, 1);
  assert.match(fora.erro, /git switch dev/);
  q.git(['switch', 'dev']);

  fs.appendFileSync(path.join(q.raiz, HISTORICO), '\n- 2026-11-12 · outra · linha solta\n');
  const sujo = q.ah(['close']);
  assert.equal(sujo.codigo, 1);
  assert.match(sujo.erro, /historico-das-frentes\.md/);
  assert.ok(fs.existsSync(arquivoDaFrente(q, 'carrinho')));
  p.limpar();
  q.limpar();
});

test('close recusa frente de outra sessão, nome inválido e opção desconhecida', () => {
  const { p, wt } = comFrente();
  mescla(p);
  const alheia = p.ah(['close', 'carrinho'], OUTRA);
  assert.equal(alheia.codigo, 1);
  assert.match(alheia.erro, /sessao-teste-0001|sessao-t/);
  assert.ok(fs.existsSync(wt));
  assert.equal(p.ah(['close', '../x']).codigo, 1);
  assert.equal(p.ah(['close', '-x']).codigo, 1);
  const op = p.ah(['close', '--tudo']);
  assert.equal(op.codigo, 1);
  assert.match(op.erro, /Opção desconhecida/);
  assert.equal(p.ah(['close', '--resumo']).codigo, 1);
  assert.equal(p.ah(['close', 'carrinho', 'outro']).codigo, 1);
  assert.ok(fs.existsSync(wt));
  // pelo nome, sendo a dona, fecha
  assert.equal(p.ah(['close', 'carrinho']).codigo, 0);
  p.limpar();
});

test('close sem rede segue com aviso', () => {
  const { p, wt } = comFrente();
  mescla(p);
  const r = p.ah(['close'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /Aviso: não consegui comentar no ticket #1/);
  assert.ok(!fs.existsSync(wt));
  assert.ok(!fs.existsSync(arquivoDaFrente(p, 'carrinho')));
  p.limpar();
});

test('close repetido depois do worktree apagado à mão termina o serviço', () => {
  const { p, wt } = comFrente();
  mescla(p);
  assert.equal(p.git(['worktree', 'remove', wt]).codigo, 0);
  const r = p.ah(['close']);
  assert.equal(r.codigo, 0, r.erro);
  assert.doesNotMatch(p.git(['branch', '--list']).saida, /feat\/carrinho/);
  assert.match(ler(p, HISTORICO), /· as-1 · carrinho ·/);
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, null);
  p.limpar();
});

test('close repetido com worktree e ramo já removidos e histórico já alterado termina', () => {
  const { p, wt } = comFrente();
  mescla(p);
  p.git(['worktree', 'remove', wt]);
  p.git(['branch', '-d', 'feat/carrinho']);
  // simula uma falha depois de gravar a linha e antes do commit
  fs.appendFileSync(path.join(p.raiz, HISTORICO), `- 2026-11-12 · as-1 · carrinho · @ana-souza · #1 · feito\n`);
  const r = p.ah(['close']);
  assert.equal(r.codigo, 0, r.erro);
  const h = ler(p, HISTORICO);
  assert.equal((h.match(/· as-1 · carrinho ·/g) ?? []).length, 1);
  assert.equal(p.git(['status', '--short']).saida.trim(), '');
  assert.ok(!fs.existsSync(arquivoDaFrente(p, 'carrinho')));
  p.limpar();
});

test('o ciclo registra abertura e fechamento nos eventos', () => {
  const { p } = comFrente();
  mescla(p);
  p.ah(['close']);
  const ev = eventos(p);
  const tipos = ev.map(e => e.tipo);
  assert.equal(tipos[0], 'abertura');
  assert.equal(tipos.at(-1), 'fechamento');
  const f = ev.at(-1);
  assert.deepEqual([f.id, f.nome, f.frente], ['as-1', 'carrinho', 'carrinho']);
  assert.ok(f.aberta && f.fechada);
  p.limpar();
});

test('sessão com frente sem registro: close solta a sessão, avisa e o open funciona', () => {
  const { p, wt } = comFrente();
  fs.rmSync(arquivoDaFrente(p, 'carrinho'));
  const r = p.ah(['close']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /não tem registro/);
  assert.match(r.erro, new RegExp(`git worktree remove ${wt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(r.erro, /git branch -D feat\/carrinho/);
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, null);
  const ev = eventos(p).at(-1);
  assert.deepEqual([ev.tipo, ev.nome, ev.frente], ['fechamento-sem-registro', 'carrinho', 'carrinho']);
  const o = p.ah(['open', 'outro']);
  assert.equal(o.codigo, 0, o.erro);
  p.limpar();
});

function ignoradosCom(p, wt) {
  fs.writeFileSync(path.join(wt, '.gitignore'), '*.log\nnode_modules/\ncache/\n');
  p.git(['add', '.gitignore'], { cwd: wt });
  p.git(['commit', '-m', 'chore: ignora'], { cwd: wt });
  mescla(p);
}

test('pasta com 30 mil arquivos ignorados: close recusa com lista curta e não apaga nada', () => {
  const { p, wt } = comFrente();
  ignoradosCom(p, wt);
  fs.mkdirSync(path.join(wt, 'node_modules', 'pacote'), { recursive: true });
  for (let i = 0; i < 30000; i++) fs.writeFileSync(path.join(wt, 'node_modules', 'pacote', `arquivo-com-nome-bem-comprido-${i}.js`), '');
  fs.mkdirSync(path.join(wt, 'cache'));
  fs.writeFileSync(path.join(wt, 'cache', 'x'), 'x');
  const r = p.ah(['close']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /node_modules\//);
  assert.match(r.erro, /cache\//);
  assert.ok(r.erro.length < 2000);
  assert.ok(fs.existsSync(path.join(wt, 'node_modules', 'pacote', 'arquivo-com-nome-bem-comprido-29999.js')));
  p.limpar();
});

test('conferência que falha ao rodar vira recusa e nada é apagado', { skip: process.platform === 'win32' }, () => {
  const { p, wt } = comFrente();
  mescla(p);
  const real = p.git(['--exec-path']).saida.trim();
  const dirReal = fs.mkdtempSync(path.join(path.dirname(p.raiz), 'fake-'));
  const gitReal = ['/usr/bin/git', '/bin/git', '/usr/local/bin/git'].find(c => fs.existsSync(c));
  assert.ok(gitReal && real);
  for (const quebrar of ['ls-files', 'status', 'log']) {
    const script = path.join(dirReal, 'git');
    fs.writeFileSync(script, `#!/bin/sh\nfor a in "$@"; do if [ "$a" = "${quebrar}" ]; then echo "falha injetada" >&2; exit 3; fi; done\nexec ${gitReal} "$@"\n`, { mode: 0o755 });
    const r = p.ah(['close'], { env: { PATH: `${dirReal}${path.delimiter}${process.env.PATH}` } });
    assert.equal(r.codigo, 1, `${quebrar}: ${r.saida}`);
    assert.match(r.erro, /Não consegui conferir/, quebrar);
    assert.match(r.erro, /falha injetada/);
    assert.ok(fs.existsSync(wt), quebrar);
    assert.ok(fs.existsSync(arquivoDaFrente(p, 'carrinho')), quebrar);
  }
  p.limpar();
});

// ---- onda final: I1 (sessão nova fecha a frente de uma sessão encerrada)
const arquivoDaSessao = (p, id) => path.join(p.estado, 'loja', 'sessoes', `${id}.json`);
const encerrar = (p, id) => {
  const s = JSON.parse(fs.readFileSync(arquivoDaSessao(p, id), 'utf8'));
  s.fim = new Date().toISOString();
  fs.writeFileSync(arquivoDaSessao(p, id), JSON.stringify(s));
};

test('I1: frente de sessão encerrada é fechada por outra sessão, com as mesmas conferências', () => {
  const { p, wt } = comFrente();
  encerrar(p, 'sessao-teste-0001');
  const antes = p.ah(['close', 'carrinho'], OUTRA);
  assert.equal(antes.codigo, 1);
  assert.match(antes.erro, /perderia trabalho/);
  assert.ok(fs.existsSync(wt));
  mescla(p);
  const r = p.ah(['close', 'carrinho'], OUTRA);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho fechada\.\nA frente era da sessão sessao-teste-0001, já encerrada; esta sessão a fechou\./);
  assert.ok(!fs.existsSync(wt));
  assert.equal(JSON.parse(fs.readFileSync(arquivoDaSessao(p, 'sessao-teste-0001'), 'utf8')).frente, null);
  p.limpar();
});

test('I1: frente cuja sessão dona não tem arquivo também é fechada por outra sessão', () => {
  const { p } = comFrente();
  mescla(p);
  fs.rmSync(arquivoDaSessao(p, 'sessao-teste-0001'));
  const r = p.ah(['close', 'carrinho'], OUTRA);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /já encerrada/);
  p.limpar();
});

test('I1: com a dona ainda aberta, a recusa mostra o id inteiro e as duas saídas', () => {
  const p = criarProjeto();
  const id = 'sessao-a-com-id-bem-comprido-0001';
  assert.equal(p.ah(['open', 'carrinho'], { env: { AH_SESSAO: id } }).codigo, 0);
  const r = p.ah(['close', 'carrinho'], { env: { AH_SESSAO: 'sessao-b' } });
  assert.equal(r.codigo, 1);
  assert.ok(r.erro.includes(`é da sessão ${id}, que ainda está aberta`), r.erro);
  assert.ok(r.erro.includes('peça à sessão dona que rode ah close; se ela parou, espere o sinal de vida dela vencer (sessoes.prazoDoSinalMin, hoje 120 min), confira em ah board que a frente aparece órfã e repita ah close carrinho'), r.erro);
  // Revisão: nunca sugerir fechar a frente de uma sessão viva fingindo ser a dona.
  assert.ok(!r.erro.includes('AH_SESSAO='), r.erro);
  p.limpar();
});

// ---- onda final: M7 (receitas da revisão da tarefa 11)
const GH_CRIA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'apoio', 'gh-cria.mjs');
for (const modo of ['sujo', 'commit']) {
  test(`M7: o que aparece no worktree durante o comentário no ticket (${modo}) é pego na reconferência`, () => {
    const { p, wt } = comFrente();
    mescla(p);
    const r = p.ah(['close'], { env: { AH_GH: GH_CRIA, GH_CRIA: wt, GH_MODO: modo } });
    assert.equal(r.codigo, 1, r.saida);
    assert.match(r.erro, modo === 'sujo' ? /alterações não commitadas no worktree/ : /commits do ramo feat\/carrinho que não estão na dev/);
    assert.ok(fs.existsSync(wt));
    assert.ok(fs.existsSync(arquivoDaFrente(p, 'carrinho')));
    p.limpar();
  });
}

test('M7: arquivo ignorado que aparece durante o comentário é pego na reconferência', () => {
  const { p, wt } = comFrente();
  fs.writeFileSync(path.join(wt, '.gitignore'), 'novo.txt\n');
  p.git(['add', '.gitignore'], { cwd: wt });
  p.git(['commit', '-m', 'ignora'], { cwd: wt });
  mescla(p);
  const r = p.ah(['close'], { env: { AH_GH: GH_CRIA, GH_CRIA: wt, GH_MODO: 'ign' } });
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /itens ignorados no worktree/);
  assert.ok(fs.existsSync(path.join(wt, 'novo.txt')));
  p.limpar();
});

test('M7: remoto que some entre a remoção do worktree e o -D deixa o ramo e avisa', { skip: process.platform === 'win32' }, () => {
  const p = criarProjeto();
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const wt = lerFrenteDoTeste(p, 'carrinho').worktree;
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a');
  p.git(['add', 'a.txt'], { cwd: wt });
  p.git(['commit', '-m', 'feat: a'], { cwd: wt });
  assert.equal(p.git(['push', '-u', 'origin', 'feat/carrinho'], { cwd: wt }).codigo, 0);
  const gitReal = ['/usr/bin/git', '/bin/git', '/usr/local/bin/git'].find(c => fs.existsSync(c));
  assert.ok(gitReal);
  const dir = fs.mkdtempSync(path.join(path.dirname(p.raiz), 'fake-'));
  fs.writeFileSync(path.join(dir, 'git'), `#!/bin/sh\n${gitReal} "$@"; c=$?\nif [ "$1" = worktree ] && [ "$2" = remove ]; then ${gitReal} update-ref -d refs/remotes/origin/feat/carrinho; fi\nexit $c\n`, { mode: 0o755 });
  const r = p.ah(['close'], { env: { PATH: `${dir}${path.delimiter}${process.env.PATH}` } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /não apaguei o ramo feat\/carrinho/);
  assert.match(p.git(['branch', '--list']).saida, /feat\/carrinho/);
  p.limpar();
});

test('M5: git que morre nas conferências do início do close vira recusa', { skip: process.platform === 'win32' }, () => {
  const { p, wt } = comFrente();
  mescla(p);
  const gitReal = ['/usr/bin/git', '/bin/git', '/usr/local/bin/git'].find(c => fs.existsSync(c));
  const dir = fs.mkdtempSync(path.join(path.dirname(p.raiz), 'fake-'));
  for (const [quebrar, oque] of [['--show-toplevel', /em que checkout estou/], ['status', /Não consegui conferir docs\/agents\/historico-das-frentes\.md/]]) {
    fs.writeFileSync(path.join(dir, 'git'), `#!/bin/sh\nfor a in "$@"; do if [ "$a" = "${quebrar}" ]; then kill -9 $$; fi; done\nexec ${gitReal} "$@"\n`, { mode: 0o755 });
    const r = p.ah(['close'], { env: { PATH: `${dir}${path.delimiter}${process.env.PATH}` } });
    assert.equal(r.codigo, 1, quebrar);
    assert.match(r.erro, oque);
    assert.ok(fs.existsSync(wt));
  }
  p.limpar();
});

test('D2: frente sem commits novos fecha com código 0', () => {
  const p = criarProjeto();
  assert.equal(p.ah(['open', 'vazia']).codigo, 0);
  const r = p.ah(['close']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 vazia fechada\./);
  p.limpar();
});

// ---- fatia 2: a dona é a fonte; frente de sessão que não está viva se fecha de outra
test('close aceita frente cuja dona tem o sinal vencido', () => {
  const { p, wt } = comFrente();
  mescla(p);
  const viva = p.ah(['close', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002' } });
  assert.equal(viva.codigo, 1);
  assert.match(viva.erro, /ainda está aberta/);
  envelhecerSinal(p, 'sessao-teste-0001', 500);
  const r = p.ah(['close', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /A frente era da sessão sessao-teste-0001, que não está viva \(sinal vencido\); esta sessão a fechou\./);
  assert.ok(!fs.existsSync(wt));
  p.limpar();
});

test('close aceita frente passada, sem dona', () => {
  const { p } = comFrente();
  mescla(p);
  const f = lerFrenteDoTeste(p, 'carrinho');
  f.estado = 'passada';
  f.dona = null;
  fs.writeFileSync(arquivoDaFrente(p, 'carrinho'), JSON.stringify(f));
  const r = p.ah(['close', 'carrinho'], OUTRA);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /A frente estava passada, sem dona; esta sessão a fechou\./);
  p.limpar();
});

test('orquestrador fecha uma das frentes e o foco passa para a que sobrou', () => {
  const p = criarProjeto();
  p.ah(['papel', 'orquestrador']);
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  assert.equal(p.ah(['open', 'frete']).codigo, 0);
  assert.equal(p.ah(['close', 'frete']).codigo, 0);
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, 'carrinho');
  assert.equal(p.ah(['close', 'carrinho']).codigo, 0);
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, null);
  p.limpar();
});

test('close libera: tira responsável e rótulo e comenta o fechamento como livre', () => {
  const { p } = comFrente();
  assert.deepEqual(p.ghTicket(1).assignees, ['ana-souza']);
  p.git(['merge', '--no-ff', 'feat/carrinho', '-m', 'm']);
  assert.equal(p.ah(['close', '--resumo', 'soma']).codigo, 0);
  const t = p.ghTicket(1);
  assert.deepEqual([t.assignees, t.labels], [[], []]);
  assert.match(t.comments.at(-1).body, /fechada\.[\s\S]*soma[\s\S]*ah:fechamento id=as-1 .*estado=livre/);
  p.limpar();
});

// ---- Segunda onda: o remove do worktree nunca usa --force
test('arquivo novo que aparece antes do worktree remove: close recusa e não apaga, mesmo com --descartar-ignorados',
  { skip: process.platform === 'win32' ? 'embrulho do git em sh' : false }, t => {
    const { p, wt } = comFrente();
    t.after(() => p.limpar());
    mescla(p);
    const gitReal = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    const dirBin = path.join(path.dirname(p.raiz), 'bin-embrulho');
    fs.mkdirSync(dirBin, { recursive: true });
    fs.writeFileSync(path.join(dirBin, 'git'), `#!/bin/sh\ncase "$*" in *"worktree remove"*) eval "ult=\\\${$#}"; echo novo > "$ult/novo.txt";; esac\nexec "${gitReal}" "$@"\n`);
    fs.chmodSync(path.join(dirBin, 'git'), 0o755);
    const r = p.ah(['close', '--descartar-ignorados'], { env: { PATH: `${dirBin}${path.delimiter}${p.env.PATH ?? process.env.PATH}` } });
    assert.equal(r.codigo, 1, r.saida + r.erro);
    assert.match(r.erro, /^Recusado: O git não removeu o worktree/m);
    assert.match(r.erro, /Faça: .*git -C .* status/);
    assert.equal(fs.readFileSync(path.join(wt, 'novo.txt'), 'utf8'), 'novo\n');
  });

// ---- Segunda onda: o ramo remoto da frente integrada sai no close
const temRamoNoRemoto = (p, ramo) => p.git(['--git-dir', p.remoto, 'show-ref', '--verify', '--quiet', `refs/heads/${ramo}`]).codigo === 0;

test('close de frente integrada apaga o ramo remoto dela, e o nome volta a valer no open', t => {
  const { p, wt } = comFrente();
  t.after(() => p.limpar());
  assert.equal(p.git(['push', '-u', 'origin', 'feat/carrinho'], { cwd: wt }).codigo, 0);
  mescla(p);
  assert.equal(p.git(['push', 'origin', 'dev']).codigo, 0);
  const r = p.ah(['close']);
  assert.equal(r.codigo, 0, r.erro);
  assert.doesNotMatch(r.erro, /ramo remoto/);
  assert.equal(temRamoNoRemoto(p, 'feat/carrinho'), false);
  assert.equal(p.git(['show-ref', '--verify', '--quiet', 'refs/remotes/origin/feat/carrinho']).codigo, 1);
  const o = p.ah(['open', 'carrinho']);
  assert.equal(o.codigo, 0, o.erro);
});

test('close não apaga o ramo remoto que não está na base, nem o que avançou no remoto', t => {
  // Só empurrado (não integrado): o close aceita, mas o ramo remoto fica.
  const { p, wt } = comFrente();
  t.after(() => p.limpar());
  assert.equal(p.git(['push', '-u', 'origin', 'feat/carrinho'], { cwd: wt }).codigo, 0);
  assert.equal(p.ah(['close']).codigo, 0);
  assert.equal(temRamoNoRemoto(p, 'feat/carrinho'), true);

  // Integrado aqui, mas alguém empurrou outra coisa no remoto depois: o lease segura, e o close avisa com o que fazer.
  const q = comFrente('frete');
  t.after(() => q.p.limpar());
  assert.equal(q.p.git(['push', '-u', 'origin', 'feat/frete'], { cwd: q.wt }).codigo, 0);
  mescla(q.p, 'frete');
  assert.equal(q.p.git(['push', 'origin', 'dev']).codigo, 0);
  assert.equal(q.p.git(['push', 'origin', 'main']).codigo, 0);
  const outro = q.p.git(['rev-parse', 'main']).saida.trim();
  assert.equal(q.p.git(['--git-dir', q.p.remoto, 'update-ref', 'refs/heads/feat/frete', outro]).codigo, 0);
  const r = q.p.ah(['close']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /Aviso: não apaguei o ramo remoto feat\/frete .*\nFaça: .*git push origin --delete feat\/frete/);
  assert.equal(temRamoNoRemoto(q.p, 'feat/frete'), true);
});

test('frente integrada só na base local (a base não foi enviada): o ramo remoto fica, com aviso e o que fazer', t => {
  const { p, wt } = comFrente();
  t.after(() => p.limpar());
  assert.equal(p.git(['push', '-u', 'origin', 'feat/carrinho'], { cwd: wt }).codigo, 0);
  assert.equal(p.git(['push', 'origin', 'dev']).codigo, 0);
  mescla(p);
  const r = p.ah(['close']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /Aviso: o ramo remoto feat\/carrinho ficou porque a dev ainda não foi enviada .*\nFaça: git push origin dev e depois git push origin --delete feat\/carrinho/);
  assert.equal(temRamoNoRemoto(p, 'feat/carrinho'), true);
});

// ---- Pendências da linha A: close em duas fases (rede fora da trava) e remoção do worktree recusada
const esperarArquivo = async (arquivo, ms = 15000) => {
  const ate = Date.now() + ms;
  while (!fs.existsSync(arquivo)) {
    if (Date.now() > ate) throw new Error(`não apareceu: ${arquivo}`);
    await new Promise(r => setTimeout(r, 25));
  }
};
// O whoami de outra sessão pega a trava das frentes: responder logo prova que o close não a segura.
const semTrava = p => {
  const inicio = Date.now();
  const w = p.ah(['whoami'], OUTRA);
  assert.equal(w.codigo, 0, w.erro);
  assert.ok(Date.now() - inicio < 4000, 'o whoami esperou a trava');
};

test('close com o comentário no ticket demorando: a trava fica livre, o quadro mostra fechando e outro close/handoff recusa', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  mescla(p);
  const pausa = path.join(path.dirname(p.raiz), 'pausa');
  const c = p.ahAoFundo(['close'], { env: { GH_FALSO_PAUSA_COMENTARIO: pausa, GH_FALSO_PAUSA_TEXTO: 'ah:fechamento' } });
  t.after(() => { c.processo.kill('SIGKILL'); try { fs.writeFileSync(`${pausa}.solta`, ''); } catch { /* pasta já limpa */ } });
  try {
    await esperarArquivo(`${pausa}.chegou`);
    semTrava(p);
    assert.match(p.ah(['board']).saida, /carrinho .*fechando/);
    const outro = p.ah(['close', 'carrinho']);
    assert.equal(outro.codigo, 1);
    assert.match(outro.erro, /^Recusado: A frente as-1 carrinho está sendo fechada agora \(processo \d+\)\.\nFaça: espere esse ah close terminar/);
    const h = p.ah(['handoff']);
    assert.equal(h.codigo, 1);
    assert.match(h.erro, /está sendo fechada agora/);
  } finally {
    fs.writeFileSync(`${pausa}.solta`, '');
  }
  const r = await c.fim;
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho fechada\./);
  assert.ok(!fs.existsSync(arquivoDaFrente(p, 'carrinho')));
  assert.equal(comentarios(p).length, 2); // abertura e fechamento, uma vez só
});

test('close de frente passada com a retomada no ticket demorando: a retomada pelo open recusa no meio', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  assert.equal(p.ah(['handoff']).codigo, 0);
  const pausa = path.join(path.dirname(p.raiz), 'pausa');
  const c = p.ahAoFundo(['close', 'carrinho'], { env: { ...OUTRA.env, GH_FALSO_PAUSA_COMENTARIO: pausa, GH_FALSO_PAUSA_TEXTO: 'ah:retomada' } });
  t.after(() => { c.processo.kill('SIGKILL'); try { fs.writeFileSync(`${pausa}.solta`, ''); } catch { /* pasta já limpa */ } });
  try {
    await esperarArquivo(`${pausa}.chegou`);
    const o = p.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-teste-0003' } });
    assert.equal(o.codigo, 1);
    assert.match(o.erro, /^Recusado: A frente as-1 carrinho está sendo fechada agora \(processo \d+\)\.\nFaça: espere esse ah close terminar/m);
    assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  } finally {
    fs.writeFileSync(`${pausa}.solta`, '');
  }
  const r = await c.fim;
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho fechada\./);
});

test('close com o push que apaga o ramo remoto demorando: a trava fica livre', { skip: process.platform === 'win32' ? 'gancho do remoto em sh' : false }, async t => {
  const { p, wt } = comFrente();
  t.after(() => p.limpar());
  assert.equal(p.git(['push', '-u', 'origin', 'feat/carrinho'], { cwd: wt }).codigo, 0);
  mescla(p);
  assert.equal(p.git(['push', 'origin', 'dev']).codigo, 0);
  const pausa = path.join(path.dirname(p.raiz), 'pausa-push');
  const gancho = path.join(p.remoto, 'hooks', 'pre-receive');
  fs.writeFileSync(gancho, `#!/bin/sh\ntouch '${pausa}.chegou'\ni=0\nwhile [ ! -e '${pausa}.solta' ] && [ $i -lt 200 ]; do sleep 0.1; i=$((i+1)); done\n`, { mode: 0o755 });
  const c = p.ahAoFundo(['close']);
  t.after(() => { c.processo.kill('SIGKILL'); try { fs.writeFileSync(`${pausa}.solta`, ''); } catch { /* pasta já limpa */ } });
  try {
    await esperarArquivo(`${pausa}.chegou`);
    semTrava(p);
  } finally {
    fs.writeFileSync(`${pausa}.solta`, '');
  }
  const r = await c.fim;
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(temRamoNoRemoto(p, 'feat/carrinho'), false);
});
