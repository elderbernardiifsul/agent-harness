import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto } from './apoio/repo.mjs';

const arquivoDaFrente = (p, nome) => path.join(p.estado, 'loja', 'frentes', `${nome}.json`);
const lerFrenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(arquivoDaFrente(p, nome), 'utf8'));
const gravarFrenteDoTeste = (p, f) => fs.writeFileSync(arquivoDaFrente(p, f.nome), JSON.stringify(f));
const SEM_SESSAO = { env: { AH_SESSAO: '' } };

test('board lista a frente; vazio diz que não há', () => {
  const vazio = criarProjeto();
  assert.match(vazio.ah(['board']).saida, /Nenhuma frente aberta\./);
  const { fila, ...resto } = JSON.parse(vazio.ah(['board', '--json']).saida);
  assert.deepEqual(resto, { frentes: [], sessoes: [], sessoesIlegiveis: [], sobreposicoes: [], sobreposicaoIncompleta: false });
  assert.deepEqual([fila.entradas, fila.erro], [[], null]);
  assert.doesNotMatch(vazio.ah(['board']).saida, /Fila de pesado/);
  vazio.limpar();

  const p = criarProjeto();
  assert.equal(p.ah(['open', 'carrinho', '--tickets', '1,2']).codigo, 0);
  const r = p.ah(['board']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /as-1\s+carrinho\s+sessao-t\s+ativa\s+#1,#2\s+—\s+—\s+—/);
  assert.match(r.saida, /^ID\s+NOME\s+DONA\s+ESTADO\s+TICKETS\s+SOBREPÕE\s+PLANO\s+ÚLTIMA NOTA/m);
  assert.equal(JSON.parse(p.ah(['board', '--json']).saida).frentes[0].id, 'as-1');
  p.limpar();
});

test('board funciona sem id de sessão', () => {
  const p = criarProjeto();
  p.ah(['open', 'carrinho']);
  const r = p.ah(['board'], SEM_SESSAO);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /as-1\s+carrinho/);
  p.limpar();
});

test('board ordena por abertaEm e mostra frente sem dona com traço', () => {
  const p = criarProjeto();
  p.ah(['open', 'zeta']);
  p.ah(['open', 'alfa'], { env: { AH_SESSAO: 'sessao-teste-0002' } });
  const zeta = lerFrenteDoTeste(p, 'zeta');
  zeta.abertaEm = '2026-11-12T10:00:00-03:00';
  zeta.dona = null;
  gravarFrenteDoTeste(p, zeta);
  const alfa = lerFrenteDoTeste(p, 'alfa');
  alfa.abertaEm = '2026-11-12T09:00:00-03:00';
  gravarFrenteDoTeste(p, alfa);
  const linhas = p.ah(['board']).saida.split('\n');
  assert.ok(linhas.findIndex(l => l.includes('alfa')) < linhas.findIndex(l => l.includes('zeta')));
  assert.match(linhas.find(l => l.includes('zeta')), /zeta\s+—\s+órfã/); // ativa sem dona viva é órfã (revisão da tarefa 3)
  assert.deepEqual(JSON.parse(p.ah(['board', '--json']).saida).frentes.map(f => f.nome), ['alfa', 'zeta']);
  p.limpar();
});

test('board corta textos longos e notas com quebra de linha não quebram a tabela', () => {
  const p = criarProjeto();
  p.ah(['open', 'carrinho']);
  const f = lerFrenteDoTeste(p, 'carrinho');
  f.plano = `docs/${'p'.repeat(100)}.md`;
  f.notas = [{ em: 'x', sessao: 's', texto: 'primeira' }, { em: 'y', sessao: 's', texto: `linha um\nlinha dois\r\n${'n'.repeat(200)}` }];
  gravarFrenteDoTeste(p, f);
  const linhas = p.ah(['board']).saida.split('\n').filter(Boolean);
  assert.equal(linhas.length, 3, 'cabeçalho, uma linha e a das sessões vivas');
  assert.match(linhas[2], /^Sessões vivas: /);
  assert.match(linhas[1], /linha um linha dois/);
  assert.doesNotMatch(linhas[1], /primeira/);
  assert.ok(linhas[1].length < 200, `linha longa demais: ${linhas[1].length}`);
  assert.match(linhas[1], /…/);
  p.limpar();
});

test('board recusa opção desconhecida e argumento a mais', () => {
  const p = criarProjeto();
  const r = p.ah(['board', '--tudo']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Opção desconhecida/);
  assert.equal(p.ah(['board', 'x']).codigo, 1);
  p.limpar();
});

// ---- revisão da tarefa 3: sessão ilegível não derruba o quadro
const arquivoDaSessao = (p, id) => path.join(p.estado, 'loja', 'sessoes', `${id}.json`);

test('board com a dona ilegível: (ilegível), ativa (não órfã, como no sweep) e a linha das sessões ilegíveis, em texto e em JSON', () => {
  const p = criarProjeto();
  p.ah(['open', 'carrinho']);
  fs.writeFileSync(arquivoDaSessao(p, 'sessao-teste-0001'), '{ quebrado');
  const r = p.ah(['board']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /as-1\s+carrinho\s+sessao-t \(ilegível\)\s+ativa/);
  assert.ok(!p.ah(['sweep']).saida.includes('frente-orfa'), 'o sweep também não a acusa órfã');
  assert.match(r.saida, /^Sessões ilegíveis: sessao-t \(rode ah doctor\)$/m);
  const j = p.ah(['board', '--json']);
  assert.equal(j.codigo, 0, j.erro);
  const d = JSON.parse(j.saida);
  assert.equal(d.frentes[0].donaViva, false);
  assert.equal(d.frentes[0].donaIlegivel, true);
  assert.deepEqual(d.sessoesIlegiveis, ['sessao-teste-0001']);
  p.limpar();
});

test('board com sessão ilegível que não é dona: o quadro segue e acusa a sessão', () => {
  const p = criarProjeto();
  p.ah(['open', 'carrinho']);
  fs.writeFileSync(arquivoDaSessao(p, 'sessao-c-0003'), '{ quebrado');
  const r = p.ah(['board']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /as-1\s+carrinho\s+sessao-t\s+ativa/);
  assert.match(r.saida, /Sessões vivas: sessao-t \(executor, carrinho, sem processo\)/);
  assert.match(r.saida, /^Sessões ilegíveis: sessao-c \(rode ah doctor\)$/m);
  const d = JSON.parse(p.ah(['board', '--json']).saida);
  assert.equal(d.frentes[0].donaViva, true);
  assert.equal(d.frentes[0].donaIlegivel, false);
  assert.deepEqual(d.sessoesIlegiveis, ['sessao-c-0003']);
  assert.deepEqual(d.sessoes.map(s => s.id), ['sessao-teste-0001']);
  p.limpar();
});

// ---- Onda final
test('sessão sem pid (ah rodado à mão) aparece viva marcada "sem processo"; com AH_PID_AGENTE, sem a marca', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  assert.equal(p.ah(['whoami'], { env: { AH_SESSAO: 'sessao-b-0002', AH_PID_AGENTE: String(process.pid) } }).codigo, 0);
  const r = p.ah(['board']);
  assert.match(r.saida, /Sessões vivas: .*sessao-t \(executor, carrinho, sem processo\)/);
  assert.match(r.saida, /sessao-b \(executor, —\)(;|$)/m);
  const d = JSON.parse(p.ah(['board', '--json']).saida);
  assert.deepEqual(d.sessoes.map(s => [s.curto, s.semProcesso]).sort(), [['sessao-b', false], ['sessao-t', true]]);
});

test('board mostra a fila de pesado: quem roda, quem espera, classe e há quanto tempo', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const dir = path.join(path.dirname(p.raiz), 'fila');
  fs.mkdirSync(dir, { recursive: true });
  const ha = min => new Date(Date.now() - min * 60000).toISOString();
  fs.writeFileSync(path.join(dir, 'fila.json'), JSON.stringify({ versao: 1, proximaSenha: 4, entradas: [
    { senha: 3, pid: 999999, inicio: null, projeto: 'loja', worktree: '/wt/frete', comando: 'npm run e2e', classe: 'exclusivo', vagas: 'todas', chegou: ha(2), rodandoDesde: null },
    { senha: 2, pid: process.pid, inicio: null, projeto: 'loja', worktree: '/wt/carrinho', comando: 'npm run build', classe: 'grande', vagas: 1, chegou: ha(10), rodandoDesde: ha(5) },
  ] }));
  const env = { env: { AH_FILA: dir } };
  const r = p.ah(['board'], env);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^Fila de pesado \(2 vaga\(s\)\):\n {2}rodando +senha 2 {2}grande {2}há 5 min {2}loja, carrinho {2}npm run build\n {2}esperando senha 3 {2}exclusivo {2}há 2 min {2}loja, frete {2}\(processo morto\) {2}npm run e2e$/m);
  const j = JSON.parse(p.ah(['board', '--json'], env).saida).fila;
  assert.deepEqual(j.entradas.map(e => [e.senha, e.estado, e.classe, e.morta]), [[2, 'rodando', 'grande', false], [3, 'esperando', 'exclusivo', true]]);
  assert.ok(j.entradas[0].haMs >= 5 * 60000);
  fs.writeFileSync(path.join(dir, 'fila.json'), JSON.stringify({ versao: 7 }));
  const v = p.ah(['board'], env);
  assert.equal(v.codigo, 0);
  assert.match(v.saida, /Fila de pesado: O estado da fila tem formato 7.*\(rode ah doctor\)/);
});

test('coluna BLOQUEIOS: só com a leitura guardada do ah deps, sem rede, e o rodapé diz de quando ela é', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  assert.equal(p.ah(['open', 'carrinho', '--tickets', '1,2']).codigo, 0);
  assert.equal(p.ah(['open', 'frete', '--tickets', '4'], { env: { AH_SESSAO: 'sessao-teste-0002' } }).codigo, 0);
  // Sem leitura guardada: sem coluna e sem rodapé.
  let r = p.ah(['board']);
  assert.doesNotMatch(r.saida, /BLOQUEIOS|Bloqueios:/);
  assert.equal(JSON.parse(p.ah(['board', '--json']).saida).bloqueiosLidosEm, undefined);

  const b = (numero, estado, repo = null) => ({ numero, repo, titulo: null, estado });
  fs.writeFileSync(path.join(p.estado, 'loja', 'deps.json'), JSON.stringify({
    esquema: 1, lidoEm: '2026-11-13T13:05:00Z', completa: true, parcial: false,
    issues: {
      1: { numero: 1, titulo: 'Um', estado: 'aberta', bloqueadoPor: [b(3, 'aberta'), b(5, 'fechada')] },
      2: { numero: 2, titulo: 'Dois', estado: 'aberta', bloqueadoPor: [b(7, 'aberta', 'dono/outro')] },
      3: { numero: 3, titulo: 'Três', estado: 'aberta', bloqueadoPor: [] },
      4: { numero: 4, titulo: 'Quatro', estado: 'aberta', bloqueadoPor: [b(5, 'fechada')] },
    },
  }));
  const antes = p.ghChamadas().length;
  r = p.ah(['board']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(p.ghChamadas().length, antes, 'o quadro foi à rede');
  assert.match(r.saida, /^ID .* ÚLTIMA NOTA +BLOQUEIOS$/m);
  assert.match(r.saida, /^as-1 +carrinho .* #3,dono\/outro#7$/m);
  assert.match(r.saida, /^as-2 +frete .* —$/m);
  assert.match(r.saida, /^Bloqueios: leitura de ah deps de 2026-11-13 10:05 America\/Sao_Paulo \(rode ah deps para atualizar\)\.$/m);
  const j = JSON.parse(p.ah(['board', '--json']).saida);
  assert.equal(j.bloqueiosLidosEm, '2026-11-13T13:05:00Z');
  assert.deepEqual(j.frentes.map(f => [f.nome, f.bloqueios]), [['carrinho', ['#3', 'dono/outro#7']], ['frete', []]]);
});
