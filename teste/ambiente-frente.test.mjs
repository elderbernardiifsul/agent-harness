// Extensão ambiente: portas, banco e arquivo de ambiente por frente, na abertura e no fechamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarParaTeste, ctxFalso, projetoDeTeste } from '../nucleo/lib/extensoes-teste.mjs';
import { escolherPortas } from '../nucleo/extensoes/ambiente/portas.mjs';

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
// Projeto com a ambiente ligada e, salvo `ignorar: false`, o arquivo de ambiente no .gitignore (commitado na dev).
function novoProjeto(t, config, { ignorar = true } = {}) {
  const p = projetoDeTeste({ extensoes: { ambiente: config } });
  t.after(() => p.limpar());
  if (ignorar) {
    fs.appendFileSync(path.join(p.raiz, '.gitignore'), `${config.arquivo ?? '.env.frente'}\n`);
    assert.equal(p.git(['commit', '-q', '-am', 'ignora o arquivo de ambiente']).codigo, 0);
  }
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
  const { PORTA_WEB, PORTA_API } = p.frente('carrinho').extensoes.ambiente.portas;
  assert.ok(de <= PORTA_WEB && PORTA_WEB < PORTA_API && PORTA_API <= de + 19);
  assert.match(texto, /^# gerado por ah ambiente/);
  assert.match(texto, new RegExp(`^PORTA_WEB=${PORTA_WEB}$`, 'm'));
  assert.match(texto, new RegExp(`^PORTA_API=${PORTA_API}$`, 'm'));
  assert.match(texto, /^BANCO=loja_carrinho$/m);
  assert.ok(existeBanco(bancos, 'loja_carrinho'));
  assert.deepEqual(p.frente('carrinho').extensoes.ambiente.banco, { nome: 'loja_carrinho', criado: true, maquina: os.hostname() });
  assert.match(ok(p.ah(['board'])).saida, new RegExp(`${PORTA_WEB} ${PORTA_API} loja_carrinho`));
  assert.match(ok(p.ah(['ambiente'])).saida, new RegExp(`PORTA_WEB=${PORTA_WEB}`));
});

test('duas frentes não dividem porta, e as fixas e as em uso ficam de fora', async t => {
  const de = await portaLivre();
  const bancos = pastaDeBancos(t);
  const p = novoProjeto(t, configCom(de, de + 19, bancos, { fixos: { portas: [de] } }));
  const servidor = await escutar(de + 1);
  t.after(() => servidor.close());
  ok(p.ah(['open', 'carrinho']));
  ok(p.ah(['open', 'cupom'], B));
  // Números exatos não: outro processo da máquina pode ocupar uma porta da faixa durante o teste.
  const carrinho = Object.values(p.frente('carrinho').extensoes.ambiente.portas);
  const cupom = Object.values(p.frente('cupom').extensoes.ambiente.portas);
  for (const porta of [...carrinho, ...cupom]) {
    assert.ok(porta > de + 1 && porta <= de + 19, `porta ${porta} fora da faixa ou fixa/em uso`);
  }
  assert.equal(new Set([...carrinho, ...cupom]).size, 4, 'as duas frentes não dividem porta');
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
  assert.doesNotMatch(arquivoDe(p, 'carrinho'), /BANCO=/, 'sem banco criado, o arquivo não aponta para ele');
  ok(p.ah(['ambiente', 'preparar']));
  assert.equal(p.frente('carrinho').extensoes.ambiente.banco.criado, true);
  assert.ok(existeBanco(bancos, 'loja_carrinho'));
  assert.match(arquivoDe(p, 'carrinho'), /^BANCO=loja_carrinho$/m);
});

test('desfazer apaga o banco, o arquivo e as portas; o close passa e a porta volta à faixa', async t => {
  const de = await portaLivre();
  const bancos = pastaDeBancos(t);
  const p = novoProjeto(t, configCom(de, de + 19, bancos));
  ok(p.ah(['open', 'carrinho']));
  const wt = p.frente('carrinho').worktree;
  const porta = p.frente('carrinho').extensoes.ambiente.portas.PORTA_WEB;
  ok(p.ah(['ambiente', 'desfazer']));
  assert.ok(!existeBanco(bancos, 'loja_carrinho'));
  assert.ok(!fs.existsSync(path.join(wt, '.env.frente')));
  assert.equal(p.frente('carrinho').extensoes.ambiente.portas, undefined);
  ok(p.ah(['close']));
  ok(p.ah(['open', 'cupom']));
  assert.equal(p.frente('cupom').extensoes.ambiente.portas.PORTA_WEB, porta);
});

test('o close passa com o arquivo de ambiente no worktree (descartável) e apaga o banco', async t => {
  const de = await portaLivre();
  const bancos = pastaDeBancos(t);
  const p = novoProjeto(t, configCom(de, de + 19, bancos));
  ok(p.ah(['open', 'carrinho']));
  assert.ok(fs.existsSync(path.join(p.frente('carrinho').worktree, '.env.frente')));
  ok(p.ah(['close']));
  assert.ok(!existeBanco(bancos, 'loja_carrinho'));
});

test('arquivo de ambiente fora do .gitignore: o open avisa com o conserto', async t => {
  const de = await portaLivre();
  const p = novoProjeto(t, { portas: { faixa: [de, de + 9], chaves: ['PORTA_WEB'] } }, { ignorar: false });
  const r = ok(p.ah(['open', 'carrinho']));
  assert.match(r.erro, /\.env\.frente não está no \.gitignore; Faça: acrescente \.env\.frente ao \.gitignore e commite/);
});

test('porta escutando em ::1 (localhost em IPv6) não vai para a frente', async t => {
  const de = await portaLivre();
  const s = net.createServer();
  const ipv6 = await new Promise(r => { s.once('error', () => r(false)); s.listen(de, '::1', () => r(true)); });
  if (!ipv6) return t.skip('sem IPv6 nesta máquina');
  t.after(() => s.close());
  const p = novoProjeto(t, { portas: { faixa: [de, de + 9], chaves: ['PORTA_WEB'] } });
  ok(p.ah(['open', 'carrinho']));
  assert.notEqual(p.frente('carrinho').extensoes.ambiente.portas.PORTA_WEB, de);
});

test('arquivo que o ah ambiente não gerou não é sobrescrito nem apagado', async t => {
  const de = await portaLivre();
  const p = novoProjeto(t, { arquivo: '.env', portas: { faixa: [de, de + 9], chaves: ['PORTA_WEB'] } });
  ok(p.ah(['open', 'carrinho']));
  const arquivo = path.join(p.frente('carrinho').worktree, '.env');
  fs.writeFileSync(arquivo, 'CHAVE_DA_API=da-ana\n');
  const r = p.ah(['ambiente', 'preparar']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /\.env já existe e não foi gerado pelo ah ambiente; Faça: use outro extensoes\.ambiente\.arquivo ou apague o arquivo à mão/);
  assert.equal(fs.readFileSync(arquivo, 'utf8'), 'CHAVE_DA_API=da-ana\n');
  assert.match(ok(p.ah(['ambiente', 'desfazer'])).saida, /\.env não foi removido \(não foi gerado pelo ah ambiente\)/);
  assert.equal(fs.readFileSync(arquivo, 'utf8'), 'CHAVE_DA_API=da-ana\n');
});

test('frente cujo nome dá um banco fixo fica sem banco, com aviso', async t => {
  const de = await portaLivre();
  const bancos = pastaDeBancos(t);
  const p = novoProjeto(t, configCom(de, de + 9, bancos, { fixos: { bancos: ['loja_test'] } }));
  const r = ok(p.ah(['open', 'test']));
  assert.match(r.erro, /o nome da frente test dá o banco fixo loja_test; Faça: mude extensoes\.ambiente\.banco\.nome ou abra a frente com outro nome/);
  assert.equal(p.frente('test').extensoes.ambiente.banco, undefined);
  assert.doesNotMatch(arquivoDe(p, 'test'), /BANCO=/);
  assert.ok(!existeBanco(bancos, 'loja_test'));
});

test('desfazer só diz o que fez; arquivo em subpasta é criado', async t => {
  const de = await portaLivre();
  const p = novoProjeto(t, { arquivo: 'config/frente.env', portas: { faixa: [de, de + 9], chaves: ['PORTA_WEB'] } });
  const r = ok(p.ah(['open', 'carrinho']));
  assert.doesNotMatch(r.erro, /falhou/);
  assert.ok(fs.existsSync(path.join(p.frente('carrinho').worktree, 'config', 'frente.env')));
  const d = ok(p.ah(['ambiente', 'desfazer'])).saida;
  assert.doesNotMatch(d, /banco/);
  assert.match(d, /portas liberadas, config\/frente\.env removido/);
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

test('ignorados: só o arquivo que a extensão escreveu e que ainda está como ela o deixou', async t => {
  const config = { portas: { faixa: [4100, 4119], chaves: ['PORTA'] } };
  const def = await carregarParaTeste(EXTENSAO, config);
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'ambiente-wt-'));
  t.after(() => fs.rmSync(wt, { recursive: true, force: true }));
  const texto = '# gerado por ah ambiente\nPORTA=4100\n';
  const sha = crypto.createHash('sha256').update(texto).digest('hex');
  const frente = registro => ({ id: 'as-1', nome: 'carrinho', worktree: wt, extensoes: { ambiente: registro } });
  const ignorados = registro => def.ignorados(ctxFalso({ extensao: 'ambiente', config, frente: frente(registro) }));
  assert.deepEqual(ignorados({ arquivo: { caminho: '.env.frente', sha256: sha } }), [], 'sem o arquivo no disco, nada a declarar');
  fs.writeFileSync(path.join(wt, '.env.frente'), texto);
  assert.deepEqual(ignorados({ arquivo: { caminho: '.env.frente', sha256: sha } }), [{ caminho: '.env.frente', descartavel: true }]);
  assert.deepEqual(ignorados({}), [], 'a extensão não escreveu o arquivo');
  fs.writeFileSync(path.join(wt, '.env.frente'), `${texto}SENHA=da-ana\n`);
  assert.deepEqual(ignorados({ arquivo: { caminho: '.env.frente', sha256: sha } }), [], 'mudado à mão depois');
});

test('o .env do aluno no caminho do arquivo: o close recusa e o lista, em vez de apagá-lo', async t => {
  const de = await portaLivre();
  const p = novoProjeto(t, { arquivo: '.env', portas: { faixa: [de, de + 9], chaves: ['PORTA_WEB'] } });
  ok(p.ah(['open', 'carrinho']));
  const arquivo = path.join(p.frente('carrinho').worktree, '.env');
  fs.writeFileSync(arquivo, 'CHAVE_DA_API=da-ana\n');
  const r = p.ah(['close']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^\s+\.env$/m);
  assert.equal(fs.readFileSync(arquivo, 'utf8'), 'CHAVE_DA_API=da-ana\n');
});

test('frente passada não apaga o banco no close, nem banco que outra máquina criou', async t => {
  const de = await portaLivre();
  const bancos = pastaDeBancos(t);
  const p = novoProjeto(t, configCom(de, de + 9, bancos));
  ok(p.ah(['open', 'carrinho']));
  assert.equal(p.frente('carrinho').extensoes.ambiente.banco.maquina, os.hostname());
  ok(p.ah(['handoff', 'carrinho', '--nota', 'segue em outra máquina']));
  const r = ok(p.ah(['close', 'carrinho']));
  assert.ok(existeBanco(bancos, 'loja_carrinho'), 'o banco fica para quem continuou a frente');
  assert.match(r.erro, /a frente estava passada: o banco loja_carrinho fica para quem a continuou; Faça: /);

  fs.writeFileSync(path.join(bancos, 'loja_frete'), '');
  const config = configCom(de, de + 9, bancos);
  const def = await carregarParaTeste(EXTENSAO, config);
  const ctx = ctxFalso({ extensao: 'ambiente', config, frente: { id: 'as-2', nome: 'frete', estado: 'ativa', extensoes: { ambiente: { banco: { nome: 'loja_frete', criado: true, maquina: 'outra-maquina' } } } } });
  await def.reacoes.depoisDeFechar(ctx);
  assert.ok(existeBanco(bancos, 'loja_frete'));
  assert.match(ctx.avisos.join(''), /criado em outra máquina \(outra-maquina\)/);
});

test('configuração inválida não carrega', async () => {
  await assert.rejects(() => carregarParaTeste(EXTENSAO, {}), /portas ou banco/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { portas: { faixa: [4200, 4100], chaves: ['P'] } }), /faixa/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { banco: { nome: 'loja_{frente}', chave: 'BANCO', criar: 'createdb', apagar: ['dropdb'] } }), /criar/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { portas: { faixa: [4100, 4119], chaves: ['P'] }, arquivo: '../fora.env' }), /arquivo/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { portas: { faixa: [4100, 4119], chaves: ['P'] }, arquivo: 'config/' }), /não uma pasta/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { banco: { nome: 'loja', chave: 'BANCO', criar: ['c'], apagar: ['a'] }, fixos: { bancos: ['loja'] } }), /fixo/);
});
