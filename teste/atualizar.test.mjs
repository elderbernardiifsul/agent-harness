import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { copiarHarness, criarProjeto, dirDoTeste } from './apoio/repo.mjs';
import { lerManifesto, listaInstalada } from '../nucleo/lib/copia.mjs';
import { VERSAO } from '../nucleo/versao.mjs';

const ler = (p, rel) => fs.readFileSync(path.join(p.raiz, ...rel.split('/')), 'utf8');
const existe = (p, rel) => fs.existsSync(path.join(p.raiz, ...rel.split('/')));
const nucleo = p => path.join(p.raiz, '.harness', 'nucleo');
const TRECHO_NOVO = '<!-- agent-harness: início (o ah init reescreve este trecho; escreva fora das marcas) -->\n## Harness de agentes\n\nTrecho novo.\n<!-- agent-harness: fim -->\n';

// Projeto preparado e commitado, e um clone mais novo: um arquivo novo, um alterado, um removido e o trecho do AGENTS.md trocado.
function cenario(t) {
  const p = criarProjeto();
  const clone = copiarHarness();
  t.after(() => { p.limpar(); clone.limpar(); });
  clone.gravar('nucleo/lib/novidade.mjs', 'export const nova = 1;\n');
  clone.gravar('nucleo/comandos/whoami.mjs', `${fs.readFileSync(path.join(clone.raiz, 'nucleo', 'comandos', 'whoami.mjs'), 'utf8')}// versão nova\n`);
  clone.apagar('nucleo/comandos/nota.mjs');
  clone.gravar('modelos/agents-trecho.md', TRECHO_NOVO);
  return { p, clone };
}

// Roda o ah da cópia instalada no projeto.
function instalado(p, args) {
  const r = spawnSync(process.execPath, [path.join(nucleo(p), 'bin', 'ah.mjs'), ...args], { cwd: p.raiz, env: p.env, encoding: 'utf8' });
  return { codigo: r.status ?? 1, saida: r.stdout ?? '', erro: r.stderr ?? '' };
}

// Todos os arquivos (caminho e conteúdo) de uma pasta, para comparar antes e depois.
function retrato(dir, fora = []) {
  const r = {};
  const andar = (d, rel) => {
    let nomes = [];
    try { nomes = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of nomes) {
      const relativo = rel ? `${rel}/${e.name}` : e.name;
      if (fora.includes(relativo)) continue;
      if (e.isDirectory()) andar(path.join(d, e.name), relativo);
      else r[relativo] = fs.readFileSync(path.join(d, e.name), 'utf8');
    }
  };
  andar(dir, '');
  return r;
}

test('atualizar troca o núcleo pelo do clone, reaplica o AGENTS.md e não toca na configuração, nas extensões nem no estado', t => {
  const { p, clone } = cenario(t);
  fs.writeFileSync(path.join(p.raiz, 'AGENTS.md'), `# Projeto loja\n\nTexto do projeto.\n\n${ler(p, 'AGENTS.md')}`);
  fs.writeFileSync(path.join(p.raiz, '.harness', 'extensoes', 'minha.mjs'), 'export const x = 1;\n');
  const cfg = path.join(p.raiz, '.harness', 'config.json');
  const c = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  c.ci.comandoDeTeste = 'npm test';
  fs.writeFileSync(cfg, JSON.stringify(c, null, 2));
  assert.equal(p.ah(['whoami']).codigo, 0);
  const configAntes = fs.readFileSync(cfg, 'utf8');
  const estadoAntes = retrato(dirDoTeste(p), ['eventos.jsonl', 'origem.json']);

  const r = clone.ah(p, ['atualizar']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, new RegExp(`Atualizei \\.harness/nucleo/ de ${VERSAO.replaceAll('.', '\\.')} \\(\\w+\\) para ${VERSAO.replaceAll('.', '\\.')} \\(sem commit\\)`));
  assert.match(r.saida, /Novos:\n {4}lib\/novidade\.mjs/);
  assert.match(r.saida, /Alterados:\n {4}comandos\/whoami\.mjs\n {4}modelos\/agents-trecho\.md\n/);
  assert.match(r.saida, /Removidos:\n {4}comandos\/nota\.mjs/);
  assert.match(r.saida, /Reapliquei o trecho do harness em AGENTS\.md/);
  assert.match(r.saida, /git commit -m "chore: atualiza o agent-harness"/);

  assert.equal(ler(p, '.harness/nucleo/lib/novidade.mjs'), 'export const nova = 1;\n');
  assert.match(ler(p, '.harness/nucleo/comandos/whoami.mjs'), /\/\/ versão nova\n$/);
  assert.equal(existe(p, '.harness/nucleo/comandos/nota.mjs'), false);
  assert.equal(ler(p, '.harness/nucleo/modelos/agents-trecho.md'), TRECHO_NOVO);
  const m = lerManifesto(nucleo(p));
  assert.equal(m.commit, null);
  assert.deepEqual(m.arquivos, listaInstalada(nucleo(p)).lista);
  assert.deepEqual(fs.readdirSync(path.join(p.raiz, '.harness')).sort(), ['config.json', 'extensoes', 'nucleo']);

  assert.equal(ler(p, 'AGENTS.md'), `# Projeto loja\n\nTexto do projeto.\n\n${TRECHO_NOVO}`);
  assert.equal(fs.readFileSync(cfg, 'utf8'), configAntes);
  assert.equal(ler(p, '.harness/extensoes/minha.mjs'), 'export const x = 1;\n');
  assert.deepEqual(retrato(dirDoTeste(p), ['eventos.jsonl', 'origem.json']), estadoAntes);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'origem.json'), 'utf8')).clone, clone.raiz);
  const ev = fs.readFileSync(path.join(dirDoTeste(p), 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.tipo === 'atualizacao');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].para, VERSAO);
  assert.deepEqual([ev[0].novos, ev[0].alterados, ev[0].removidos, ev[0].forcado], [1, 2, 1, false]);

  // A cópia nova funciona e repetir não muda nada.
  assert.equal(instalado(p, ['whoami']).codigo, 0);
  const manifestoAntes = ler(p, '.harness/nucleo/MANIFEST.json');
  const de2 = clone.ah(p, ['atualizar']);
  assert.equal(de2.codigo, 0, de2.erro);
  assert.match(de2.saida, /^Nada a atualizar: \.harness\/nucleo\/ já é o do clone/);
  assert.equal(ler(p, '.harness/nucleo/MANIFEST.json'), manifestoAntes);
});

test('--simular diz o que mudaria e não grava nada', t => {
  const { p, clone } = cenario(t);
  const antes = retrato(p.raiz, ['.git']);
  const r = clone.ah(p, ['atualizar', '--simular']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^Atualizaria \.harness\/nucleo\//);
  assert.match(r.saida, /Novos:\n {4}lib\/novidade\.mjs/);
  assert.match(r.saida, /Reaplicaria o trecho do harness em AGENTS\.md/);
  assert.match(r.saida, /Simulação: nada foi gravado\.\n$/);
  assert.deepEqual(retrato(p.raiz, ['.git']), antes);
  assert.equal(fs.existsSync(path.join(dirDoTeste(p), 'eventos.jsonl')) && /atualizacao/.test(fs.readFileSync(path.join(dirDoTeste(p), 'eventos.jsonl'), 'utf8')), false);
});

test('arquivo do núcleo alterado à mão recusa com a lista e a saída; --forcar descarta', t => {
  const { p, clone } = cenario(t);
  fs.appendFileSync(path.join(nucleo(p), 'comandos', 'board.mjs'), '// mexi aqui\n');
  fs.writeFileSync(path.join(nucleo(p), 'lib', 'minha.mjs'), 'export {};\n');
  fs.rmSync(path.join(nucleo(p), 'comandos', 'sweep.mjs'));
  p.git(['add', '-A', '--', '.harness']);
  p.git(['commit', '-m', 'mexe no núcleo']);
  const antes = retrato(nucleo(p));

  const r = clone.ah(p, ['atualizar']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /comandos\/board\.mjs \(mudou\)/);
  assert.match(r.erro, /comandos\/sweep\.mjs \(sumiu\)/);
  assert.match(r.erro, /lib\/minha\.mjs \(a mais\)/);
  assert.match(r.erro, /Recusado: 3 arquivo\(s\) de \.harness\/nucleo\/ alterado\(s\) à mão/);
  assert.match(r.erro, /Faça: leve a mudança para o clone .*--forcar/);
  assert.deepEqual(retrato(nucleo(p)), antes);
  assert.match(fs.readFileSync(path.join(dirDoTeste(p), 'eventos.jsonl'), 'utf8'), /"tipo":"recusa-de-comando","comando":"atualizar"/);

  const s = clone.ah(p, ['atualizar', '--simular']);
  assert.equal(s.codigo, 1);
  assert.match(s.saida, /^Atualizaria/);

  const f = clone.ah(p, ['atualizar', '--forcar']);
  assert.equal(f.codigo, 0, f.erro);
  assert.match(f.saida, /Descartei \(--forcar\):\n {2}comandos\/board\.mjs \(mudou\)/);
  assert.doesNotMatch(ler(p, '.harness/nucleo/comandos/board.mjs'), /mexi aqui/);
  assert.equal(existe(p, '.harness/nucleo/lib/minha.mjs'), false);
  assert.equal(existe(p, '.harness/nucleo/comandos/sweep.mjs'), true);
});

test('manifesto sem a lista (anterior à fatia 5): confere pelo git o que não foi commitado', t => {
  const { p, clone } = cenario(t);
  const arq = path.join(nucleo(p), 'MANIFEST.json');
  const m = JSON.parse(fs.readFileSync(arq, 'utf8'));
  delete m.arquivos;
  fs.writeFileSync(arq, JSON.stringify(m, null, 2));
  p.git(['commit', '-qam', 'manifesto antigo']);
  fs.appendFileSync(path.join(nucleo(p), 'comandos', 'board.mjs'), '// sem commit\n');
  const r = clone.ah(p, ['atualizar']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /comandos\/board\.mjs \(não commitado\)/);
  p.git(['checkout', '--', '.harness/nucleo/comandos/board.mjs']);
  const ok = clone.ah(p, ['atualizar']);
  assert.equal(ok.codigo, 0, ok.erro);
  assert.ok(lerManifesto(nucleo(p)).arquivos);
});

test('clone mais velho que o instalado recusa; --forcar volta; abaixo do harnessMinimo nunca', t => {
  const { p, clone } = cenario(t);
  const arq = path.join(nucleo(p), 'MANIFEST.json');
  const m = JSON.parse(fs.readFileSync(arq, 'utf8'));
  m.versao = '9.0.0';
  fs.writeFileSync(arq, JSON.stringify(m, null, 2));
  const r = clone.ah(p, ['atualizar']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, new RegExp(`Recusado: o clone tem a versão ${VERSAO.replaceAll('.', '\\.')}, mais velha que a instalada \\(9\\.0\\.0\\)`));
  assert.match(r.erro, /Faça: atualize o clone \(git pull nele\), ou repita com --forcar/);
  assert.equal(clone.ah(p, ['atualizar', '--forcar']).codigo, 0);
  assert.equal(lerManifesto(nucleo(p)).versao, VERSAO);

  clone.gravar('nucleo/versao.mjs', "export const VERSAO = '0.0.1';\n");
  const v = clone.ah(p, ['atualizar', '--forcar']);
  assert.equal(v.codigo, 1);
  assert.match(v.erro, /Recusado: o clone tem a versão 0\.0\.1 e o projeto pede 0\.1\.0 ou mais nova \(harnessMinimo\)/);
});

test('a cópia instalada sem --de recusa e diz o clone registrado; com --de entrega ao clone', t => {
  const { p, clone } = cenario(t);
  const r = instalado(p, ['atualizar']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Recusado: não sei de onde atualizar: este é o núcleo instalado no projeto, não o clone/);
  assert.match(r.erro, /Faça: rode tools\/ah atualizar --de \S+agent-harness/);

  const errado = instalado(p, ['atualizar', '--de', p.raiz]);
  assert.equal(errado.codigo, 1);
  assert.match(errado.erro, /não é um clone do agent-harness/);

  const d = instalado(p, ['atualizar', '--de', clone.raiz]);
  assert.equal(d.codigo, 0, d.erro);
  assert.match(d.saida, /Novos:\n {4}lib\/novidade\.mjs/);
  assert.equal(existe(p, '.harness/nucleo/lib/novidade.mjs'), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'origem.json'), 'utf8')).clone, clone.raiz);
});

test('sobra de uma troca interrompida: a cópia nova sai; sem o núcleo, recusa com o mv que o devolve', t => {
  const { p, clone } = cenario(t);
  const novo = path.join(p.raiz, '.harness', 'nucleo.novo-1-2');
  fs.mkdirSync(novo);
  assert.equal(clone.ah(p, ['atualizar']).codigo, 0);
  assert.equal(fs.existsSync(novo), false);

  const velho = path.join(p.raiz, '.harness', 'nucleo.velho-1-2');
  fs.renameSync(nucleo(p), velho);
  const r = clone.ah(p, ['atualizar']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Recusado: uma atualização parou no meio/);
  assert.match(r.erro, /Faça: devolva a cópia antiga com mv \.harness\/nucleo\.velho-1-2 \.harness\/nucleo/);
  assert.equal(fs.existsSync(velho), true);
});

test('opção desconhecida e --de sem valor recusam com a saída', t => {
  const { p, clone } = cenario(t);
  assert.match(clone.ah(p, ['atualizar', '--tudo']).erro, /Recusado: Opção desconhecida: --tudo\nFaça: use ah atualizar/);
  assert.match(clone.ah(p, ['atualizar', '--de']).erro, /Recusado: A opção --de precisa de um valor\.\nFaça: escreva --de/);
});

test('tools/ah diferente do modelo novo: o atualizar não troca e diz como trocar', t => {
  const { p, clone } = cenario(t);
  clone.gravar('modelos/ah', '#!/bin/sh\n# entrada nova\n');
  const antes = ler(p, 'tools/ah');
  const r = clone.ah(p, ['atualizar']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Fora do núcleo, diferentes do que o init deste clone grava \(não mexi\):\n {2}tools\/ah\nFaça: rode o init a partir do clone/);
  assert.doesNotMatch(r.saida, /tools\/ah\.cmd|settings\.json/);
  assert.equal(ler(p, 'tools/ah'), antes);
});
