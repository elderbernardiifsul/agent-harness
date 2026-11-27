// Extensão ambiente no sweep: portas da faixa e bancos do molde que estão em uso sem frente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projetoDeTeste } from '../nucleo/lib/extensoes-teste.mjs';

const FALSO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ambiente-banco-falso.mjs');
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };

async function portaLivre() {
  const s = net.createServer();
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise(r => s.close(r));
  return port;
}
async function escutar(t, porta) {
  const s = net.createServer();
  await new Promise(r => s.listen(porta, '127.0.0.1', r));
  t.after(() => s.close());
}

// Faixa de 10 portas a partir de `de`; bancos falsos em `bancos`, com loja_velho (sem frente), loja_fixo (fixo) e
// outro_banco (fora do molde) já criados.
async function cenario(t) {
  const de = await portaLivre();
  const bancos = fs.mkdtempSync(path.join(os.tmpdir(), 'ambiente-bancos-'));
  t.after(() => fs.rmSync(bancos, { recursive: true, force: true }));
  for (const b of ['loja_velho', 'loja_fixo', 'outro_banco']) fs.writeFileSync(path.join(bancos, b), '');
  const p = projetoDeTeste({ extensoes: { recursos: true, ambiente: {
    portas: { faixa: [de, de + 9], chaves: ['PORTA_WEB'] },
    banco: {
      nome: 'loja_{frente}', chave: 'BANCO',
      criar: ['node', FALSO, 'criar', bancos, '{banco}'],
      apagar: ['node', FALSO, 'apagar', bancos, '{banco}'],
      listar: ['node', FALSO, 'listar', bancos],
    },
    fixos: { portas: [de + 6], bancos: ['loja_fixo'] },
  } } });
  t.after(() => p.limpar());
  fs.appendFileSync(path.join(p.raiz, '.gitignore'), '.env.frente\n');
  assert.equal(p.git(['commit', '-q', '-am', 'ignora o arquivo de ambiente']).codigo, 0);
  ok(p.ah(['open', 'carrinho']));
  return { p, de, bancos };
}

test('sweep lista a porta e o banco sem frente, e não os da frente, os fixos e os fora do molde', async t => {
  const { p, de } = await cenario(t);
  const daFrente = p.frente('carrinho').extensoes.ambiente.portas.PORTA_WEB;
  await escutar(t, daFrente); // a porta da frente carrinho, em uso pelo servidor dela
  await escutar(t, de + 5);   // sem frente
  await escutar(t, de + 6);   // fixa
  ok(p.ah(['recursos', 'reservar', 'porta', String(de + 7)]));
  await escutar(t, de + 7);   // reservada pela extensão recursos
  const saida = ok(p.ah(['sweep'])).saida;
  assert.match(saida, new RegExp(`^- ambiente: porta ${de + 5} em uso sem frente; Faça: encerre o processo ou declare a porta em extensoes\\.ambiente\\.fixos\\.portas$`, 'm'));
  assert.match(saida, /^- ambiente: banco loja_velho sem frente nesta máquina \(pode ser de uma frente de outra máquina\); Faça: confira se ninguém o usa e apague com o comando de extensoes\.ambiente\.banco\.apagar, ou declare em fixos\.bancos$/m);
  assert.doesNotMatch(saida, new RegExp(`porta ${daFrente} `));
  assert.doesNotMatch(saida, new RegExp(`porta ${de + 6} `));
  assert.doesNotMatch(saida, new RegExp(`porta ${de + 7} `));
  assert.doesNotMatch(saida, /loja_carrinho|loja_fixo|outro_banco/);
  const json = JSON.parse(ok(p.ah(['sweep', '--json'])).saida);
  assert.equal(json.extensoes.ambiente.length, 2);
});

test('listar que falha vira uma linha; --reparar não apaga nada', async t => {
  const { p, bancos } = await cenario(t);
  const falha = ok(p.ah(['sweep'], { env: { BANCO_FALSO_FALHA: '1' } })).saida;
  assert.match(falha, /^- ambiente: não consegui listar os bancos: banco falso: desligado; Faça: confira extensoes\.ambiente\.banco\.listar$/m);
  const reparar = ok(p.ah(['sweep', '--reparar'])).saida;
  assert.match(reparar, /o --reparar não apaga banco nem encerra processo/);
  assert.ok(fs.existsSync(path.join(bancos, 'loja_velho')));
});
