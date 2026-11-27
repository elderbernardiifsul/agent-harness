// Extensão migracao: reserva do número de migração por frente (reservar, liberar, listar; o close libera).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarParaTeste, projetoDeTeste } from '../nucleo/lib/extensoes-teste.mjs';
import { numeroDoArquivo, ultimaDaBase, proximoNumero, formatar } from '../nucleo/extensoes/migracao/numeros.mjs';

const EXTENSAO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'nucleo', 'extensoes', 'migracao', 'extensao.mjs');
const PASTA = 'db/migracoes';
const B = { env: { AH_SESSAO: 'sessao-b-0002' } };
const C = { env: { AH_SESSAO: 'sessao-c-0003' } };
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };

// Commita arquivos na pasta de migrações, no checkout dado (o principal, na dev, por padrão).
function commitar(p, arquivos, cwd = p.raiz) {
  for (const a of arquivos) {
    fs.mkdirSync(path.join(cwd, PASTA), { recursive: true });
    fs.writeFileSync(path.join(cwd, PASTA, a), `-- ${a}\n`);
  }
  assert.equal(p.git(['add', '--', PASTA], { cwd }).codigo, 0);
  assert.equal(p.git(['commit', '-q', '-m', `migrações ${arquivos.join(' ')}`], { cwd }).codigo, 0);
}
function novoProjeto(t) {
  const p = projetoDeTeste({ extensoes: { migracao: { pasta: PASTA } } });
  t.after(() => p.limpar());
  commitar(p, ['README.md', '0001_base.sql', '0002_cupom.sql']);
  return p;
}
const numero = (p, nome) => p.frente(nome)?.extensoes?.migracao?.numero;

test('numeros: arquivo fora do padrão é ignorado; base sem pasta vale 0', () => {
  const padrao = /^(\d+)_/;
  assert.equal(numeroDoArquivo('0002_cupom.sql', padrao), 2);
  assert.equal(numeroDoArquivo('README.md', padrao), null);
  const comPasta = () => ({ codigo: 0, saida: `${PASTA}/README.md\n${PASTA}/0001_base.sql\n${PASTA}/0002_cupom.sql\n`, erro: '' });
  assert.equal(ultimaDaBase(comPasta, 'dev', PASTA, padrao), 2);
  const semPasta = () => ({ codigo: 0, saida: '', erro: '' });
  assert.equal(ultimaDaBase(semPasta, 'dev', PASTA, padrao), 0);
  const semRamo = () => ({ codigo: 128, saida: '', erro: 'fatal: Not a valid object name' });
  assert.throws(() => ultimaDaBase(semRamo, 'dev', PASTA, padrao), /dev/);
  assert.equal(proximoNumero(2, []), 3);
  assert.equal(proximoNumero(2, [3, 5]), 6);
  assert.equal(formatar(3, 4), '0003');
});

test('reservar conta a base e as reservas vivas; listar mostra a última da base e as reservas', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  assert.match(ok(p.ah(['migracao', 'reservar'])).saida, /^Frente as-1 um: migração reservada: 0003 \(a última da dev é a 0002\)\.$/m);
  ok(p.ah(['open', 'dois'], B));
  ok(p.ah(['migracao', 'reservar'], B));
  assert.equal(numero(p, 'um'), 3);
  assert.equal(numero(p, 'dois'), 4);
  assert.match(ok(p.ah(['migracao', 'reservar'])).saida, /já reservada: 0003/);
  const l = ok(p.ah(['migracao', 'listar'])).saida;
  assert.match(l, /^Última da dev: 0002 \(0002_cupom\.sql\)$/m);
  assert.match(l, /^0003 as-1 um$/m);
  assert.match(l, /^0004 as-2 dois$/m);
  const json = JSON.parse(ok(p.ah(['migracao', 'listar', '--json'])).saida);
  assert.equal(json.ultima, 2);
  assert.deepEqual(json.reservas.map(r => [r.id, r.frente, r.numero]), [['as-1', 'um', 3], ['as-2', 'dois', 4]]);
  assert.match(ok(p.ah(['board'])).saida, /^as-1 .*0003/m);
});

test('a frente passada continua dona do número', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  ok(p.ah(['migracao', 'reservar']));
  ok(p.ah(['handoff']));
  ok(p.ah(['open', 'tres'], C));
  ok(p.ah(['migracao', 'reservar'], C));
  assert.equal(numero(p, 'tres'), 4);
});

test('liberar e close liberam a reserva', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  ok(p.ah(['migracao', 'reservar']));
  ok(p.ah(['open', 'dois'], B));
  ok(p.ah(['migracao', 'reservar'], B));
  assert.match(ok(p.ah(['migracao', 'liberar'], B)).saida, /reserva de migração liberada/);
  assert.equal(numero(p, 'dois'), undefined);
  ok(p.ah(['open', 'tres'], C));
  ok(p.ah(['migracao', 'reservar'], C));
  assert.equal(numero(p, 'tres'), 4);
  assert.match(ok(p.ah(['close'])).saida, /Reserva de migração 0003 liberada\./);
});

test('reserva que a base ultrapassou aparece marcada para renumerar', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  ok(p.ah(['migracao', 'reservar']));
  commitar(p, ['0003_outra.sql']);
  assert.match(ok(p.ah(['migracao', 'listar'])).saida, /^0003 as-1 um \(a dev já passou dela: rode ah migracao renumerar depois de reintegrar\)$/m);
});

test('--frente de outra sessão viva recusa', t => {
  const p = novoProjeto(t);
  ok(p.ah(['open', 'um']));
  ok(p.ah(['open', 'dois'], B));
  const r = p.ah(['migracao', 'reservar', '--frente', 'um'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /é da sessão sessao-teste-0001, que está viva/);
});

test('configuração: pasta é obrigatória; padrão precisa de um grupo', async () => {
  await assert.rejects(() => carregarParaTeste(EXTENSAO, {}), /pasta/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { pasta: PASTA, padrao: '^\\d+_' }), /grupo/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { pasta: PASTA, padrao: '(' }), /padrao/);
  await carregarParaTeste(EXTENSAO, { pasta: PASTA, padrao: '^V(\\d+)__', digitos: 3 });
});
