import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, dirDoTeste, gravado } from './apoio/repo.mjs';
import { processoVivo } from './apoio/processo.mjs';

const lerFrenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'frentes', `${nome}.json`), 'utf8'));
const eventos = p => fs.readFileSync(path.join(dirDoTeste(p), 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const marcadores = (p, n) => p.ghTicket(n).comments.map(c => (c.body.match(/<!-- ah:(\S+) .*-->/) ?? [])[1]).filter(Boolean);
const ultimoMarcador = (p, n) => p.ghTicket(n).comments.map(c => c.body).filter(b => /<!-- ah:/.test(b)).at(-1);

// Uma sessão simulada: id, pid do agente e o ambiente dos comandos ah dela.
function sessao(id, pid) {
  const env = { AH_SESSAO: id, ...(pid ? { AH_PID_AGENTE: String(pid) } : {}) };
  return { id, env, opcoes: { env } };
}

// Roda o gancho do Claude Code com um evento gravado, na sessão dada.
function gancho(p, s, nome, troca = {}) {
  const evento = gravado(nome, { cwd: p.raiz, session_id: s.id, ...troca });
  return p.ah(['gancho', 'claude-code'], { entrada: JSON.stringify(evento), env: s.env });
}
const pre = (p, s, ferramenta, entrada) =>
  gancho(p, s, ferramenta === 'Bash' ? 'pre-bash.json' : 'pre-edit.json', { tool_name: ferramenta, tool_input: entrada });

function commitar(p, wt, arquivo, texto, mensagem) {
  fs.writeFileSync(path.join(wt, arquivo), texto);
  assert.equal(p.git(['add', arquivo], { cwd: wt }).codigo, 0);
  const c = p.git(['commit', '-m', mensagem], { cwd: wt });
  assert.equal(c.codigo, 0, c.erro);
}

test('ciclo com duas sessões: aberturas, travas entre elas, close, takeover, handoff, retomada e close', async t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const procA = processoVivo();
  const procB = processoVivo();
  t.after(() => procA.matar());
  t.after(() => procB.matar());

  // 1. Duas sessões, cada uma pelo SessionStart.
  const A = sessao('sessao-a-0001', procA.pid);
  const B = sessao('sessao-b-0002', procB.pid);
  for (const s of [A, B]) {
    const r = gancho(p, s, 'inicio.json');
    assert.equal(r.codigo, 0, r.erro);
    assert.match(r.saida, /^Sessão sessao-/);
    assert.ok(fs.existsSync(path.join(dirDoTeste(p), 'sessoes', `${s.id}.json`)));
  }

  // 2. A abre carrinho (#1), B abre frete (#2).
  let r = p.ah(['open', 'carrinho', '--tickets', '1'], A.opcoes);
  assert.equal(r.codigo, 0, r.erro);
  r = p.ah(['open', 'frete', '--tickets', '2'], B.opcoes);
  assert.equal(r.codigo, 0, r.erro);
  for (const n of [1, 2]) {
    assert.deepEqual(p.ghTicket(n).assignees, ['ana-souza']);
    assert.deepEqual(p.ghTicket(n).labels, ['em-andamento']);
  }
  const carrinho = lerFrenteDoTeste(p, 'carrinho');
  const frete = lerFrenteDoTeste(p, 'frete');
  assert.deepEqual([carrinho.id, carrinho.dona, frete.id, frete.dona], ['as-1', A.id, 'as-2', B.id]);
  const wtCarrinho = carrinho.worktree;
  const wtFrete = frete.worktree;

  // 3. B não mexe no worktree de A: nem edição, nem commit.
  r = pre(p, B, 'Edit', { file_path: path.join(wtCarrinho, 'a.txt'), old_string: 'a', new_string: 'b' });
  assert.equal(r.codigo, 2, r.erro);
  assert.match(r.erro, /Recusado \(T4\)/);
  assert.match(r.erro, /Faça:/);
  r = pre(p, B, 'Bash', { command: `git -C ${wtCarrinho} commit -m x` });
  assert.equal(r.codigo, 2, r.erro);
  assert.match(r.erro, /Recusado \(T4\)/);

  // 4. B não troca o ramo do checkout principal.
  r = pre(p, B, 'Bash', { command: 'git switch main' });
  assert.equal(r.codigo, 2, r.erro);
  assert.match(r.erro, /Recusado \(T1\)/);
  assert.match(r.erro, /Faça:/);

  // 5. B termina frete: commit, merge no principal e close.
  commitar(p, wtFrete, 'frete.txt', 'frete\n', 'feat: frete');
  const m = p.git(['merge', '--no-ff', 'feat/frete', '-m', 'merge: frete']);
  assert.equal(m.codigo, 0, m.erro);
  r = p.ah(['close'], B.opcoes);
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual([p.ghTicket(2).assignees, p.ghTicket(2).labels], [[], []]);
  assert.match(ultimoMarcador(p, 2), /<!-- ah:fechamento .*estado=livre/);
  assert.ok(!fs.existsSync(path.join(dirDoTeste(p), 'frentes', 'frete.json')));

  // 6. A morre; B assume carrinho, só com --confirmado.
  await procA.matar();
  r = p.ah(['takeover', 'carrinho'], B.opcoes);
  assert.equal(r.codigo, 1, r.erro);
  assert.match(r.erro, /--confirmado/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, A.id);
  r = p.ah(['takeover', 'carrinho', '--confirmado'], B.opcoes);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, B.id);
  assert.match(ultimoMarcador(p, 1), /<!-- ah:tomada id=as-1 /);

  // 7. Agora B edita no worktree de carrinho.
  r = pre(p, B, 'Edit', { file_path: path.join(wtCarrinho, 'a.txt'), old_string: 'a', new_string: 'b' });
  assert.equal(r.codigo, 0, r.erro);

  // 8. B faz commit e passa o bastão.
  commitar(p, wtCarrinho, 'a.txt', 'a\n', 'feat: carrinho');
  r = p.ah(['handoff', '--nota', 'falta o cupom'], B.opcoes);
  assert.equal(r.codigo, 0, r.erro);
  const passada = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([passada.estado, passada.dona], ['passada', null]);
  assert.match(p.git(['ls-remote', 'origin', 'feat/carrinho']).saida, /refs\/heads\/feat\/carrinho/);
  assert.match(ultimoMarcador(p, 1), /falta o cupom[\s\S]*<!-- ah:passagem id=as-1 /);
  assert.deepEqual(p.ghTicket(1).assignees, ['ana-souza']);

  // 9. Sessão C retoma pelo open, com o mesmo ID.
  const C = sessao('sessao-c-0003');
  r = p.ah(['open', 'carrinho'], C.opcoes);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho retomada\./);
  const retomada = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([retomada.id, retomada.estado, retomada.dona], ['as-1', 'ativa', C.id]);
  assert.match(ultimoMarcador(p, 1), /<!-- ah:retomada id=as-1 /);

  // 10. C faz merge e close; nada fica aberto.
  const m2 = p.git(['merge', '--no-ff', 'feat/carrinho', '-m', 'merge: carrinho']);
  assert.equal(m2.codigo, 0, m2.erro);
  r = p.ah(['close'], C.opcoes);
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual([p.ghTicket(1).assignees, p.ghTicket(1).labels], [[], []]);
  assert.match(ultimoMarcador(p, 1), /<!-- ah:fechamento .*estado=livre/);
  assert.deepEqual(marcadores(p, 1), ['frente', 'tomada', 'passagem', 'retomada', 'fechamento']);
  const b = p.ah(['board'], C.opcoes);
  assert.equal(b.codigo, 0, b.erro);
  assert.match(b.saida, /Nenhuma frente aberta\./);

  // Eventos, na ordem relativa esperada.
  const esperados = [
    e => e.tipo === 'abertura' && e.frente === 'carrinho',
    e => e.tipo === 'abertura' && e.frente === 'frete',
    e => e.tipo === 'recusa' && e.trava === 'T4',
    e => e.tipo === 'recusa' && e.trava === 'T4',
    e => e.tipo === 'recusa' && e.trava === 'T1',
    e => e.tipo === 'fechamento' && e.nome === 'frete' && e.sessao === B.id,
    e => e.tipo === 'tomada' && e.frente === 'carrinho' && e.de === A.id && e.sessao === B.id,
    e => e.tipo === 'passagem' && e.frente === 'carrinho',
    e => e.tipo === 'retomada' && e.frente === 'carrinho' && e.sessao === C.id,
    e => e.tipo === 'fechamento' && e.nome === 'carrinho' && e.id === 'as-1' && e.sessao === C.id,
  ];
  const lista = eventos(p);
  let i = 0;
  for (const e of lista) if (i < esperados.length && esperados[i](e)) i++;
  assert.equal(i, esperados.length, `parou no esperado ${i}; eventos: ${lista.map(e => `${e.tipo}${e.trava ? `:${e.trava}` : ''}${e.frente ?? e.nome ? `:${e.frente ?? e.nome}` : ''}`).join(', ')}`);
});
