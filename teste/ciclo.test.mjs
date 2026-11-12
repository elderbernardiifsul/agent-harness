import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, ganchoPre, dirDoTeste } from './apoio/repo.mjs';

const eventos = p => fs.readFileSync(path.join(dirDoTeste(p), 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

test('ciclo completo: init, doctor, open, recusas do gancho, merge, close', () => {
  const p = criarProjeto({ remoto: false });
  try {
    const d = p.ah(['doctor']);
    assert.equal(d.codigo, 0, d.saida + d.erro);

    const o = p.ah(['open', 'carrinho', '--tickets', '1']);
    assert.equal(o.codigo, 0, o.erro);
    const wt = JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'frentes', 'carrinho.json'), 'utf8')).worktree;
    fs.writeFileSync(path.join(wt, 'carrinho.txt'), 'itens\n');
    assert.equal(p.git(['add', 'carrinho.txt'], { cwd: wt }).codigo, 0);
    assert.equal(p.git(['commit', '-m', 'feat: carrinho'], { cwd: wt }).codigo, 0);

    const t2 = ganchoPre(p, { command: 'git add -A' });
    assert.equal(t2.codigo, 2);
    assert.match(t2.erro, /Recusado \(T2\)/);
    assert.match(t2.erro, /Faça:/);

    const t5 = ganchoPre(p, { command: 'git push origin main' });
    assert.equal(t5.codigo, 2);
    assert.match(t5.erro, /Recusado \(T5\)/);

    assert.equal(p.git(['switch', 'dev']).codigo, 0);
    assert.equal(p.git(['merge', '--no-ff', 'feat/carrinho', '-m', 'merge: carrinho']).codigo, 0);
    const c = p.ah(['close']);
    assert.equal(c.codigo, 0, c.erro);

    const b = p.ah(['board']);
    assert.equal(b.codigo, 0);
    assert.match(b.saida, /Nenhuma frente aberta\./);

    const tipos = eventos(p).map(e => e.tipo);
    assert.equal(tipos.filter(t => t === 'abertura').length, 1);
    assert.equal(tipos.filter(t => t === 'recusa').length, 2);
    assert.equal(tipos.filter(t => t === 'fechamento').length, 1);
  } finally {
    p.limpar();
  }
});
