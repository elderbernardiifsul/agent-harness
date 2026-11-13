import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { casaGlob, sobreposicoes, arquivosDaFrente, arquivosDaFrenteOuNulo, tocaOsCaminhos, caminhosEmComum } from '../nucleo/lib/sobreposicao.mjs';
import { git as gitReal } from '../nucleo/lib/git.mjs';
import { executar as executarBoard } from '../nucleo/comandos/board.mjs';
import { avisarDasOutrasSemFalhar } from '../nucleo/comandos/open.mjs';
import { ErroDeUso } from '../nucleo/lib/caminhos.mjs';
import { tratar } from '../nucleo/adaptadores/contrato.mjs';
import { criarProjeto, amb, dirDoTeste } from './apoio/repo.mjs';

const SESSAO_B = { env: { AH_SESSAO: 'sessao-b-0002' } };
const SESSAO_C = { env: { AH_SESSAO: 'sessao-c-0003' } };

// Commit no worktree da frente que grava `rel` com `texto`.
function commitar(p, frente, rel, texto) {
  const wt = path.join(p.env.AH_WORKTREES, frente);
  fs.mkdirSync(path.dirname(path.join(wt, rel)), { recursive: true });
  fs.writeFileSync(path.join(wt, rel), texto);
  for (const args of [['add', '--', rel], ['commit', '-m', `muda ${rel}`]]) {
    const g = p.git(args, { cwd: wt });
    if (g.codigo !== 0) throw new Error(`git ${args.join(' ')} falhou: ${g.erro}`);
  }
  return wt;
}

// Projeto com `carrinho` (sessão padrão) e `frete` (sessao-b-0002), cada uma com um commit que muda src/total.js.
function duasFrentes(t) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const a = p.ah(['open', 'carrinho']);
  assert.equal(a.codigo, 0, a.erro);
  const b = p.ah(['open', 'frete'], SESSAO_B);
  assert.equal(b.codigo, 0, b.erro);
  commitar(p, 'carrinho', 'src/total.js', 'carrinho\n');
  commitar(p, 'frete', 'src/total.js', 'frete\n');
  return p;
}

const lerFrenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'frentes', `${nome}.json`), 'utf8'));

test('casaGlob', () => {
  assert.ok(casaGlob('src/a/b.js', 'src/**')); assert.ok(casaGlob('src/b.js', 'src/*.js'));
  assert.ok(!casaGlob('src/a/b.js', 'src/*.js')); assert.ok(casaGlob('docs/x/y.md', 'docs/'));
  assert.ok(casaGlob('a1c', 'a?c')); assert.ok(!casaGlob('a.c', 'a[.]c'));
  assert.ok(!casaGlob('a/c', 'a?c')); assert.ok(casaGlob('a[.]c', 'a[.]c'));
  assert.ok(casaGlob('src/x.js', 'src/**/x.js')); assert.ok(casaGlob('src/a/b/x.js', 'src/**/x.js'));
  assert.ok(!casaGlob('srcx/a.js', 'src/**')); assert.ok(!casaGlob('docsx/a.md', 'docs/'));
  assert.ok(casaGlob('README.md', 'README.md')); assert.ok(!casaGlob('README.mdx', 'README.md'));
});

test('sobreposicoes só lista arquivo de duas frentes', () =>
  assert.deepEqual(sobreposicoes(new Map([['as-1', ['a', 'b']], ['as-2', ['b', 'c']]])), [{ arquivo: 'b', frentes: ['as-1', 'as-2'] }]));

test('sobreposicoes ordena por arquivo e lista três frentes', () => {
  const m = new Map([['as-3', ['z', 'b']], ['as-1', ['b', 'z']], ['as-2', ['b']], ['as-4', []]]);
  assert.deepEqual(sobreposicoes(m), [{ arquivo: 'b', frentes: ['as-1', 'as-2', 'as-3'] }, { arquivo: 'z', frentes: ['as-1', 'as-3'] }]);
});

test('tocaOsCaminhos e caminhosEmComum', () => {
  assert.deepEqual(tocaOsCaminhos(['src/a.js', 'docs/b.md', 'x/c.js'], ['src/**', 'docs/']), ['src/a.js', 'docs/b.md']);
  assert.deepEqual(tocaOsCaminhos(['a'], []), []);
  assert.deepEqual(caminhosEmComum(['src/**', 'docs/*.md'], ['src/**']), ['src/**']);
  assert.deepEqual(caminhosEmComum(['src/a/'], ['src/**']), ['src/a/'], 'um prefixo literal do outro');
  assert.deepEqual(caminhosEmComum(['docs/*.md'], ['src/**']), []);
});

test('arquivosDaFrente junta commits do ramo e mudanças não commitadas', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const wt = commitar(p, 'carrinho', 'a.js', 'a\n');
  fs.writeFileSync(path.join(wt, 'b.js'), 'b\n');
  const frente = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual(arquivosDaFrente(frente, { raiz: p.raiz, base: 'dev', env: p.env }), ['a.js', 'b.js']);
});

test('arquivosDaFrente: renomeação conta os dois nomes; nomes com espaço, acento e aspas', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const wt = commitar(p, 'carrinho', 'velho.js', 'v\n');
  commitar(p, 'carrinho', 'dir/ção.md', 'c\n');
  // Renomeação commitada de um arquivo da base: o diff conta os dois nomes.
  assert.equal(p.git(['mv', 'README.md', 'LEIAME.md'], { cwd: wt }).codigo, 0);
  assert.equal(p.git(['commit', '-m', 'renomeia'], { cwd: wt }).codigo, 0);
  // Renomeação no índice, sem commit: o status conta os dois nomes.
  assert.equal(p.git(['mv', 'velho.js', 'novo.js'], { cwd: wt }).codigo, 0);
  const estranho = 'pasta com espaço/ação "x".js';
  fs.mkdirSync(path.join(wt, 'pasta com espaço'), { recursive: true });
  fs.writeFileSync(path.join(wt, estranho), 'x\n');
  const frente = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual(arquivosDaFrente(frente, { raiz: p.raiz, base: 'dev', env: p.env }),
    ['LEIAME.md', 'README.md', 'dir/ção.md', 'novo.js', estranho, 'velho.js'].sort());
});

test('arquivosDaFrente: ramo ausente, worktree apagado e frente sem ramo contam como lista vazia', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const o = { raiz: p.raiz, base: 'dev', env: p.env };
  assert.deepEqual(arquivosDaFrente({ nome: 'x', ramo: 'feat/nao-existe', worktree: path.join(p.raiz, '..', 'nada') }, o), []);
  assert.deepEqual(arquivosDaFrente({ nome: 'x', estado: 'abrindo' }, o), []);
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const wt = commitar(p, 'carrinho', 'a.js', 'a\n');
  fs.rmSync(wt, { recursive: true, force: true });
  assert.deepEqual(arquivosDaFrente(lerFrenteDoTeste(p, 'carrinho'), o), ['a.js'], 'sem o worktree, só o que está no ramo');
  assert.deepEqual(arquivosDaFrente(lerFrenteDoTeste(p, 'carrinho'), { ...o, raiz: path.join(p.raiz, '..', 'nada') }), [], 'git falhando');
});

test('board mostra a sobreposição', t => {
  const p = duasFrentes(t); const s = p.ah(['board']).saida;
  assert.match(s, /as-1\s+carrinho.*\bas-2\b/); assert.match(s, /Sobreposições:\n\s+src\/total\.js: as-1, as-2/);
  assert.match(s, /^ID\s+NOME\s+DONA\s+ESTADO\s+TICKETS\s+SOBREPÕE\s+PLANO\s+ÚLTIMA NOTA/m);
  const j = JSON.parse(p.ah(['board', '--json']).saida);
  assert.deepEqual(j.frentes.map(f => f.sobrepoe), [['as-2'], ['as-1']]);
  assert.deepEqual(j.sobreposicoes, [{ arquivo: 'src/total.js', frentes: ['as-1', 'as-2'] }]);
});

test('board sem sobreposição mostra traço e não tem a seção', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  p.ah(['open', 'carrinho']);
  p.ah(['open', 'frete'], SESSAO_B);
  commitar(p, 'carrinho', 'a.js', 'a\n');
  commitar(p, 'frete', 'b.js', 'b\n');
  const s = p.ah(['board']).saida;
  assert.match(s, /as-1\s+carrinho\s+\S+\s+ativa\s+—\s+—/);
  assert.doesNotMatch(s, /Sobreposições:/);
});

test('board não cai com worktree apagado à mão nem com ramo ausente', t => {
  const p = duasFrentes(t);
  fs.rmSync(path.join(p.env.AH_WORKTREES, 'frete'), { recursive: true, force: true });
  p.git(['worktree', 'prune']);
  assert.equal(p.git(['branch', '-D', 'feat/frete']).codigo, 0);
  const r = p.ah(['board']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /as-2\s+frete/);
  assert.doesNotMatch(r.saida, /Sobreposições:/);
});

test('board corta a lista de sobreposições em 20', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  p.ah(['open', 'carrinho']);
  p.ah(['open', 'frete'], SESSAO_B);
  for (const nome of ['carrinho', 'frete']) {
    const wt = path.join(p.env.AH_WORKTREES, nome);
    for (let i = 0; i < 25; i++) fs.writeFileSync(path.join(wt, `f${String(i).padStart(2, '0')}.js`), nome);
  }
  const s = p.ah(['board']).saida;
  assert.match(s, /f19\.js: as-1, as-2\n\s+… e mais 5\n/);
  assert.doesNotMatch(s, /f20\.js/);
});

test('open --caminhos avisa da frente que já mexe e mostra as notas dela', t => {
  const p = duasFrentes(t); p.ah(['nota', 'mexendo no total'], { env: { AH_SESSAO: 'sessao-b-0002' } });
  const r = p.ah(['open', 'cupom', '--caminhos', 'src/**'], { env: { AH_SESSAO: 'sessao-c-0003' } });
  assert.equal(r.codigo, 0); assert.match(r.erro, /Atenção: as-2 frete já mudou 1 arquivo\(s\) de --caminhos: src\/total\.js/); assert.match(r.erro, /mexendo no total/);
  assert.match(r.erro, /Atenção: as-1 carrinho já mudou 1 arquivo\(s\)/);
  assert.match(r.erro, /Notas de as-2 frete:\n {2}\S.*mexendo no total\n/);
  assert.match(r.saida, /Frente as-3 cupom aberta\./);
});

test('open mostra só as 3 últimas notas, uma linha cada, cortadas em 120', t => {
  const p = duasFrentes(t);
  for (const n of ['um', 'dois', 'três', `quatro\n${'q'.repeat(300)}`]) p.ah(['nota', n], SESSAO_B);
  const r = p.ah(['open', 'cupom'], SESSAO_C);
  assert.equal(r.codigo, 0, r.erro);
  const bloco = r.erro.split('Notas de as-2 frete:\n')[1].split('\n').slice(0, 3);
  assert.doesNotMatch(r.erro, / um\n/);
  assert.match(bloco[0], /dois$/); assert.match(bloco[1], /três$/); assert.match(bloco[2], /quatro q+…$/);
  assert.ok(bloco.every(l => l.length <= 122), 'dois de recuo mais 120');
  assert.doesNotMatch(r.erro, /Atenção/, 'sem --caminhos não há aviso de arquivos');
  assert.doesNotMatch(r.erro, /Notas de as-1/, 'frente sem nota não aparece');
});

test('open avisa quem declarou os mesmos caminhos, inclusive frente em abertura', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  assert.equal(p.ah(['open', 'carrinho', '--caminhos', 'src/**,docs/*.md']).codigo, 0);
  const f = lerFrenteDoTeste(p, 'carrinho');
  fs.writeFileSync(path.join(dirDoTeste(p), 'frentes', 'frete.json'),
    JSON.stringify({ ...f, id: 'as-7', nome: 'frete', ramo: 'feat/frete', worktree: path.join(p.env.AH_WORKTREES, 'frete'), estado: 'abrindo', dona: 'sessao-x-0009', caminhos: ['src/a/'] }));
  const r = p.ah(['open', 'cupom', '--caminhos', 'src/**'], SESSAO_B);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /Atenção: as-1 carrinho declarou os mesmos caminhos: src\/\*\*\n/);
  assert.match(r.erro, /Atenção: as-7 frete declarou os mesmos caminhos: src\/a\/\n/);
  assert.doesNotMatch(r.erro, /já mudou/);
});

test('resumo traz a sobreposição da frente da sessão', async t => {
  const p = duasFrentes(t);
  const r = await tratar({ tipo: 'inicio', sessao: 'sessao-b-0002', agente: 'claude-code', cwd: p.raiz, origem: 'continuacao' }, amb(p));
  assert.match(r.contexto, /Sobreposição: src\/total\.js com as-1/);
});

test('resumo sai sem a linha quando o prazo da sobreposição acaba', async t => {
  const p = duasFrentes(t);
  const r = await tratar({ tipo: 'inicio', sessao: 'sessao-b-0002', agente: 'claude-code', cwd: p.raiz, origem: 'continuacao' },
    { ...amb(p), prazoDaSobreposicaoMs: 0 });
  assert.doesNotMatch(r.contexto, /Sobreposição/);
  assert.match(r.contexto, /Sua frente: as-2 frete/);
});

test('resumo sai sem a linha quando o git falha', async t => {
  const p = duasFrentes(t);
  const r = await tratar({ tipo: 'inicio', sessao: 'sessao-b-0002', agente: 'claude-code', cwd: p.raiz, origem: 'continuacao' },
    { ...amb(p), env: { ...p.env, PATH: path.join(p.raiz, 'nada') } });
  assert.doesNotMatch(r.contexto, /Sobreposição/);
});

test('linha de sobreposição do resumo cabe em 200 e guarda os IDs', async () => {
  const { montarResumo } = await import('../nucleo/lib/resumo.mjs');
  const { PADROES } = await import('../nucleo/lib/config.mjs');
  const sobre = Array.from({ length: 30 }, (_, i) => ({ arquivo: `src/pasta-longa/arquivo-${i}.js`, frentes: ['as-1', 'cd-4'] }));
  const t = montarResumo({ sessao: { id: 'sessao-b-0002', frente: null }, config: PADROES, baseLimpa: true, situacao: { sobreposicoes: sobre } });
  const l = t.split('\n').find(x => x.startsWith('Sobreposição: '));
  assert.ok(l.length <= 200, `${l.length}`);
  assert.match(l, /… com as-1, cd-4$/);
});

// ------------------------------------------------------------ consertos da revisão

test('status no worktree alheio roda sem o lock opcional do índice', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const wt = commitar(p, 'carrinho', 'a.js', 'a\n');
  fs.writeFileSync(path.join(wt, 'b.js'), 'b\n');
  const chamadas = [];
  const rodarGit = (args, o) => { chamadas.push({ args, cwd: o.cwd }); return gitReal(args, o); };
  assert.deepEqual(arquivosDaFrenteOuNulo(lerFrenteDoTeste(p, 'carrinho'), { raiz: p.raiz, base: 'dev', env: p.env, rodarGit }), ['a.js', 'b.js']);
  const noWorktree = chamadas.filter(c => c.cwd === wt);
  assert.ok(noWorktree.length > 0);
  for (const c of noWorktree) assert.equal(c.args[0], '--no-optional-locks', c.args.join(' '));
});

test('caminhosEmComum compara pasta por pasta', () => {
  assert.deepEqual(caminhosEmComum(['*.md'], ['src/**']), [], 'prefixo vazio não colide com pasta');
  assert.deepEqual(caminhosEmComum(['src'], ['src2/**']), [], 'src não é ancestral de src2');
  assert.deepEqual(caminhosEmComum(['src/**'], ['src/carrinho/*.js']), ['src/**']);
  assert.deepEqual(caminhosEmComum(['src/carrinho/*.js'], ['src/**']), ['src/carrinho/*.js']);
  assert.deepEqual(caminhosEmComum(['*.md'], ['*.js']), ['*.md'], 'dois de prefixo vazio colidem');
  assert.deepEqual(caminhosEmComum(['*.md'], ['*.md']), ['*.md']);
  assert.deepEqual(caminhosEmComum(['src'], ['src/a.js']), ['src']);
  assert.deepEqual(caminhosEmComum(['src/carr*'], ['src/frete/**']), ['src/carr*'], 'mesma pasta src');
});

// Ambiente do board chamado no próprio processo, com a saída e os avisos guardados.
function ambDoBoard(p, extra = {}) {
  const saida = [];
  const erro = [];
  const a = { ...amb(p), sessaoId: null, escrever: x => saida.push(x), avisar: x => erro.push(x), ...extra };
  return { a, saida: () => saida.join(''), erro: () => erro.join('') };
}

test('board com o prazo da sobreposição estourado: ? na coluna, aviso e JSON incompleto, código 0', async t => {
  const p = duasFrentes(t);
  const b = ambDoBoard(p, { prazoDaSobreposicaoMs: 0 });
  assert.equal(await executarBoard([], b.a), 0);
  assert.match(b.saida(), /as-1\s+carrinho\s+\S+\s+ativa\s+—\s+\?\s/);
  assert.match(b.saida(), /as-2\s+frete\s+\S+\s+ativa\s+—\s+\?\s/);
  assert.doesNotMatch(b.saida(), /Sobreposições:/);
  assert.match(b.erro(), /Aviso: a sobreposição ficou incompleta.*2 frente\(s\) com \?/);
  const j = ambDoBoard(p, { prazoDaSobreposicaoMs: 0 });
  assert.equal(await executarBoard(['--json'], j.a), 0);
  const obj = JSON.parse(j.saida());
  assert.equal(obj.sobreposicaoIncompleta, true);
  assert.deepEqual(obj.frentes.map(f => f.sobreposicaoConferida), [false, false]);
  const ok = ambDoBoard(p);
  assert.equal(await executarBoard(['--json'], ok.a), 0);
  assert.equal(JSON.parse(ok.saida()).sobreposicaoIncompleta, false);
  assert.equal(ok.erro(), '');
});

test('erro nos avisos do open, inclusive ErroDeUso, vira aviso e não lança', () => {
  const avisos = [];
  const ambQuebrado = { avisar: x => avisos.push(x), get dirEstado() { throw new ErroDeUso('estado sumiu\nPróximo passo: x'); } };
  assert.doesNotThrow(() => avisarDasOutrasSemFalhar({ nome: 'cupom' }, ['src/**'], ambQuebrado));
  assert.match(avisos.join(''), /^Aviso: não consegui conferir as outras frentes \(estado sumiu\)\.\n$/);
});
