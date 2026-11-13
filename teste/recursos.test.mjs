import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, dirDoTeste, envelhecerSinal } from './apoio/repo.mjs';
import { arquivosDaCopia } from '../nucleo/lib/copia.mjs';
import { fileURLToPath } from 'node:url';

const RAIZ_HARNESS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = { env: { AH_SESSAO: 'sessao-b-0002' } };
const arquivoDaFrente = (p, nome) => path.join(dirDoTeste(p), 'frentes', `${nome}.json`);
const frenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(arquivoDaFrente(p, nome), 'utf8'));

// Projeto com a extensão recursos ligada (`config`: true ou a seção dela), commitado.
function projeto(t, config = true) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const arquivo = path.join(p.raiz, '.harness', 'config.json');
  const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  c.extensoes = { recursos: config };
  fs.writeFileSync(arquivo, JSON.stringify(c, null, 2));
  for (const args of [['add', '--', '.harness/config.json'], ['commit', '-q', '-m', 'liga recursos']]) assert.equal(p.git(args).codigo, 0);
  return p;
}
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };

test('reservar, listar e liberar; a coluna RECURSOS no quadro', t => {
  const p = projeto(t);
  // O init leva a extensão para a cópia instalada.
  assert.ok(fs.existsSync(path.join(p.raiz, '.harness', 'nucleo', 'extensoes', 'recursos', 'extensao.mjs')));
  ok(p.ah(['open', 'carrinho']));
  assert.equal(ok(p.ah(['recursos', 'reservar', 'porta', '3001'])).saida, 'Reservado: porta 3001 para a frente as-1 carrinho.\n');
  ok(p.ah(['recursos', 'reservar', 'banco', 'loja_carrinho']));
  assert.match(ok(p.ah(['recursos', 'reservar', 'porta', '3001'])).saida, /já estava reservado para esta frente/);
  assert.deepEqual(frenteDoTeste(p, 'carrinho').extensoes.recursos.itens.map(i => [i.tipo, i.valor]), [['porta', '3001'], ['banco', 'loja_carrinho']]);
  assert.equal(ok(p.ah(['recursos', 'listar'])).saida, 'as-1 carrinho: porta 3001, banco loja_carrinho\n');
  const json = JSON.parse(ok(p.ah(['recursos', 'listar', '--json'])).saida);
  assert.deepEqual(json.recursos.map(r => [r.id, r.frente, r.tipo, r.valor]), [['as-1', 'carrinho', 'porta', '3001'], ['as-1', 'carrinho', 'banco', 'loja_carrinho']]);
  assert.match(ok(p.ah(['board'])).saida, /^as-1 .* porta 3001, banco loja_carrin…$/m);
  assert.deepEqual(JSON.parse(ok(p.ah(['board', '--json'])).saida).frentes[0].colunas, { recursos: { RECURSOS: 'porta 3001, banco loja_carrin…' } });

  assert.equal(ok(p.ah(['recursos', 'liberar', 'porta', '3001'])).saida, 'Liberado: porta 3001 da frente as-1 carrinho.\n');
  const nao = p.ah(['recursos', 'liberar', 'porta', '3001']);
  assert.equal(nao.codigo, 1);
  assert.match(nao.erro, /^Recusado: porta 3001 não está reservado pela frente as-1 carrinho\.\nFaça: ah recursos listar/);
  assert.equal(ok(p.ah(['recursos', 'liberar', '--todos'])).saida, 'Liberados 1 recurso(s) da frente as-1 carrinho.\n');
  assert.equal(ok(p.ah(['recursos', 'listar'])).saida, 'Nenhum recurso reservado.\n');
});

test('reservar recusa o valor de outra frente e diz qual é', t => {
  const p = projeto(t);
  ok(p.ah(['open', 'carrinho']));
  ok(p.ah(['recursos', 'reservar', 'porta', '3001']));
  ok(p.ah(['open', 'frete'], B));
  const r = p.ah(['recursos', 'reservar', 'porta', '3001'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: porta 3001 já está reservado pela frente as-1 carrinho\.\nFaça: escolha outro valor \(ah recursos listar mostra os reservados\) ou combine com a dona da frente carrinho\n$/);
  ok(p.ah(['recursos', 'reservar', 'porta', '3002'], B));
});

test('recusas de uso: sem frente, tipo fora da configuração, argumentos errados', t => {
  const p = projeto(t, { tipos: ['porta'] });
  const sem = p.ah(['recursos', 'reservar', 'porta', '3001']);
  assert.match(sem.erro, /^Recusado: Esta sessão não tem frente\.\nFaça: abra uma com ah open <nome>, ou diga qual com --frente <nome>\n$/);
  ok(p.ah(['open', 'carrinho']));
  assert.match(p.ah(['recursos', 'reservar', 'banco', 'x']).erro, /^Recusado: Tipo banco fora de extensoes\.recursos\.tipos \(porta\)\.\nFaça: use um desses tipos ou acrescente banco em \.harness\/config\.json\n$/);
  for (const args of [['recursos'], ['recursos', 'pintar'], ['recursos', 'reservar', 'porta'], ['recursos', 'reservar', 'Porta', '1'], ['recursos', 'reservar', 'porta', 'a b'], ['recursos', 'listar', '--xml']]) {
    const r = p.ah(args);
    assert.equal(r.codigo, 1, args.join(' '));
    assert.match(r.erro, /^Recusado: .+\nFaça: .+/, args.join(' '));
  }
  assert.match(p.ah(['recursos', '--help']).saida, /^ah recursos: .+\nUso: ah recursos reservar <tipo> <valor>/);
});

test('configuração inválida: a extensão não carrega, o doctor acusa e o núcleo segue', t => {
  const p = projeto(t, { tipos: 'porta' });
  const d = p.ah(['doctor']);
  assert.match(d.saida, /^FALHOU\s+Extensão recursos: configuração recusada: tipos deve ser uma lista .+; corrija extensoes\.recursos em \.harness\/config\.json$/m);
  const b = p.ah(['board']);
  assert.equal(b.codigo, 0);
  assert.match(b.erro, /Aviso: a extensão recursos não carregou/);
});

test('close recusa com recursos reservados e passa depois de liberar', t => {
  const p = projeto(t);
  ok(p.ah(['open', 'carrinho']));
  ok(p.ah(['recursos', 'reservar', 'porta', '3001']));
  const r = p.ah(['close']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: a extensão recursos não deixa fechar a frente as-1 carrinho: a frente ainda tem recursos reservados: porta 3001\nFaça: libere com ah recursos liberar --todos --frente carrinho e rode ah close de novo\n$/);
  assert.ok(fs.existsSync(frenteDoTeste(p, 'carrinho').worktree));
  ok(p.ah(['recursos', 'liberar', '--todos', '--frente', 'carrinho']));
  ok(p.ah(['close']));
});

test('--frente não mexe em frente ativa de outra sessão viva; aceita a passada, a órfã e a da própria sessão', t => {
  const p = projeto(t);
  ok(p.ah(['open', 'carrinho']));
  ok(p.ah(['open', 'frete'], B));
  ok(p.ah(['recursos', 'reservar', 'porta', '3002'], B));
  const viva = /^Recusado: A frente as-2 frete é da sessão sessao-b-0002, que está viva\.\nFaça: peça à sessão dona \(sessao-b-0002\) que reserve ou libere ela mesma; com a sessão morta \(frente órfã\) ou a frente passada, o --frente vale\n$/;
  for (const args of [['reservar', 'porta', '3001'], ['liberar', 'porta', '3002'], ['liberar', '--todos']]) {
    const r = p.ah(['recursos', ...args, '--frente', 'frete']);
    assert.equal(r.codigo, 1, args.join(' '));
    assert.match(r.erro, viva, args.join(' '));
  }
  assert.deepEqual(frenteDoTeste(p, 'frete').extensoes.recursos.itens.map(i => i.valor), ['3002']);
  // a da própria sessão, por nome
  ok(p.ah(['recursos', 'reservar', 'porta', '3001', '--frente', 'carrinho']));
  // a órfã (dona com o sinal vencido)
  envelhecerSinal(p, 'sessao-b-0002', 24 * 60);
  ok(p.ah(['recursos', 'liberar', 'porta', '3002', '--frente', 'frete']));
});

test('--frente aceita a frente passada de outra sessão viva', t => {
  const p = projeto(t);
  ok(p.ah(['open', 'frete'], B));
  ok(p.ah(['recursos', 'reservar', 'porta', '3002'], B));
  ok(p.ah(['handoff'], B));
  ok(p.ah(['recursos', 'liberar', '--todos', '--frente', 'frete']));
  assert.deepEqual(frenteDoTeste(p, 'frete').extensoes.recursos.itens, []);
});

test('handoff mantém a reserva: a frente passada segue dona dos recursos', t => {
  const p = projeto(t);
  ok(p.ah(['open', 'carrinho']));
  ok(p.ah(['recursos', 'reservar', 'porta', '3001']));
  ok(p.ah(['handoff']));
  assert.equal(frenteDoTeste(p, 'carrinho').estado, 'passada');
  assert.equal(frenteDoTeste(p, 'carrinho').extensoes.recursos.itens.length, 1);
  ok(p.ah(['open', 'frete'], B));
  assert.match(p.ah(['recursos', 'reservar', 'porta', '3001'], B).erro, /já está reservado pela frente as-1 carrinho/);
});

test('doctor: Recursos sem conflito; estado editado à mão com o mesmo valor em duas frentes é acusado', t => {
  const p = projeto(t);
  ok(p.ah(['open', 'carrinho']));
  ok(p.ah(['open', 'frete'], B));
  ok(p.ah(['recursos', 'reservar', 'porta', '3001']));
  assert.match(p.ah(['doctor']).saida, /^ok\s+Extensão recursos \(harness\)$/m);
  assert.match(p.ah(['doctor']).saida, /^ok\s+Recursos sem conflito \(recursos\)$/m);
  const f = frenteDoTeste(p, 'frete');
  f.extensoes = { recursos: { itens: [{ tipo: 'porta', valor: '3001', em: '2026-11-13T10:00:00.000Z' }] } };
  fs.writeFileSync(arquivoDaFrente(p, 'frete'), JSON.stringify(f, null, 2));
  const d = p.ah(['doctor']);
  assert.equal(d.codigo, 1);
  assert.match(d.saida, /^FALHOU\s+Recursos sem conflito \(recursos\): porta 3001 em as-1 carrinho e as-2 frete; libere numa delas: ah recursos liberar porta 3001 --frente <nome>$/m);
});

test('extensão do projeto com o nome recursos sombreia a do harness e o doctor avisa', t => {
  const p = projeto(t);
  const dir = path.join(p.raiz, '.harness', 'extensoes', 'recursos');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'extensao.mjs'), 'export default { versaoDaInterface: 1, descricao: "outra" };\n');
  assert.match(p.ah(['doctor']).saida, /^aviso\s+Extensão recursos \(projeto\): a extensão recursos de \.harness\/extensoes\/ sombreia a que acompanha o harness/m);
  assert.match(p.ah(['recursos', 'listar']).erro, /comando desconhecido: recursos/);
});

test('a cópia do núcleo leva nucleo/extensoes/ e nucleo/lib/extensoes-teste.mjs', () => {
  const rels = arquivosDaCopia(RAIZ_HARNESS).arquivos.map(a => a.rel);
  assert.ok(rels.includes('extensoes/recursos/extensao.mjs'));
  assert.ok(rels.includes('lib/extensoes-teste.mjs'));
  assert.ok(rels.includes('lib/extensoes.mjs'));
});
