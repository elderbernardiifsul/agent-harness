import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarProjeto } from './apoio/repo.mjs';
import { calcularNumeros, lerEventosTolerante } from '../nucleo/lib/numeros.mjs';

const EXEMPLO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'eventos-de-exemplo', 'eventos.jsonl');
const FUSO = 'America/Sao_Paulo';
const H = 3600000;

// Projeto com o registro de exemplo no lugar do eventos.jsonl.
function projetoComExemplo(t) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const dir = path.join(p.estado, 'loja');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(EXEMPLO, path.join(dir, 'eventos.jsonl'));
  return p;
}

test('lerEventosTolerante conta à parte a linha ilegível', () => {
  const { eventos, ilegiveis } = lerEventosTolerante(EXEMPLO);
  assert.equal(ilegiveis, 1);
  assert.equal(eventos.length, 24);
  assert.deepEqual(lerEventosTolerante(path.join(path.dirname(EXEMPLO), 'nao-existe.jsonl')), { eventos: [], ilegiveis: 0 });
});

test('números de todo o registro', () => {
  const { eventos, ilegiveis } = lerEventosTolerante(EXEMPLO);
  const n = calcularNumeros(eventos, { fuso: FUSO, ilegiveis });
  assert.deepEqual(n.periodo, { desde: null, ate: null, fuso: FUSO });
  assert.deepEqual(n.frentes, { abertas: 3, fechadas: 3, fechadasSoLocal: 1, comTempo: 3, tempoMedioMs: 7 * H, tempoMedianoMs: 6 * H });
  assert.deepEqual([n.passagens, n.tomadas, n.retomadas], [1, 1, 1]);
  assert.deepEqual(n.sessoes, { iniciadas: 4, porModelo: { 'modelo-a': 2, 'não informado': 1, 'modelo-b': 1 } });
  assert.deepEqual(n.recusas, {
    porTrava: { T2: 2, 'recursos/porta': 1 },
    liberacoesPorTrava: { T5: 1 },
    deComando: { open: 2, close: 1 },
  });
  assert.deepEqual(n.pesado, { execucoes: 2, esperaMediaMs: 2000, esperaMaximaMs: 3000, duracaoMediaMs: 90000 });
  assert.equal(n.linhasIlegiveis, 1);
});

test('período fecha nos dois lados e segue o fuso da configuração', () => {
  const { eventos } = lerEventosTolerante(EXEMPLO);
  // 2026-11-12T01:30Z e 02:00Z são 11/11 em São Paulo
  const n = calcularNumeros(eventos, { desde: '2026-11-11', ate: '2026-11-11', fuso: FUSO });
  assert.deepEqual(n.frentes, { abertas: 1, fechadas: 1, fechadasSoLocal: 0, comTempo: 1, tempoMedioMs: 13 * H, tempoMedianoMs: 13 * H });
  assert.deepEqual(n.sessoes, { iniciadas: 1, porModelo: { 'modelo-b': 1 } });
  assert.deepEqual(n.recusas.deComando, { close: 1, open: 1 });
  assert.deepEqual([n.passagens, n.tomadas, n.retomadas], [0, 1, 0]);
  assert.deepEqual(n.pesado, { execucoes: 0, esperaMediaMs: null, esperaMaximaMs: null, duracaoMediaMs: null });
  // em UTC as duas últimas caem no dia 12
  const utc = calcularNumeros(eventos, { desde: '2026-11-11', ate: '2026-11-11', fuso: 'UTC' });
  assert.equal(utc.sessoes.iniciadas, 0);
  assert.equal(utc.frentes.fechadas, 0);
  // só --desde e só --ate
  assert.equal(calcularNumeros(eventos, { desde: '2026-11-10', fuso: FUSO }).frentes.abertas, 2);
  assert.equal(calcularNumeros(eventos, { ate: '2026-11-09', fuso: FUSO }).frentes.abertas, 1);
});

test('frente aberta antes do período e fechada nele entra no tempo médio; evento sem data fica fora do período', () => {
  const eventos = [
    { tipo: 'fechamento', aberta: '2026-11-01T10:00:00-03:00', fechada: '2026-11-05T13:00:00.000Z', em: '2026-11-05T13:00:00.000Z' },
    { tipo: 'fechamento', aberta: 'lixo', fechada: '2026-11-05T14:00:00.000Z', em: '2026-11-05T14:00:00.000Z' },
    { tipo: 'abertura' },
  ];
  const n = calcularNumeros(eventos, { desde: '2026-11-05', ate: '2026-11-05', fuso: FUSO });
  assert.deepEqual(n.frentes, { abertas: 0, fechadas: 2, fechadasSoLocal: 0, comTempo: 1, tempoMedioMs: 96 * H, tempoMedianoMs: 96 * H });
  assert.equal(calcularNumeros(eventos, { fuso: FUSO }).frentes.abertas, 1);
});

test('ah board --numeros em texto', t => {
  const p = projetoComExemplo(t);
  const r = p.ah(['board', '--numeros']);
  assert.equal(r.codigo, 0, r.erro);
  const s = r.saida;
  assert.match(s, /^Números de todo o registro \(fuso America\/Sao_Paulo\)$/m);
  assert.match(s, /^Frentes: 3 abertas, 3 fechadas \(1 só local\)$/m);
  assert.match(s, /^Tempo por frente fechada: médio 7 h 0 min, mediano 6 h 0 min \(3 frentes\)$/m);
  assert.match(s, /^Passagens de bastão: 1; tomadas: 1; retomadas: 1$/m);
  assert.match(s, /^Sessões iniciadas: 4 \(modelo-a 2, modelo-b 1, não informado 1\)$/m);
  assert.match(s, /^Recusas por trava: T2 2, recursos\/porta 1$/m);
  assert.match(s, /^Liberações por trava: T5 1$/m);
  assert.match(s, /^Recusas de comando: open 2, close 1$/m);
  assert.match(s, /^Pesado: 2 execuções; espera média 2 s, máxima 3 s; duração média 1 min 30 s$/m);
  assert.match(s, /^Linhas ilegíveis em eventos\.jsonl: 1 \(fora da conta\)$/m);
});

test('ah board --numeros com período e --json', t => {
  const p = projetoComExemplo(t);
  const r = p.ah(['board', '--numeros', '--desde', '2026-11-11', '--ate', '2026-11-11', '--json']);
  assert.equal(r.codigo, 0, r.erro);
  const n = JSON.parse(r.saida);
  assert.deepEqual(n.periodo, { desde: '2026-11-11', ate: '2026-11-11', fuso: FUSO });
  assert.equal(n.frentes.abertas, 1);
  assert.equal(n.linhasIlegiveis, 1);
  const texto = p.ah(['board', '--numeros', '--desde', '2026-11-12']).saida;
  assert.match(texto, /^Números de 2026-11-12 em diante \(fuso America\/Sao_Paulo\)$/m);
  assert.match(texto, /^Frentes: 0 abertas, 0 fechadas$/m);
  assert.match(texto, /^Tempo por frente fechada: sem frente fechada no período$/m);
  assert.match(texto, /^Sessões iniciadas: 0$/m);
  assert.match(texto, /^Recusas por trava: nenhuma$/m);
  assert.match(texto, /^Pesado: nenhuma execução$/m);
  // a linha ilegível não tem data: conta sempre, com qualquer período
  assert.match(texto, /^Linhas ilegíveis em eventos\.jsonl: 1 \(fora da conta\)$/m);
  assert.match(p.ah(['board', '--numeros', '--ate', '2026-11-09']).saida, /^Números até 2026-11-09 /m);
});

test('ah board --numeros sem eventos diz que não há registro', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const r = p.ah(['board', '--numeros']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^Frentes: 0 abertas, 0 fechadas$/m);
});

test('ah board --numeros recusa data inválida, período invertido e opção sem --numeros, com o próximo passo', t => {
  const p = projetoComExemplo(t);
  const casos = [
    [['board', '--numeros', '--desde', '11/11/2026'], /data inválida em --desde: 11\/11\/2026/],
    [['board', '--numeros', '--ate', '2026-02-30'], /data inválida em --ate: 2026-02-30/],
    [['board', '--numeros', '--desde'], /--desde pede uma data/],
    [['board', '--numeros', '--desde', '2026-11-12', '--ate', '2026-11-10'], /período invertido/],
    [['board', '--numeros', '--frentes'], /Opção desconhecida: --frentes/],
    [['board', '--desde', '2026-11-10'], /--desde e --ate só valem com --numeros/],
  ];
  for (const [args, motivo] of casos) {
    const r = p.ah(args);
    assert.equal(r.codigo, 1, args.join(' '));
    assert.match(r.erro, motivo);
    assert.match(r.erro, /Faça: /);
  }
});
