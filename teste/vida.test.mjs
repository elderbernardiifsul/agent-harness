import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  processoExiste, inicioDoProcesso, pidDoAgente, pidDeComando, prazoMs, estadoDaSessao, vidaDaSessao,
} from '../nucleo/lib/vida.mjs';
import { registrarSessao, encerrarSessao } from '../nucleo/lib/sessao.mjs';
import { aplicarPadroes } from '../nucleo/lib/config.mjs';
import { processoVivo } from './apoio/processo.mjs';

test('processoExiste: o próprio processo sim; um encerrado não; pid inválido não', async () => {
  assert.equal(processoExiste(process.pid), true);
  const p = processoVivo(); const pid = p.pid; await p.matar();
  assert.equal(processoExiste(pid), false);
  for (const x of [0, -1, 1.5, null, 'abc']) assert.equal(processoExiste(x), false);
});

test('inicioDoProcesso no Linux é estável', { skip: process.platform !== 'linux' }, () => {
  const a = inicioDoProcesso(process.pid); assert.match(a, /^\d+$/); assert.equal(inicioDoProcesso(process.pid), a);
});

test('inicioDoProcesso no macOS vem do ps', { skip: process.platform !== 'darwin' }, () => assert.ok(inicioDoProcesso(process.pid)));

test('inicioDoProcesso no Windows é nulo', () => assert.equal(inicioDoProcesso(process.pid, 'win32'), null));

test('inicioDoProcesso de processo inexistente ou pid inválido é nulo', async () => {
  const p = processoVivo(); const pid = p.pid; await p.matar();
  assert.equal(inicioDoProcesso(pid), null);
  assert.equal(inicioDoProcesso('abc'), null);
});

test('inicioDoProcesso distingue dois processos', { skip: process.platform !== 'linux' }, async () => {
  const p = processoVivo();
  try {
    assert.match(inicioDoProcesso(p.pid), /^\d+$/);
  } finally {
    await p.matar();
  }
});

test('pidDoAgente e pidDeComando', () => {
  assert.equal(pidDoAgente({ AH_PID_AGENTE: '42' }, 7), 42);
  assert.equal(pidDoAgente({}, 7), 7);
  assert.equal(pidDoAgente({ AH_PID_AGENTE: 'x' }, 7), 7);
  assert.equal(pidDoAgente({ AH_PID_AGENTE: '0' }, 7), 7);
  assert.equal(pidDoAgente({}, undefined), null);
  assert.equal(pidDeComando({ AH_PID_AGENTE: '42' }), 42);
  assert.equal(pidDeComando({}), null);
  assert.equal(pidDeComando({ AH_PID_AGENTE: '-3' }), null);
  assert.equal(pidDeComando({ AH_PID_AGENTE: '1.5' }), null);
});

test('prazoMs vem da configuração', () => {
  assert.equal(prazoMs(aplicarPadroes({ projeto: 'loja' })), 120 * 60000);
  assert.equal(prazoMs(aplicarPadroes({ projeto: 'loja', sessoes: { prazoDoSinalMin: 5 } })), 300000);
});

const s = { id: 's1', pid: 10, pidInicio: 'x', fim: null };
const vida = (sessao, o = {}) => estadoDaSessao(sessao, { idadeDoSinalMs: 1000, prazoMs: 60000, existe: () => true, inicio: () => 'x', ...o }).estado;

test('estadoDaSessao', () => {
  assert.equal(vida(s), 'viva');
  assert.equal(vida(null), 'desconhecida');
  assert.equal(vida({ ...s, fim: '2026-11-13T10:00:00Z' }), 'encerrada');
  assert.equal(vida(s, { idadeDoSinalMs: 60001 }), 'morta');
  assert.equal(vida(s, { idadeDoSinalMs: null }), 'morta');
  assert.equal(vida(s, { existe: () => false }), 'morta');
  assert.equal(vida(s, { inicio: () => 'y' }), 'morta');
  assert.equal(vida(s, { inicio: () => null }), 'viva');
  assert.equal(vida({ ...s, pid: null, pidInicio: null }), 'viva');
});

test('estadoDaSessao diz o motivo', () => {
  const motivo = (sessao, o = {}) => estadoDaSessao(sessao, { idadeDoSinalMs: 1000, prazoMs: 60000, existe: () => true, inicio: () => 'x', ...o }).motivo;
  assert.equal(motivo(s, { idadeDoSinalMs: 60001 }), 'sinal vencido');
  assert.equal(motivo(s, { existe: () => false }), 'processo não existe');
  assert.equal(motivo(s, { inicio: () => 'y' }), 'pid reaproveitado');
  assert.equal(motivo({ ...s, pidInicio: null }, { inicio: () => 'y' }), 'viva');
});

test('vidaDaSessao lê a sessão e o sinal do disco', t => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-vida-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const config = aplicarPadroes({ projeto: 'loja' });
  registrarSessao(d, { id: 's1', agente: 'x', pid: process.pid, pidInicio: inicioDoProcesso(process.pid) });
  const v = vidaDaSessao(d, 's1', { config });
  assert.equal(v.estado, 'viva');
  assert.ok(v.idadeDoSinalMs >= 0 && v.idadeDoSinalMs < 5000);
  assert.equal(vidaDaSessao(d, 's1', { config, agora: Date.now() + 121 * 60000 }).estado, 'morta');
  assert.equal(vidaDaSessao(d, 's1', { config, existe: () => false }).motivo, 'processo não existe');
  assert.equal(vidaDaSessao(d, 'nao-existe', { config }).estado, 'desconhecida');
  encerrarSessao(d, 's1', 'fim');
  assert.equal(vidaDaSessao(d, 's1', { config }).estado, 'encerrada');
});
