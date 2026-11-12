import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  idDaSessao, idCurto, registrarSessao, lerSessao, gravarSessao, tocarSinal, encerrarSessao, VARIAVEL_SESSAO_CLAUDE,
  migrarSessao, idadeDoSinalMs, listarSessoes, apagarSessao,
} from '../nucleo/lib/sessao.mjs';
import { gravarJson } from '../nucleo/lib/estado.mjs';

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

test('registrarSessao grava o esquema 2 e o sinal em arquivo à parte', t => {
  const dir = temp(t);
  const r = registrarSessao(dir, { id: 's1', agente: 'claude-code', pid: 7, pidInicio: 'x' });
  assert.deepEqual(Object.keys(r).sort(), ['agente', 'esquema', 'fim', 'frente', 'id', 'inicio', 'modelo', 'motivoFim', 'papel', 'pid', 'pidInicio']);
  assert.equal(r.esquema, 2); assert.ok(fs.existsSync(path.join(dir, 'sessoes', 's1.sinal')));
  assert.equal(r.papel, 'executor'); assert.equal(r.frente, null); assert.equal(r.modelo, null); assert.equal(r.fim, null);
  assert.ok(Date.parse(r.inicio));
  assert.deepEqual(lerSessao(dir, 's1'), r);
  assert.equal(lerSessao(dir, 'nao-existe'), null);
});

test('registrarSessao de novo preserva a frente', t => {
  const d = temp(t);
  registrarSessao(d, { id: 's1', agente: 'claude-code', pid: 1 });
  gravarSessao(d, { ...lerSessao(d, 's1'), frente: 'carrinho', papel: 'revisor' });
  registrarSessao(d, { id: 's1', agente: 'claude-code', pid: 2 });
  const s = lerSessao(d, 's1');
  assert.equal(s.frente, 'carrinho'); assert.equal(s.papel, 'revisor'); assert.equal(s.pid, 2);
});

test('tocarSinal não regrava o JSON da sessão', t => {
  const dir = temp(t);
  registrarSessao(dir, { id: 's1', agente: 'x' }); gravarSessao(dir, { ...lerSessao(dir, 's1'), frente: 'carrinho' });
  const antes = fs.readFileSync(path.join(dir, 'sessoes', 's1.json'), 'utf8');
  tocarSinal(dir, 's1');
  assert.equal(fs.readFileSync(path.join(dir, 'sessoes', 's1.json'), 'utf8'), antes);
  assert.ok(idadeDoSinalMs(dir, 's1') < 5000);
});

test('tocarSinal recria o arquivo do sinal e renova a data', t => {
  const dir = temp(t);
  registrarSessao(dir, { id: 's1', agente: 'x' });
  const arq = path.join(dir, 'sessoes', 's1.sinal');
  const velho = new Date(Date.now() - 3600000);
  fs.utimesSync(arq, velho, velho);
  assert.ok(idadeDoSinalMs(dir, 's1') >= 3600000 - 1000);
  tocarSinal(dir, 's1');
  assert.ok(idadeDoSinalMs(dir, 's1') < 5000);
  fs.rmSync(arq);
  assert.equal(idadeDoSinalMs(dir, 's1'), null);
  assert.ok(tocarSinal(dir, 's1'));
  assert.ok(fs.existsSync(arq));
  assert.equal(tocarSinal(dir, 'nao-existe'), null);
  assert.equal(idadeDoSinalMs(dir, 'nao-existe'), null);
});

test('encerrarSessao grava fim e motivo', t => {
  const dir = temp(t);
  registrarSessao(dir, { id: 's1', agente: 'x' });
  encerrarSessao(dir, 's1', 'fim');
  const s = lerSessao(dir, 's1');
  assert.ok(Date.parse(s.fim)); assert.equal(s.motivoFim, 'fim');
  encerrarSessao(dir, 's1');
  assert.equal(lerSessao(dir, 's1').motivoFim, null);
  assert.equal(encerrarSessao(dir, 'nao-existe'), null);
});

test('registrarSessao sem pid mantém o pid gravado pelo gancho e reabre a sessão encerrada', t => {
  const dir = temp(t);
  registrarSessao(dir, { id: 's1', agente: 'x', pid: 7, pidInicio: 'x' }); encerrarSessao(dir, 's1', 'fim');
  const r = registrarSessao(dir, { id: 's1', agente: 'x' });
  assert.deepEqual([r.pid, r.pidInicio, r.fim, r.motivoFim], [7, 'x', null, null]);
  const r2 = registrarSessao(dir, { id: 's1', agente: 'x', pid: 8 });
  assert.deepEqual([r2.pid, r2.pidInicio], [8, null]);
});

test('sessão do esquema 1 é lida como 2, com a idade do sinal pelo campo antigo', t => {
  const dir = temp(t);
  gravarJson(path.join(dir, 'sessoes', 'v1.json'), { esquema: 1, id: 'v1', agente: 'x', papel: 'executor', frente: null, modelo: null, pid: 3, inicio: '2026-11-12T10:00:00Z', sinal: '2026-11-12T10:00:00Z', fim: null });
  assert.equal(lerSessao(dir, 'v1').esquema, 2);
  assert.ok(idadeDoSinalMs(dir, 'v1', Date.parse('2026-11-12T10:01:00Z')) === 60000);
  const v = lerSessao(dir, 'v1');
  assert.equal(v.pidInicio, null); assert.equal(v.motivoFim, null); assert.ok(!('sinal' in v));
  tocarSinal(dir, 'v1');
  assert.ok(idadeDoSinalMs(dir, 'v1') < 5000);
  encerrarSessao(dir, 'v1');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'sessoes', 'v1.json'), 'utf8')).esquema, 2);
});

test('esquema desconhecido recusa pedindo para atualizar', t => {
  const dir = temp(t);
  gravarJson(path.join(dir, 'sessoes', 'v9.json'), { esquema: 9, id: 'v9' });
  assert.throws(() => lerSessao(dir, 'v9'), e => e.name === 'ErroDeEstado' && /atualize o harness/.test(e.saida));
  assert.throws(() => migrarSessao({ esquema: 3 }), e => e.name === 'ErroDeEstado' && /ah init --sobrescrever/.test(e.saida));
});

test('recusa de esquema traz o arquivo e um conserto que não é o doctor', t => {
  const dir = temp(t);
  const v9 = path.join(dir, 'sessoes', 'v9.json');
  gravarJson(v9, { esquema: 9, id: 'v9' });
  assert.throws(() => lerSessao(dir, 'v9'), e => e.arquivo === v9 && e.message.includes(v9) && e.esquema === true);
  const v0 = path.join(dir, 'sessoes', 'v0.json');
  gravarJson(v0, { esquema: 0, id: 'v0' });
  assert.throws(() => lerSessao(dir, 'v0'), e => e.arquivo === v0 && e.message.includes(v0)
    && /conserte o campo "esquema"/.test(e.saida) && !/ah doctor/.test(e.saida));
});

test('listarSessoes separa as ilegíveis; apagarSessao tira o JSON e o sinal', t => {
  const dir = temp(t);
  assert.deepEqual(listarSessoes(dir), { sessoes: [], ilegiveis: [] });
  registrarSessao(dir, { id: 's1', agente: 'x' });
  registrarSessao(dir, { id: 's2', agente: 'x' });
  fs.writeFileSync(path.join(dir, 'sessoes', 'quebrada.json'), '{');
  gravarJson(path.join(dir, 'sessoes', 'v9.json'), { esquema: 9, id: 'v9' });
  const l = listarSessoes(dir);
  assert.deepEqual(l.sessoes.map(s => s.id).sort(), ['s1', 's2']);
  assert.deepEqual(l.ilegiveis.sort(), ['quebrada', 'v9']);
  apagarSessao(dir, 's1');
  assert.ok(!fs.existsSync(path.join(dir, 'sessoes', 's1.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'sessoes', 's1.sinal')));
  assert.deepEqual(listarSessoes(dir).sessoes.map(s => s.id), ['s2']);
});

test('id de sessão com caminho é recusado', t => {
  const d = temp(t);
  for (const id of ['../x', 'a/b', '..']) {
    assert.throws(() => registrarSessao(d, { id, agente: 'claude-code', pid: 1 }), e => e.name === 'ErroDeEstado');
    assert.throws(() => lerSessao(d, id), e => e.name === 'ErroDeEstado');
  }
});
