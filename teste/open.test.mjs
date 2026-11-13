import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto } from './apoio/repo.mjs';

const lerFrenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(path.join(p.estado, 'loja', 'frentes', `${nome}.json`), 'utf8'));
const eventos = p => fs.readFileSync(path.join(p.estado, 'loja', 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const comentarios = p => p.ghChamadas().filter(c => c.argv[0] === 'issue' && c.argv[1] === 'comment');
const fechaSimulado = (p, sessao = 'sessao-teste-0001') => {
  const arq = path.join(p.estado, 'loja', 'sessoes', `${sessao}.json`);
  const s = JSON.parse(fs.readFileSync(arq, 'utf8'));
  s.frente = null;
  fs.writeFileSync(arq, JSON.stringify(s));
  // A dona é a fonte (fatia 2): a frente deixa de ser da sessão, mas o arquivo fica.
  const dir = path.join(p.estado, 'loja', 'frentes');
  for (const nome of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const f = JSON.parse(fs.readFileSync(path.join(dir, nome), 'utf8'));
    if (f.dona === sessao) fs.writeFileSync(path.join(dir, nome), JSON.stringify({ ...f, dona: null, estado: 'passada' }));
  }
};

test('open cria ramo, worktree, estado e comenta nos tickets', () => {
  const p = criarProjeto();
  const r = p.ah(['open', 'carrinho', '--tickets', '1,2', '--plano', 'README.md']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho aberta\./);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.id, f.ramo, f.tickets, f.plano, f.dona], ['as-1', 'feat/carrinho', [1, 2], 'README.md', 'sessao-teste-0001']);
  assert.ok(fs.existsSync(path.join(f.worktree, '.git')));
  assert.ok(r.saida.includes(`Trabalhe em: ${f.worktree}`));
  const com = comentarios(p);
  assert.equal(com.length, 2);
  assert.match(com[0].entrada, /Frente as-1 \(carrinho\) aberta por @ana-souza\./);
  assert.match(com[0].entrada, /<!-- ah:frente id=as-1 nome=carrinho ramo=feat\/carrinho estado=ativa login=ana-souza/);
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, 'carrinho');
  assert.match(p.ah(['whoami']).saida, /frente: as-1 carrinho/);
  const ab = eventos(p).find(e => e.tipo === 'abertura');
  assert.deepEqual([ab.frente, ab.id, ab.tickets], ['carrinho', 'as-1', [1, 2]]);
  p.limpar();
});

test('a segunda frente da mesma pessoa é as-2', () => {
  const p = criarProjeto();
  p.ah(['open', 'a1']);
  fechaSimulado(p);
  assert.match(p.ah(['open', 'b1']).saida, /Frente as-2 b1 aberta\./);
  p.limpar();
});

test('duas sessões abrindo frentes: as-1 e as-2', () => {
  const p = criarProjeto();
  assert.match(p.ah(['open', 'a1']).saida, /as-1/);
  assert.match(p.ah(['open', 'b1'], { env: { AH_SESSAO: 'sessao-teste-0002' } }).saida, /as-2/);
  p.limpar();
});

test('o fechamento só na base local conta no ID e a frente nasce da base local', () => {
  const p = criarProjeto();
  assert.equal(p.git(['push', 'origin', 'dev']).codigo, 0);
  const arq = path.join(p.raiz, 'docs', 'agents', 'historico-das-frentes.md');
  fs.appendFileSync(arq, '\n- 2026-11-12 · as-1 · antiga · @ana-souza · #1 · feito\n');
  assert.equal(p.git(['commit', '-am', 'docs: fecha as-1']).codigo, 0);
  const r = p.ah(['open', 'proxima']);
  assert.match(r.saida, /Frente as-2 proxima aberta\./, r.erro);
  const f = lerFrenteDoTeste(p, 'proxima');
  assert.equal(p.git(['rev-parse', 'feat/proxima']).saida, p.git(['rev-parse', 'dev']).saida);
  assert.ok(f.id);
  p.limpar();
});

test('o fechamento só no remoto conta no ID e a frente nasce do remoto', () => {
  const p = criarProjeto();
  const arq = path.join(p.raiz, 'docs', 'agents', 'historico-das-frentes.md');
  fs.appendFileSync(arq, '\n- 2026-11-12 · as-1 · antiga · @ana-souza · #1 · feito\n');
  p.git(['commit', '-am', 'docs: fecha as-1']);
  p.git(['push', 'origin', 'dev']);
  p.git(['reset', '--hard', 'HEAD~1']);
  const r = p.ah(['open', 'proxima']);
  assert.match(r.saida, /Frente as-2 proxima aberta\./, r.erro);
  assert.equal(p.git(['rev-parse', 'feat/proxima']).saida, p.git(['rev-parse', 'origin/dev']).saida);
  p.limpar();
});

test('executor com frente ativa não abre outra', () => {
  const p = criarProjeto();
  p.ah(['open', 'a1']);
  const r = p.ah(['open', 'b1']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: .*ah close/);
  p.limpar();
});

test('nome repetido como ramo local, ramo remoto ou frente é recusado', () => {
  const p = criarProjeto();
  p.git(['branch', 'feat/xx']);
  assert.match(p.ah(['open', 'xx']).erro, /Faça: .*outro nome/);
  p.git(['push', 'origin', 'dev:feat/yy']);
  p.git(['fetch', 'origin']);
  assert.match(p.ah(['open', 'yy']).erro, /Faça: .*outro nome/);
  p.ah(['open', 'z1']);
  // Frente ativa de outra sessão viva: recusa apontando o handoff (a passada se retoma: teste/handoff.test.mjs).
  assert.match(p.ah(['open', 'z1'], { env: { AH_SESSAO: 'sessao-teste-0002' } }).erro, /Faça: .*ah handoff/);
  p.limpar();
});

test('nome inválido é recusado com o formato', () => {
  const p = criarProjeto();
  for (const n of ['Minha Frente', '../x', '-x', 'a']) {
    const r = p.ah(['open', n]);
    assert.equal(r.codigo, 1, n);
    assert.match(r.erro, /Faça: /, n);
  }
  assert.match(p.ah(['open']).erro, /Faça: /);
  p.limpar();
});

test('entradas hostis são recusadas sem criar nada', () => {
  const p = criarProjeto();
  const casos = [
    ['open', 'c1', '--tickets', '1,abc'], ['open', 'c1', '--tickets', '0'], ['open', 'c1', '--tickets', '1,,2'],
    ['open', 'c1', '--tickets', '-3'], ['open', 'c1', '--plano', '/etc/passwd'], ['open', 'c1', '--plano', '../fora.md'],
    ['open', 'c1', '--plano', 'nao-existe.md'], ['open', 'c1', '--zzz'], ['open', 'c1', 'c2'],
    ['open', 'c1', '--tickets'],
  ];
  for (const c of casos) {
    const r = p.ah(c);
    assert.equal(r.codigo, 1, c.join(' '));
    assert.match(r.erro, /Faça: /, c.join(' '));
  }
  assert.equal(fs.existsSync(path.join(p.estado, 'loja', 'frentes')), false);
  assert.equal(p.git(['branch', '--list', 'feat/*']).saida.trim(), '');
  p.limpar();
});

test('caminhos é guardado como lista de texto, sem expandir', () => {
  const p = criarProjeto();
  assert.equal(p.ah(['open', 'c1', '--caminhos', 'src/**,docs/*.md']).codigo, 0);
  assert.deepEqual(lerFrenteDoTeste(p, 'c1').caminhos, ['src/**', 'docs/*.md']);
  p.limpar();
});

test('sem sigla na máquina recusa apontando o init', () => {
  const p = criarProjeto();
  fs.rmSync(path.join(p.estado, 'maquina.json'));
  assert.match(p.ah(['open', 'c1']).erro, /ah init --sigla/);
  p.limpar();
});

test('se o worktree falha nada fica gravado', () => {
  const p = criarProjeto();
  const alvo = path.join(p.env.AH_WORKTREES, 'c1');
  fs.mkdirSync(alvo, { recursive: true });
  fs.writeFileSync(path.join(alvo, 'ocupado.txt'), 'x');
  const r = p.ah(['open', 'c1']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: /);
  assert.match(r.erro, /already exists|já existe/i);
  assert.equal(fs.existsSync(path.join(p.estado, 'loja', 'frentes', 'c1.json')), false);
  assert.equal(p.git(['branch', '--list', 'feat/c1']).saida.trim(), '');
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, null);
  p.limpar();
});

test('open com tickets e sem rede recusa sem criar nada', () => {
  const p = criarProjeto();
  const r = p.ah(['open', 'carrinho', '--tickets', '1'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: /);
  assert.equal(fs.existsSync(path.join(p.env.AH_WORKTREES, 'carrinho')), false);
  assert.equal(p.git(['branch', '--list', 'feat/carrinho']).saida.trim(), '');
  assert.equal(fs.existsSync(path.join(p.estado, 'loja', 'frentes', 'carrinho.json')), false);
  p.limpar();
});

test('arquivos sujos no checkout principal são só listados', () => {
  const p = criarProjeto();
  fs.writeFileSync(path.join(p.raiz, 'solto.txt'), 'x');
  const r = p.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /solto\.txt/);
  assert.match(p.git(['status', '--short']).saida, /solto\.txt/);
  p.limpar();
});

test('caminho com espaço e acento', () => {
  const p = criarProjeto({ sufixo: ' João Silva' });
  const r = p.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 0, r.erro);
  assert.ok(lerFrenteDoTeste(p, 'carrinho').worktree.includes('João Silva'));
  p.limpar();
});

test('nota entra na frente; sem frente é recusada', () => {
  const p = criarProjeto();
  assert.match(p.ah(['nota', 'oi']).erro, /ah open/);
  p.ah(['open', 'carrinho']);
  assert.equal(p.ah(['nota', 'mexendo no total']).codigo, 0);
  const n = lerFrenteDoTeste(p, 'carrinho').notas[0];
  assert.deepEqual([n.texto, n.sessao], ['mexendo no total', 'sessao-teste-0001']);
  assert.ok(Date.parse(n.em));
  assert.ok(eventos(p).some(e => e.tipo === 'nota' && e.frente === 'carrinho'));
  const vazia = p.ah(['nota', '  ']);
  assert.equal(vazia.codigo, 1);
  assert.match(vazia.erro, /Faça: /);
  p.limpar();
});

test('M2: ramo local repetido aponta também a limpeza da sobra de um open interrompido', () => {
  const p = criarProjeto();
  p.git(['branch', 'feat/xx']);
  const r = p.ah(['open', 'xx']);
  assert.match(r.erro, /Faça: escolha outro nome.*git worktree remove .*xx.*git branch -d feat\/xx/);
  p.limpar();
});
