// Extensão ambiente: portas, banco e arquivo de ambiente por frente, na abertura e no fechamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarParaTeste, ctxFalso, projetoDeTeste } from '../nucleo/lib/extensoes-teste.mjs';
import { escolherPortas } from '../nucleo/extensoes/ambiente/portas.mjs';
import { ignorados } from '../nucleo/extensoes/ambiente/extensao.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const EXTENSAO = path.join(AQUI, '..', 'nucleo', 'extensoes', 'ambiente', 'extensao.mjs');
const FALSO = path.join(AQUI, 'ambiente-banco-falso.mjs');
const B = { env: { AH_SESSAO: 'sessao-b-0002' } };
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };

// Uma porta livre agora, como começo de faixa: o sistema escolhe (listen 0) e a devolve.
async function portaLivre() {
  const s = net.createServer();
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise(r => s.close(r));
  return port;
}
async function escutar(porta) {
  const s = net.createServer();
  await new Promise(r => s.listen(porta, '127.0.0.1', r));
  return s;
}
function pastaDeBancos(t) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'ambiente-bancos-'));
  t.after(() => fs.rmSync(p, { recursive: true, force: true }));
  return p;
}
const configCom = (de, ate, bancos, extra = {}) => ({
  portas: { faixa: [de, ate], chaves: ['PORTA_WEB', 'PORTA_API'] },
  banco: {
    nome: 'loja_{frente}', chave: 'BANCO',
    criar: ['node', FALSO, 'criar', bancos, '{banco}'],
    apagar: ['node', FALSO, 'apagar', bancos, '{banco}'],
  },
  ...extra,
});
function novoProjeto(t, config) {
  const p = projetoDeTeste({ extensoes: { ambiente: config } });
  t.after(() => p.limpar());
  return p;
}
const arquivoDe = (p, nome) => fs.readFileSync(path.join(p.frente(nome).worktree, '.env.frente'), 'utf8');
const existeBanco = (bancos, nome) => fs.existsSync(path.join(bancos, nome));

test('escolherPortas: as menores livres, null quando não cabem', () => {
  assert.deepEqual(escolherPortas([4100, 4105], 2, new Set([4100, 4102])), [4101, 4103]);
  assert.equal(escolherPortas([4100, 4101], 2, new Set([4101])), null);
  assert.deepEqual(escolherPortas([4100, 4100], 1, new Set()), [4100]);
});

test('abrir reserva portas, cria o banco e escreve o arquivo; o quadro mostra', async t => {
  const de = await portaLivre();
  const bancos = pastaDeBancos(t);
  const p = novoProjeto(t, configCom(de, de + 19, bancos));
  ok(p.ah(['open', 'carrinho']));
  const texto = arquivoDe(p, 'carrinho');
  assert.match(texto, /^# gerado por ah ambiente/);
  assert.match(texto, new RegExp(`^PORTA_WEB=${de}$`, 'm'));
  assert.match(texto, new RegExp(`^PORTA_API=${de + 1}$`, 'm'));
  assert.match(texto, /^BANCO=loja_carrinho$/m);
  assert.ok(existeBanco(bancos, 'loja_carrinho'));
  assert.deepEqual(p.frente('carrinho').extensoes.ambiente.banco, { nome: 'loja_carrinho', criado: true });
  assert.match(ok(p.ah(['board'])).saida, new RegExp(`${de} ${de + 1} loja_carrinho`));
  assert.match(ok(p.ah(['ambiente'])).saida, new RegExp(`PORTA_WEB=${de}`));
});

test('duas frentes não dividem porta, e as fixas e as em uso ficam de fora', async t => {
  const de = await portaLivre();
  const bancos = pastaDeBancos(t);
  const p = novoProjeto(t, configCom(de, de + 19, bancos, { fixos: { portas: [de] } }));
  const servidor = await escutar(de + 1);
  t.after(() => servidor.close());
  ok(p.ah(['open', 'carrinho']));
  ok(p.ah(['open', 'cupom'], B));
  assert.deepEqual(p.frente('carrinho').extensoes.ambiente.portas, { PORTA_WEB: de + 2, PORTA_API: de + 3 });
  assert.deepEqual(p.frente('cupom').extensoes.ambiente.portas, { PORTA_WEB: de + 4, PORTA_API: de + 5 });
});

test('faixa esgotada avisa e o open segue', async t => {
  const de = await portaLivre();
  const p = novoProjeto(t, { portas: { faixa: [de, de], chaves: ['PORTA_WEB', 'PORTA_API'] } });
  const r = ok(p.ah(['open', 'carrinho']));
  assert.match(r.erro, /aumente extensoes\.ambiente\.portas\.faixa/);
  assert.equal(p.frente('carrinho').extensoes?.ambiente?.portas, undefined);
});

test('banco que falha avisa, e ah ambiente preparar tenta de novo', async t => {
  const de = await portaLivre();
  const bancos = pastaDeBancos(t);
  const p = novoProjeto(t, configCom(de, de + 19, bancos));
  const r = ok(p.ah(['open', 'carrinho'], { env: { BANCO_FALSO_FALHA: '1' } }));
  assert.match(r.erro, /não consegui criar o banco loja_carrinho/);
  assert.match(r.erro, /rode ah ambiente preparar/);
  assert.equal(p.frente('carrinho').extensoes.ambiente.banco.criado, false);
  ok(p.ah(['ambiente', 'preparar']));
  assert.equal(p.frente('carrinho').extensoes.ambiente.banco.criado, true);
  assert.ok(existeBanco(bancos, 'loja_carrinho'));
});

test('desfazer apaga o banco, o arquivo e as portas; o close passa e a porta volta à faixa', async t => {
  const de = await portaLivre();
  const bancos = pastaDeBancos(t);
  const p = novoProjeto(t, configCom(de, de + 19, bancos));
  ok(p.ah(['open', 'carrinho']));
  const wt = p.frente('carrinho').worktree;
  ok(p.ah(['ambiente', 'desfazer']));
  assert.ok(!existeBanco(bancos, 'loja_carrinho'));
  assert.ok(!fs.existsSync(path.join(wt, '.env.frente')));
  assert.equal(p.frente('carrinho').extensoes.ambiente.portas, undefined);
  ok(p.ah(['close']));
  ok(p.ah(['open', 'cupom']));
  assert.equal(p.frente('cupom').extensoes.ambiente.portas.PORTA_WEB, de);
});

test('fechar com o banco ainda criado apaga no depoisDeFechar', async t => {
  const de = await portaLivre();
  const bancos = pastaDeBancos(t);
  const p = novoProjeto(t, configCom(de, de + 19, bancos));
  ok(p.ah(['open', 'carrinho']));
  // Até a P5 entrar, o arquivo de ambiente no worktree trava o close; aqui ele sai à mão.
  fs.rmSync(path.join(p.frente('carrinho').worktree, '.env.frente'));
  ok(p.ah(['close']));
  assert.ok(!existeBanco(bancos, 'loja_carrinho'));
});

test('banco fixo nunca é apagado no fechamento', async t => {
  const bancos = pastaDeBancos(t);
  fs.writeFileSync(path.join(bancos, 'loja'), '');
  const config = configCom(4100, 4119, bancos, { fixos: { bancos: ['loja'] } });
  const def = await carregarParaTeste(EXTENSAO, config);
  const frente = { id: 'as-1', nome: 'carrinho', extensoes: { ambiente: { banco: { nome: 'loja', criado: true } } } };
  const ctx = ctxFalso({ extensao: 'ambiente', config, frente });
  await def.reacoes.depoisDeFechar(ctx);
  assert.ok(existeBanco(bancos, 'loja'));
});

test('ignorados: o arquivo de ambiente é descartável (para a P5 do close)', () => {
  assert.deepEqual(ignorados(ctxFalso({ extensao: 'ambiente', config: { arquivo: '.env.local', portas: { faixa: [4100, 4119], chaves: ['PORTA'] } } })),
    [{ caminho: '.env.local', descartavel: true }]);
  assert.deepEqual(ignorados(ctxFalso({ extensao: 'ambiente', config: { portas: { faixa: [4100, 4119], chaves: ['PORTA'] } } })),
    [{ caminho: '.env.frente', descartavel: true }]);
});

test('configuração inválida não carrega', async () => {
  await assert.rejects(() => carregarParaTeste(EXTENSAO, {}), /portas ou banco/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { portas: { faixa: [4200, 4100], chaves: ['P'] } }), /faixa/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { banco: { nome: 'loja_{frente}', chave: 'BANCO', criar: 'createdb', apagar: ['dropdb'] } }), /criar/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { portas: { faixa: [4100, 4119], chaves: ['P'] }, arquivo: '../fora.env' }), /arquivo/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { banco: { nome: 'loja', chave: 'BANCO', criar: ['c'], apagar: ['a'] }, fixos: { bancos: ['loja'] } }), /fixo/);
});
