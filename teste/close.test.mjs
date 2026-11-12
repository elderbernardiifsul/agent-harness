import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto } from './apoio/repo.mjs';

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
  assert.deepEqual([f.id, f.nome], ['as-1', 'carrinho']);
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
