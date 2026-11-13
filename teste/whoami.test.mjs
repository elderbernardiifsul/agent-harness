import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, utimesSync, statSync } from 'node:fs';
import { criarRepo, criarProjeto, escreverConfig, dirDoTeste } from './apoio/repo.mjs';
import { lerSessao, idadeDoSinalMs } from '../nucleo/lib/sessao.mjs';
import { despachar } from '../nucleo/bin/ah.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const p = criarRepo();
escreverConfig(p, { projeto: 'loja' });
const semConfig = criarRepo();

test('whoami sem frente', () => {
  const r = p.ah(['whoami']);
  assert.equal(r.codigo, 0);
  assert.match(r.saida, /Sessão sessao-t \(executor\) · frente: nenhuma/);
  assert.deepEqual(JSON.parse(p.ah(['whoami', '--json']).saida), { sessao: 'sessao-teste-0001', papel: 'executor', frente: null });
});

test('fora de repositório recusa com saída e sem pilha', () => {
  const fora = mkdtempSync(path.join(os.tmpdir(), 'ah-fora-'));
  try {
    const r = p.ah(['whoami'], { cwd: fora });
    assert.equal(r.codigo, 1);
    assert.match(r.erro, /^Recusado: .+\nFaça: /);
    assert.doesNotMatch(r.erro, /\bat .+\.mjs:\d+/);
  } finally {
    rmSync(fora, { recursive: true, force: true });
  }
});

test('projeto sem .harness recusa apontando o init', () => assert.match(semConfig.ah(['whoami']).erro, /ah init/));

test('sem id de sessão recusa', () => assert.match(p.ah(['whoami'], { env: { AH_SESSAO: '' } }).erro, /AH_SESSAO/));

test('a variável do agente vale na falta de AH_SESSAO', () => {
  const r = p.ah(['whoami', '--json'], { env: { AH_SESSAO: '', CLAUDE_CODE_SESSION_ID: 'agente-0001' } });
  assert.equal(JSON.parse(r.saida).sessao, 'agente-0001');
});

test('comando desconhecido aponta a ajuda', () => assert.match(p.ah(['xyz']).erro, /ah --help/));

test('nome de comando hostil não vira caminho de importação', () => {
  for (const nome of ['../../x', 'lib/estado', '..', 'Whoami', 'whoami.mjs']) {
    const r = p.ah([nome]);
    assert.equal(r.codigo, 1, nome);
    assert.match(r.erro, /ah --help/, nome);
  }
});

test('ah e ah --help listam os comandos', () => {
  for (const args of [[], ['--help']]) {
    const r = p.ah(args);
    assert.equal(r.codigo, 0);
    assert.match(r.saida, /whoami\s+\S/);
  }
});

test('R3: o despacho obedece ao requisitos que o comando declara', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ah-cmds-'));
  try {
    writeFileSync(path.join(dir, 'livre.mjs'),
      "export const descricao='livre'; export const requisitos={config:false,sessao:false};\n" +
      "export async function executar(a, amb){ amb.escrever(JSON.stringify({config: amb.config, sessao: amb.sessaoId})); return 0; }\n");
    writeFileSync(path.join(dir, 'padrao.mjs'),
      "export const descricao='padrão'; export async function executar(a, amb){ amb.escrever('ok'); return 0; }\n");
    writeFileSync(path.join(dir, 'solto.mjs'),
      "export const descricao='solto'; export const requisitos={config:false,sessao:false,repositorio:false};\n" +
      "export async function executar(a, amb){ amb.escrever('fora ok'); return 0; }\n");
    const rodar = async (argv, cwd, env) => {
      let saida = '', erro = '';
      const codigo = await despachar(argv, { cwd, env: { ...p.env, ...env }, dirComandos: dir, escrever: t => (saida += t), avisar: t => (erro += t) });
      return { codigo, saida, erro };
    };
    const a = await rodar(['livre'], semConfig.raiz, { AH_SESSAO: '' });
    assert.equal(a.codigo, 0, a.erro);
    assert.deepEqual(JSON.parse(a.saida), { config: null, sessao: null });
    const b = await rodar(['livre'], p.raiz, {});
    assert.equal(JSON.parse(b.saida).config.projeto, 'loja');
    assert.equal(JSON.parse(b.saida).sessao, 'sessao-teste-0001');
    const c = await rodar(['padrao'], semConfig.raiz, {});
    assert.equal(c.codigo, 1);
    assert.match(c.erro, /ah init/);
    const d = await rodar(['padrao'], p.raiz, { AH_SESSAO: '' });
    assert.match(d.erro, /AH_SESSAO/);
    const fora = mkdtempSync(path.join(os.tmpdir(), 'ah-fora-'));
    try {
      assert.match((await rodar(['livre'], fora, {})).erro, /^Recusado: /);
      const e = await rodar(['solto'], fora, {});
      assert.equal(e.codigo, 0, e.erro);
      assert.equal(e.saida, 'fora ok');
    } finally {
      rmSync(fora, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- onda final: I3 (--help por comando)
test('I3: ah <comando> --help e -h mostram descrição e uso, saem 0 e não executam', async () => {
  const fora = mkdtempSync(path.join(os.tmpdir(), 'ah-ajuda-'));
  try {
    for (const nome of ['board', 'close', 'doctor', 'gancho', 'init', 'nota', 'open', 'sweep', 'takeover', 'whoami']) {
      const m = await import(`../nucleo/comandos/${nome}.mjs`);
      assert.equal(typeof m.uso, 'string', nome);
      assert.match(m.uso, new RegExp(`^ah ${nome}`), nome);
      for (const opcao of ['--help', '-h']) {
        // sem configuração, sem sessão e até fora de repositório
        for (const [r, onde] of [[semConfig.ah([nome, opcao], { env: { AH_SESSAO: '' } }), 'sem config'], [semConfig.ah([nome, 'x', opcao], { cwd: fora, env: { AH_SESSAO: '' } }), 'fora']]) {
          assert.equal(r.codigo, 0, `${nome} ${opcao} ${onde}: ${r.erro}`);
          assert.equal(r.saida, `ah ${nome}: ${m.descricao}\nUso: ${m.uso}\n`, `${nome} ${opcao} ${onde}`);
        }
      }
    }
  } finally {
    rmSync(fora, { recursive: true, force: true });
  }
  assert.match(p.ah(['--help']).saida, /ah <comando> --help/);
});

test('I3: nota --help não grava nota; depois de -- o --help é texto', () => {
  const q = criarProjeto();
  assert.equal(q.ah(['open', 'carrinho']).codigo, 0);
  const frente = () => JSON.parse(readFileSync(path.join(q.estado, 'loja', 'frentes', 'carrinho.json'), 'utf8'));
  const r = q.ah(['nota', '--help']);
  assert.equal(r.codigo, 0);
  assert.match(r.saida, /^ah nota: /);
  assert.deepEqual(frente().notas ?? [], []);
  assert.equal(q.ah(['nota', '--', '--help']).codigo, 0);
  assert.deepEqual(frente().notas.map(n => n.texto), ['--help']);
  q.limpar();
});

test('ah whoami não grava o pid do próprio processo; com AH_PID_AGENTE grava', () => {
  const p = criarProjeto(); p.ah(['whoami']);
  try {
    assert.equal(lerSessao(dirDoTeste(p), 'sessao-teste-0001').pid, null);
    p.ah(['whoami'], { env: { AH_PID_AGENTE: String(process.pid) } });
    assert.equal(lerSessao(dirDoTeste(p), 'sessao-teste-0001').pid, process.pid);
    if (process.platform === 'linux') assert.match(lerSessao(dirDoTeste(p), 'sessao-teste-0001').pidInicio, /^\d+$/);
    // sem a variável, o pid gravado fica
    p.ah(['whoami']);
    assert.equal(lerSessao(dirDoTeste(p), 'sessao-teste-0001').pid, process.pid);
  } finally {
    p.limpar();
  }
});

test('os comandos da sessão tocam o sinal de vida', () => {
  const p = criarProjeto();
  try {
    const d = dirDoTeste(p);
    const arq = path.join(d, 'sessoes', 'sessao-teste-0001.sinal');
    const envelhecer = () => { const velho = new Date(Date.now() - 3600000); utimesSync(arq, velho, velho); };
    assert.equal(p.ah(['whoami']).codigo, 0);
    envelhecer(); p.ah(['whoami']);
    assert.ok(idadeDoSinalMs(d, 'sessao-teste-0001') < 60000, 'whoami');
    envelhecer(); assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
    assert.ok(idadeDoSinalMs(d, 'sessao-teste-0001') < 60000, 'open');
    envelhecer(); assert.equal(p.ah(['nota', 'mexendo']).codigo, 0);
    assert.ok(idadeDoSinalMs(d, 'sessao-teste-0001') < 60000, 'nota');
    envelhecer(); p.ah(['close']);
    assert.ok(idadeDoSinalMs(d, 'sessao-teste-0001') < 60000, 'close');
  } finally {
    p.limpar();
  }
});

test('whoami com AH_PID_AGENTE só regrava a sessão quando o pid muda, e sob a trava das frentes', async () => {
  const p = criarProjeto();
  try {
    const d = dirDoTeste(p);
    const arq = path.join(d, 'sessoes', 'sessao-teste-0001.json');
    const comPid = { AH_PID_AGENTE: String(process.pid) };
    assert.equal(p.ah(['whoami'], { env: comPid }).codigo, 0);
    // pid igual: o JSON não é regravado (nem o mtime muda)
    const antes = statSync(arq).mtimeMs;
    const texto = readFileSync(arq, 'utf8');
    await new Promise(r => setTimeout(r, 20));
    assert.equal(p.ah(['whoami'], { env: comPid }).codigo, 0);
    assert.equal(statSync(arq).mtimeMs, antes);
    assert.equal(readFileSync(arq, 'utf8'), texto);
    // pid novo com a trava presa: o whoami espera a trava antes de gravar
    const trava = path.join(d, 'travas', 'frentes');
    mkdirSync(trava, { recursive: true });
    writeFileSync(path.join(trava, 'dono.json'), JSON.stringify({ pid: process.pid, em: new Date().toISOString(), marca: 'teste' }));
    const ah = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'nucleo', 'bin', 'ah.mjs');
    const filho = spawn(process.execPath, [ah, 'whoami'], { cwd: p.raiz, env: { ...p.env, AH_PID_AGENTE: '1' }, stdio: 'ignore' });
    const saiu = new Promise(r => filho.once('exit', c => r(c)));
    await new Promise(r => setTimeout(r, 400));
    assert.equal(JSON.parse(readFileSync(arq, 'utf8')).pid, process.pid, 'gravou sem a trava');
    rmSync(trava, { recursive: true, force: true });
    assert.equal(await saiu, 0);
    assert.equal(JSON.parse(readFileSync(arq, 'utf8')).pid, 1);
  } finally {
    p.limpar();
  }
});

test('whoami com AH_PID_AGENTE não desfaz a frente gravada pelo open', () => {
  const p = criarProjeto();
  try {
    const comPid = { AH_PID_AGENTE: String(process.pid) };
    assert.equal(p.ah(['whoami'], { env: comPid }).codigo, 0);
    assert.equal(p.ah(['open', 'carrinho'], { env: comPid }).codigo, 0);
    assert.equal(p.ah(['whoami'], { env: { AH_PID_AGENTE: '1' } }).codigo, 0);
    const s = lerSessao(dirDoTeste(p), 'sessao-teste-0001');
    assert.equal(s.frente, 'carrinho'); assert.equal(s.pid, 1);
  } finally {
    p.limpar();
  }
});
