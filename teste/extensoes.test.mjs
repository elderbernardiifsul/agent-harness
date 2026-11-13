import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarProjeto, dirDoTeste, ganchoPre, amb as ambDoTeste, apagarPastaDeTeste } from './apoio/repo.mjs';
import {
  VERSAO_DA_INTERFACE, carregarExtensoes, descobrir, esquecerExtensoes, montarCtx,
} from '../nucleo/lib/extensoes.mjs';
import { aplicarPadroes, validarConfig } from '../nucleo/lib/config.mjs';
import { avaliar } from '../nucleo/lib/travas.mjs';
import { montarResumo, LIMITE_RESUMO } from '../nucleo/lib/resumo.mjs';
import { gravarFrente, lerFrente } from '../nucleo/lib/frente.mjs';
import { ErroDeUso } from '../nucleo/lib/caminhos.mjs';
import { tratar } from '../nucleo/adaptadores/contrato.mjs';
import { lerEventos } from '../nucleo/lib/estado.mjs';

const ECO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'extensoes-de-teste', 'eco');

// ---------------------------------------------------------------- carga (no próprio processo)

// Pasta descartável com `.harness/extensoes/<nome>/extensao.mjs` para cada fonte dada e um núcleo de mentira.
function pastas(t, doProjeto = {}, doNucleo = {}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ah-teste-ext-')));
  t.after(() => apagarPastaDeTeste(base));
  const raiz = path.join(base, 'repo');
  const dirNucleo = path.join(base, 'nucleo-extensoes');
  const escrever = (dir, fontes) => {
    for (const [nome, fonte] of Object.entries(fontes)) {
      fs.mkdirSync(path.join(dir, nome), { recursive: true });
      if (fonte !== null) fs.writeFileSync(path.join(dir, nome, 'extensao.mjs'), fonte);
    }
  };
  fs.mkdirSync(raiz, { recursive: true });
  escrever(path.join(raiz, '.harness', 'extensoes'), doProjeto);
  escrever(dirNucleo, doNucleo);
  return { raiz, dirNucleo, dirEstado: path.join(base, 'estado') };
}

const fonte = (corpo = '') => `export default { versaoDaInterface: 1, descricao: 'teste', ${corpo} };\n`;
const carregar = (pp, extensoes, opcoes = {}) => carregarExtensoes(
  { raiz: pp.raiz, config: aplicarPadroes({ projeto: 'loja', extensoes }), dirEstado: pp.dirEstado },
  { dirNucleo: pp.dirNucleo, semCache: true, ...opcoes },
);
const porNome = (r, nome) => r.ligadas.find(e => e.nome === nome);

test('a interface tem versão 1', () => assert.equal(VERSAO_DA_INTERFACE, 1));

test('descobrir acha as do harness e as do projeto; com o mesmo nome vale a do projeto, com sombra', t => {
  const pp = pastas(t, { minha: fonte(), comum: fonte() }, { recursos: fonte(), comum: fonte() });
  const achadas = descobrir(pp.raiz, { dirNucleo: pp.dirNucleo });
  assert.deepEqual(achadas.map(e => [e.nome, e.origem, e.sombra]), [['comum', 'projeto', true], ['minha', 'projeto', false], ['recursos', 'harness', false]]);
  assert.equal(achadas[0].arquivo, path.join(pp.raiz, '.harness', 'extensoes', 'comum', 'extensao.mjs'));
});

test('descobrir ignora pastas com nome fora do padrão', t => {
  const pp = pastas(t, { Maiuscula: fonte(), '1numero': fonte(), boa: fonte() });
  assert.deepEqual(descobrir(pp.raiz, { dirNucleo: pp.dirNucleo }).map(e => e.nome), ['boa']);
});

test('só carrega as ligadas na configuração; false desliga', async t => {
  const pp = pastas(t, { a: fonte(), b: fonte(), c: fonte() });
  const r = await carregar(pp, { a: true, b: { x: 1 }, c: false });
  assert.deepEqual(r.ligadas.map(e => e.nome), ['a', 'b']);
  assert.deepEqual(r.ativas.map(e => [e.nome, e.config]), [['a', {}], ['b', { x: 1 }]]);
});

test('extensão ligada que falha não derruba as outras e diz motivo e conserto', async t => {
  const pp = pastas(t, {
    boa: fonte(),
    versao: 'export default { versaoDaInterface: 2, descricao: "x" };\n',
    sintaxe: 'export default {\n',
    semdefault: 'export const x = 1;\n',
    campo: fonte('reacao: {}'),
    comando: fonte('comandos: { x: { descricao: "x" } }'),
    nucleo: fonte('comandos: { board: { descricao: "x", executar() {} } }'),
    recusada: fonte('validarConfig: c => (c.porta ? null : "falta a porta")'),
    lanca: fonte('validarConfig() { throw new Error("quebrou"); }'),
    trava: fonte('travas: [{ id: "Ruim", avaliar() {} }]'),
    reacao: fonte('reacoes: { depoisDeTudo() {} }'),
    vazia: null,
  });
  const r = await carregar(pp, Object.fromEntries(['boa', 'versao', 'sintaxe', 'semdefault', 'campo', 'comando', 'nucleo', 'recusada', 'lanca', 'trava', 'reacao', 'vazia', 'sumida'].map(n => [n, true])));
  assert.deepEqual(r.ativas.map(e => e.nome), ['boa']);
  const motivo = n => porNome(r, n).motivo;
  assert.match(motivo('versao'), /versão 2 da interface; o núcleo espera a 1/);
  assert.match(motivo('sintaxe'), /não carregou/);
  assert.match(motivo('semdefault'), /export default/);
  assert.match(motivo('campo'), /campo desconhecido: reacao/);
  assert.match(motivo('comando'), /comandos\.x.*executar/);
  assert.match(motivo('nucleo'), /comando board já é do núcleo/);
  assert.match(motivo('recusada'), /configuração recusada: falta a porta/);
  assert.match(motivo('lanca'), /validarConfig falhou: quebrou/);
  assert.match(motivo('trava'), /travas\[0\]\.id/);
  assert.match(motivo('reacao'), /reação desconhecida: depoisDeTudo/);
  assert.match(motivo('vazia'), /não achei/);
  assert.match(motivo('sumida'), /não achei .*sumida/);
  for (const e of r.ligadas.filter(x => !x.carregou)) assert.ok(e.conserto && e.conserto.length > 10, e.nome);
});

test('comando com o nome do de outra extensão: a segunda (em ordem de nome) não carrega', async t => {
  const pp = pastas(t, { a: fonte('comandos: { pinta: { descricao: "x", executar() {} } }'), b: fonte('comandos: { pinta: { descricao: "y", executar() {} } }') });
  const r = await carregar(pp, { a: true, b: true });
  assert.deepEqual(r.ativas.map(e => e.nome), ['a']);
  assert.match(porNome(r, 'b').motivo, /comando pinta já é da extensão a/);
});

test('a carga fica em cache por processo', async t => {
  const pp = pastas(t, { a: fonte() });
  esquecerExtensoes();
  const ambiente = { raiz: pp.raiz, config: aplicarPadroes({ projeto: 'loja', extensoes: { a: true } }) };
  const r1 = await carregarExtensoes(ambiente, { dirNucleo: pp.dirNucleo });
  fs.writeFileSync(path.join(pp.raiz, '.harness', 'extensoes', 'a', 'extensao.mjs'), 'export default {\n');
  const r2 = await carregarExtensoes(ambiente, { dirNucleo: pp.dirNucleo });
  assert.equal(r1, r2);
  esquecerExtensoes();
  const r3 = await carregarExtensoes(ambiente, { dirNucleo: pp.dirNucleo });
  assert.equal(r3.ativas.length, 0);
});

test('configuração: extensoes aceita true, false e objeto, com nome válido', () => {
  assert.ok(validarConfig({ projeto: 'loja', extensoes: { recursos: true, outra: { a: 1 }, desligada: false } }).ok);
  assert.match(validarConfig({ projeto: 'loja', extensoes: { recursos: 'sim' } }).erros[0].motivo, /true, false ou um objeto/);
  assert.match(validarConfig({ projeto: 'loja', extensoes: { Recursos: true } }).erros[0].motivo, /nome de extensão inválido/);
});

// ---------------------------------------------------------------- ctx

test('ctx: frente só de leitura e gravarCampos só nos campos da extensão', async t => {
  const pp = pastas(t, { eco: fonte() });
  const r = await carregar(pp, { eco: { a: 1 } });
  gravarFrente(pp.dirEstado, { esquema: 2, id: 'as-1', nome: 'carrinho', estado: 'ativa', dona: 's1', abertaEm: '2026-11-13T10:00:00-03:00', notas: [], extensoes: { outra: { x: 1 } } });
  const ctx = montarCtx(r.ativas[0], { raiz: pp.raiz, config: aplicarPadroes({ projeto: 'loja' }), dirEstado: pp.dirEstado, sessaoId: 's1', env: {} }, { frente: lerFrente(pp.dirEstado, 'carrinho') });
  assert.equal(ctx.extensao, 'eco');
  assert.deepEqual(ctx.config, { a: 1 });
  assert.equal(ctx.sessaoId, 's1');
  assert.throws(() => { ctx.frente.nome = 'outra'; }, TypeError);
  assert.throws(() => { ctx.frente.extensoes.outra.x = 2; }, TypeError);
  assert.deepEqual(ctx.frentes().map(f => f.nome), ['carrinho']);
  assert.deepEqual(await ctx.gravarCampos('carrinho', { itens: [1], fica: true }), { itens: [1], fica: true });
  assert.deepEqual(await ctx.gravarCampos('carrinho', { itens: undefined }), { fica: true });
  const f = lerFrente(pp.dirEstado, 'carrinho');
  assert.deepEqual(f.extensoes, { outra: { x: 1 }, eco: { fica: true } });
  assert.equal(f.nome, 'carrinho');
  await assert.rejects(ctx.gravarCampos('sumida', { a: 1 }), e => e instanceof ErroDeUso && /Próximo passo: /.test(e.saida));
  await assert.rejects(ctx.gravarCampos('carrinho', 'texto'), TypeError);
  // Com função: recebe a seção atual e as frentes, sob a trava; se lança, nada muda.
  assert.deepEqual(await ctx.gravarCampos('carrinho', (secao, { frentes }) => ({ n: frentes.length, antes: secao.fica })), { fica: true, n: 1, antes: true });
  await assert.rejects(ctx.gravarCampos('carrinho', () => { throw new ErroDeUso('não\nPróximo passo: x'); }), ErroDeUso);
  assert.deepEqual(lerFrente(pp.dirEstado, 'carrinho').extensoes.eco, { fica: true, n: 1, antes: true });
  assert.equal(ctx.ErroDeUso, ErroDeUso);
  assert.equal(typeof ctx.git, 'function');
  assert.equal(typeof ctx.gh, 'function');
});

// ---------------------------------------------------------------- travas (no próprio processo)

const ctxDasTravas = extensoes => ({
  config: aplicarPadroes({}), raiz: '/r', topoDe: () => '/r', ramoAtual: () => 'dev', baseDoPr: () => null, ehRef: () => false, existe: () => false, extensoes,
});
const proibe = palavra => ({ id: 'eco/proibido', avaliar: acao => ((acao.comando ?? acao.arquivo ?? '').includes(palavra) ? { motivo: `usa ${palavra}`, saida: 'faça sem isso' } : null) });

test('travas de extensão: avaliadas depois das do núcleo, com id <extensão>/<id>', () => {
  const ctx = ctxDasTravas([proibe('banana')]);
  const r = avaliar({ tipo: 'comando', comando: 'echo banana', cwd: '/r' }, ctx);
  assert.deepEqual([r.permite, r.trava, r.motivo, r.saida], [false, 'eco/proibido', 'usa banana', 'faça sem isso']);
  assert.equal(avaliar({ tipo: 'comando', comando: 'git push origin main banana', cwd: '/r' }, ctx).trava, 'T5');
  assert.ok(avaliar({ tipo: 'comando', comando: 'echo maçã', cwd: '/r' }, ctx).permite);
  assert.equal(avaliar({ tipo: 'edicao', arquivo: '/r/banana.txt', cwd: '/r' }, ctx).trava, 'eco/proibido');
});

test('travas de extensão: a ação traz os comandos simples lidos', () => {
  let vista;
  avaliar({ tipo: 'comando', comando: 'cd /r && npm test', cwd: '/r' }, ctxDasTravas([{ id: 'x/y', avaliar: a => { vista = a; return null; } }]));
  assert.deepEqual(vista.comandos.map(c => c.argv), [['cd', '/r'], ['npm', 'test']]);
  assert.equal(vista.comando, 'cd /r && npm test');
});

test('travas de extensão: AH_GUARD=off libera; trava que lança recusa com a saída', () => {
  const ctx = ctxDasTravas([proibe('banana')]);
  assert.deepEqual(avaliar({ tipo: 'comando', comando: 'AH_GUARD=off echo banana', cwd: '/r' }, ctx), { permite: true, liberada: 'eco/proibido' });
  assert.deepEqual(avaliar({ tipo: 'comando', comando: 'cd /r && AH_GUARD=off echo banana', cwd: '/r' }, ctx), { permite: true, liberada: 'eco/proibido' });
  assert.equal(avaliar({ tipo: 'comando', comando: 'AH_GUARD=off true; echo banana', cwd: '/r' }, ctx).trava, 'eco/proibido');
  const quebrada = ctxDasTravas([{ id: 'eco/quebrada', avaliar() { throw new Error('falha de propósito'); } }]);
  const r = avaliar({ tipo: 'comando', comando: 'ls', cwd: '/r' }, quebrada);
  assert.equal(r.trava, 'eco/quebrada');
  assert.match(r.motivo, /a trava falhou: falha de propósito/);
  assert.match(r.saida, /corrija a extensão ou desligue-a em \.harness\/config\.json/);
  const promessa = ctxDasTravas([{ id: 'eco/lenta', avaliar: async () => null }]);
  assert.match(avaliar({ tipo: 'comando', comando: 'ls', cwd: '/r' }, promessa).motivo, /síncrona/);
  const semSaida = ctxDasTravas([{ id: 'eco/muda', avaliar: () => ({ motivo: 'não' }) }]);
  assert.ok(avaliar({ tipo: 'comando', comando: 'ls', cwd: '/r' }, semSaida).saida.length > 0);
});

// ---------------------------------------------------------------- resumo

test('resumo: linhas de extensão antes da cauda, cortadas, sem passar do limite', () => {
  const config = aplicarPadroes({ projeto: 'loja' });
  const t = montarResumo({ sessao: { id: 's1' }, config, baseLimpa: true, extensoes: ['Eco: x', 'y'.repeat(500)] });
  const linhas = t.split('\n');
  const i = linhas.indexOf('Eco: x');
  assert.ok(i > 0);
  assert.ok(linhas[i + 1].length <= 200);
  assert.match(linhas[i + 2], /^Base dev/);
  const muitas = montarResumo({ sessao: { id: 's1' }, config, baseLimpa: true, extensoes: Array.from({ length: 20 }, (_, k) => `${k} ${'z'.repeat(190)}`) });
  assert.ok(muitas.length <= LIMITE_RESUMO);
  assert.match(muitas, /Mais: docs\/agents\/sessoes-paralelas\.md/);
});

// ---------------------------------------------------------------- pelo ah (projeto descartável)

// Projeto com a extensão de teste `eco` em .harness/extensoes/eco e ligada com `configEco`, commitado.
function projetoComEco(t, configEco = true) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  fs.cpSync(ECO, path.join(p.raiz, '.harness', 'extensoes', 'eco'), { recursive: true });
  ligar(p, configEco);
  return p;
}
function ligar(p, configEco, nome = 'eco') {
  const arquivo = path.join(p.raiz, '.harness', 'config.json');
  const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  c.extensoes = { ...c.extensoes, [nome]: configEco };
  fs.writeFileSync(arquivo, JSON.stringify(c, null, 2));
  for (const args of [['add', '--', '.harness'], ['commit', '-q', '-m', 'liga a extensão']]) assert.equal(p.git(args).codigo, 0);
}
const log = p => { try { return fs.readFileSync(path.join(dirDoTeste(p), 'eco.log'), 'utf8'); } catch { return ''; } };
const frenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'frentes', `${nome}.json`), 'utf8'));

test('comandos de extensão: despacho, ajuda, recusa e erro', t => {
  const p = projetoComEco(t);
  const r = p.ah(['eco', 'oi', 'mundo']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(r.saida, 'eco: oi mundo\n');
  assert.equal(p.ah(['eco', '--help']).saida, 'ah eco: repete os argumentos\nUso: ah eco <texto>\n');
  const ajuda = p.ah(['--help']).saida;
  assert.match(ajuda, /^Comandos de extensões:$/m);
  assert.match(ajuda, /^ {2}eco +repete os argumentos \(extensão eco\)$/m);
  assert.match(ajuda, /^ {2}board /m);
  const vazio = p.ah(['eco']);
  assert.equal(vazio.codigo, 1);
  assert.match(vazio.erro, /^Recusado: Nada a repetir\.\nFaça: ah eco <texto>\n$/);
  assert.equal(lerEventos(dirDoTeste(p)).at(-1).tipo, 'recusa-de-comando');
  const quebra = p.ah(['eco-quebra']);
  assert.equal(quebra.codigo, 1);
  assert.match(quebra.erro, /^Recusado: a extensão eco falhou no comando eco-quebra: quebrou de propósito\nFaça: corrija a extensão ou desligue-a em \.harness\/config\.json/);
  // Requisitos do núcleo valem: eco-marcar pede sessão.
  assert.match(p.ah(['eco-marcar', 'x', 'y'], { env: { AH_SESSAO: '' } }).erro, /não sei qual é a sessão/);
  // Desligada, o comando não existe.
  ligar(p, false);
  assert.match(p.ah(['eco', 'oi']).erro, /^Recusado: comando desconhecido: eco\nFaça: /);
  assert.doesNotMatch(p.ah(['--help']).saida, /extensões/);
});

test('ciclo: depoisDeAbrir, coluna no quadro, antesDeFechar recusa sem mexer em nada, depoisDeFechar', t => {
  const p = projetoComEco(t);
  // Com ticket: a recusa tem de vir antes do comentário de fechamento e da edição do ticket.
  assert.equal(p.ah(['open', 'carrinho', '--tickets', '1']).codigo, 0);
  assert.equal(log(p), 'depoisDeAbrir carrinho\n');
  assert.deepEqual(frenteDoTeste(p, 'carrinho').extensoes, { eco: { aberta: true } });
  assert.match(p.ah(['eco', 'x']).saida, /\(frente carrinho\)/);

  const m = p.ah(['eco-marcar', 'carrinho', 'presa']);
  assert.equal(m.codigo, 0, m.erro);
  const board = p.ah(['board']).saida;
  assert.match(board, /^ID .* ECO$/m);
  assert.match(board, /^as-1 .* presa$/m);
  const json = JSON.parse(p.ah(['board', '--json']).saida);
  assert.deepEqual(json.frentes[0].colunas, { eco: { ECO: 'presa' } });

  const wt = frenteDoTeste(p, 'carrinho').worktree;
  const antes = p.ghChamadas().length;
  const ticketAntes = p.ghTicket(1);
  const recusa = p.ah(['close']);
  assert.equal(recusa.codigo, 1);
  assert.match(recusa.erro, /^Recusado: a extensão eco não deixa fechar a frente as-1 carrinho: a frente está presa pelo eco\nFaça: rode ah eco-marcar carrinho solta\n$/);
  assert.ok(fs.existsSync(wt));
  assert.equal(frenteDoTeste(p, 'carrinho').estado, 'ativa');
  assert.equal(frenteDoTeste(p, 'carrinho').fechamentoComentado, undefined);
  assert.ok(!lerEventos(dirDoTeste(p)).some(e => e.tipo === 'fechamento'));
  const noTicket = p.ghChamadas().slice(antes).filter(c => c.argv[0] === 'issue' && ['comment', 'edit'].includes(c.argv[1]));
  assert.deepEqual(noTicket, [], 'a recusa veio depois de mexer no ticket');
  assert.deepEqual(p.ghTicket(1), ticketAntes);

  assert.equal(p.ah(['eco-marcar', 'carrinho', 'solta']).codigo, 0);
  const c = p.ah(['close']);
  assert.equal(c.codigo, 0, c.erro);
  assert.equal(log(p), 'depoisDeAbrir carrinho\nantesDeFechar carrinho\nantesDeFechar carrinho\ndepoisDeFechar carrinho\n');
});

test('close da abertura desfeita: antesDeFechar pode recusar sem mexer em nada; depoisDeFechar roda', t => {
  const p = projetoComEco(t);
  // Registro `abrindo` de um open que morreu (processo que não existe), da própria sessão, com ticket.
  const dir = path.join(dirDoTeste(p), 'frentes');
  fs.mkdirSync(dir, { recursive: true });
  const abrindo = {
    esquema: 2, id: 'as-7', nome: 'carrinho', ramo: 'feat/carrinho', worktree: path.join(p.env.AH_WORKTREES, 'carrinho'),
    tickets: [1], plano: null, caminhos: [], dona: 'sessao-teste-0001', abertaPor: 'ana-souza', abertaEm: '2026-11-13T10:00:00-03:00',
    estado: 'abrindo', notas: [], reserva: { logins: ['ana-souza'], tickets: [1] }, processo: { pid: 2 ** 22 + 12345, inicio: null },
    extensoes: { eco: { marca: 'presa' } },
  };
  fs.writeFileSync(path.join(dir, 'carrinho.json'), JSON.stringify(abrindo));
  p.ghSemear(1, { assignees: ['ana-souza'], labels: ['em-andamento'], comments: [] });
  const antes = p.ghChamadas().length;
  const recusa = p.ah(['close', 'carrinho']);
  assert.equal(recusa.codigo, 1);
  assert.match(recusa.erro, /^Recusado: a extensão eco não deixa fechar a frente as-7 carrinho: a frente está presa pelo eco\nFaça: rode ah eco-marcar carrinho solta\n$/);
  assert.equal(frenteDoTeste(p, 'carrinho').estado, 'abrindo');
  const noTicket = p.ghChamadas().slice(antes).filter(c => c.argv[0] === 'issue' && c.argv[1] === 'edit');
  assert.deepEqual(noTicket, [], 'a recusa veio depois de mexer no ticket');
  assert.equal(log(p), 'antesDeFechar carrinho\n');

  assert.equal(p.ah(['eco-marcar', 'carrinho', 'solta']).codigo, 0);
  const c = p.ah(['close', 'carrinho']);
  assert.equal(c.codigo, 0, c.erro);
  assert.match(c.saida, /Abertura de as-7 carrinho desfeita/);
  assert.equal(log(p), 'antesDeFechar carrinho\nantesDeFechar carrinho\ndepoisDeFechar carrinho (abertura desfeita)\n');
});

test('antesDeFechar que lança recusa o fechamento; reação que lança vira aviso', t => {
  const p = projetoComEco(t, { fecharLanca: true, passarLanca: true });
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const c = p.ah(['close']);
  assert.equal(c.codigo, 1);
  assert.match(c.erro, /^Recusado: a extensão eco falhou em antesDeFechar: antesDeFechar quebrado\nFaça: corrija a extensão ou desligue-a em \.harness\/config\.json/);
  const h = p.ah(['handoff']);
  assert.equal(h.codigo, 0, h.erro);
  assert.match(h.erro, /^Aviso: extensão eco falhou em aoPassar: aoPassar quebrado$/m);
  assert.match(h.saida, /Frente as-1 carrinho passada\./);
  assert.match(log(p), /aoPassar carrinho/);
  assert.equal(frenteDoTeste(p, 'carrinho').estado, 'passada');
  const o = p.ah(['open', 'carrinho']);
  assert.equal(o.codigo, 0, o.erro);
  assert.match(log(p), /depoisDeAbrir carrinho \(retomada\)/);
});

test('sweep mostra as linhas da extensão e diz o modo', t => {
  const p = projetoComEco(t);
  assert.match(p.ah(['sweep']).saida, /^- eco: eco conferiu$/m);
  assert.match(p.ah(['sweep', '--reparar']).saida, /^- eco: eco reparou$/m);
  assert.deepEqual(JSON.parse(p.ah(['sweep', '--json']).saida).extensoes, { eco: ['eco conferiu'] });
});

test('doctor: item Extensões, verificações da extensão e extensão quebrada', t => {
  const p = projetoComEco(t, { doctor: { estado: 'aviso', detalhe: 'eco desafinado', conserto: 'afine o eco' }, doctorLanca: true });
  const r = p.ah(['doctor']);
  assert.match(r.saida, /^ok\s+Extensão eco \(projeto\)$/m);
  assert.match(r.saida, /^aviso\s+Eco em ordem \(eco\): eco desafinado; afine o eco$/m);
  assert.match(r.saida, /^FALHOU\s+Eco que lança \(eco\): verificação quebrada; corrija a extensão ou desligue-a em \.harness\/config\.json$/m);
  // Verificações vêm depois dos itens do núcleo.
  assert.ok(r.saida.indexOf('Extensão eco') > r.saida.indexOf('Node 22'));

  fs.mkdirSync(path.join(p.raiz, '.harness', 'extensoes', 'torta'));
  fs.writeFileSync(path.join(p.raiz, '.harness', 'extensoes', 'torta', 'extensao.mjs'), 'export default { versaoDaInterface: 9, descricao: "x" };\n');
  ligar(p, true, 'torta');
  const d = p.ah(['doctor']);
  assert.equal(d.codigo, 1);
  assert.match(d.saida, /^FALHOU\s+Extensão torta: versão 9 da interface; o núcleo espera a 1; .+$/m);
  // Os comandos do núcleo seguem, com um aviso.
  const b = p.ah(['board']);
  assert.equal(b.codigo, 0, b.erro);
  assert.match(b.erro, /^Aviso: a extensão torta não carregou \(versão 9 .*\); rode ah doctor\.$/m);
  assert.equal(p.ah(['eco', 'oi']).codigo, 0);
});

test('doctor sem extensão ligada: item Extensões ok', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  assert.match(p.ah(['doctor']).saida, /^ok\s+Extensões \(nenhuma ligada\)$/m);
});

test('gancho: trava de extensão recusa e registra; extensão quebrada não desliga as travas do núcleo', t => {
  const p = projetoComEco(t, { proibido: 'banana' });
  const r = ganchoPre(p, { command: 'echo banana' });
  assert.equal(r.codigo, 2);
  assert.match(r.erro, /^Recusado \(eco\/proibido\): a ação usa banana\nFaça: faça sem isso/);
  const ev = lerEventos(dirDoTeste(p)).at(-1);
  assert.deepEqual([ev.tipo, ev.trava, ev.extensao], ['recusa', 'eco/proibido', 'eco']);
  const nAntes = lerEventos(dirDoTeste(p)).length;
  assert.equal(ganchoPre(p, { command: 'AH_GUARD=off echo banana' }).codigo, 0);
  // O evento da liberação, e não a recusa de antes: tipo, trava e extensão.
  const lib = lerEventos(dirDoTeste(p)).slice(nAntes).filter(e => e.tipo === 'liberacao');
  assert.deepEqual(lib.map(e => [e.tipo, e.trava, e.extensao]), [['liberacao', 'eco/proibido', 'eco']]);
  const q = ganchoPre(p, { command: 'echo quebra-trava' });
  assert.equal(q.codigo, 2);
  assert.match(q.erro, /Recusado \(eco\/quebrada\): a trava falhou: falha de propósito/);
  const e = ganchoPre(p, { file_path: path.join(p.raiz, 'banana.txt'), content: 'x' }, 'Write');
  assert.equal(e.codigo, 2);

  fs.writeFileSync(path.join(p.raiz, '.harness', 'extensoes', 'eco', 'extensao.mjs'), 'export default {\n');
  assert.equal(ganchoPre(p, { command: 'echo banana' }).codigo, 0);
  const t5 = ganchoPre(p, { command: 'git push origin main' });
  assert.equal(t5.codigo, 2);
  assert.match(t5.erro, /Recusado \(T5\)/);
});

test('resumo do começo de sessão traz até duas linhas da extensão', async t => {
  const p = projetoComEco(t);
  esquecerExtensoes();
  const r = await tratar({ tipo: 'inicio', sessao: 's1', agente: 'claude-code', cwd: p.raiz, origem: 'novo' }, ambDoTeste(p));
  assert.match(r.contexto, /^Eco: sem frente$/m);
  assert.match(r.contexto, /^segunda linha$/m);
  assert.doesNotMatch(r.contexto, /terceira/);
  assert.ok(r.contexto.indexOf('segunda linha') < r.contexto.indexOf('Base dev'));
});
