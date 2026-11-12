import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  idDaSessao, idCurto, registrarSessao, lerSessao, gravarSessao, tocarSinal, encerrarSessao, VARIAVEL_SESSAO_CLAUDE,
} from '../nucleo/lib/sessao.mjs';

function temp(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-ses-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

test('idDaSessao prefere AH_SESSAO', () => {
  assert.equal(idDaSessao({ AH_SESSAO: 'a', [VARIAVEL_SESSAO_CLAUDE]: 'b' }), 'a');
  assert.equal(idDaSessao({ [VARIAVEL_SESSAO_CLAUDE]: 'b' }), 'b');
  assert.equal(idDaSessao({}), null);
});

test('idCurto devolve os 8 primeiros caracteres', () => {
  assert.equal(idCurto('0123456789abcdef'), '01234567');
  assert.equal(idCurto('abc'), 'abc');
});

test('registrarSessao cria a sessão com a forma esperada', t => {
  const d = temp(t);
  const s = registrarSessao(d, { id: 's1', agente: 'claude-code', pid: 1 });
  assert.equal(s.esquema, 1); assert.equal(s.papel, 'executor'); assert.equal(s.frente, null);
  assert.equal(s.modelo, null); assert.equal(s.fim, null);
  assert.ok(Date.parse(s.inicio)); assert.ok(Date.parse(s.sinal));
  assert.deepEqual(lerSessao(d, 's1'), s);
  assert.equal(lerSessao(d, 'nao-existe'), null);
});

test('registrarSessao de novo preserva a frente', t => {
  const d = temp(t);
  registrarSessao(d, { id: 's1', agente: 'claude-code', pid: 1 });
  gravarSessao(d, { ...lerSessao(d, 's1'), frente: 'carrinho', papel: 'revisor' });
  registrarSessao(d, { id: 's1', agente: 'claude-code', pid: 2 });
  const s = lerSessao(d, 's1');
  assert.equal(s.frente, 'carrinho'); assert.equal(s.papel, 'revisor'); assert.equal(s.pid, 2);
});

test('tocarSinal atualiza o sinal e encerrarSessao preenche o fim', async t => {
  const d = temp(t);
  const s = registrarSessao(d, { id: 's1', agente: 'claude-code', pid: 1 });
  await new Promise(r => setTimeout(r, 10));
  tocarSinal(d, 's1');
  assert.ok(Date.parse(lerSessao(d, 's1').sinal) > Date.parse(s.sinal));
  encerrarSessao(d, 's1');
  assert.ok(Date.parse(lerSessao(d, 's1').fim));
  tocarSinal(d, 'nao-existe');
  encerrarSessao(d, 'nao-existe');
});

test('id de sessão com caminho é recusado', t => {
  const d = temp(t);
  for (const id of ['../x', 'a/b', '..']) {
    assert.throws(() => registrarSessao(d, { id, agente: 'claude-code', pid: 1 }), e => e.name === 'ErroDeEstado');
    assert.throws(() => lerSessao(d, id), e => e.name === 'ErroDeEstado');
  }
});
