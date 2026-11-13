import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, dirDoTeste } from './apoio/repo.mjs';
import { bloqueiosDoCorpo } from '../nucleo/lib/deps.mjs';

// #11 fechada; #12 bloqueada pela 11; #13 pela 12 e por uma de outro repositório; #14 pela 13 só no corpo;
// #15 e #16 livres (a 16 ganha frente); #17 é PR e não conta.
const TICKETS = {
  11: { state: 'CLOSED', title: 'Base do catálogo' },
  12: { title: 'Carrinho persistente', blockedBy: [11] },
  13: { title: 'Cupom no checkout', blockedBy: [12, { number: 5, repo: 'exemplo/pagamentos', state: 'open', title: 'API de pagamento' }] },
  14: { title: 'Frete por região', body: 'Contexto do frete.\n\nBloqueado por: #13\n' },
  15: { title: 'Página de ajuda' },
  16: { title: 'Revisão do layout' },
  17: { title: 'PR do carrinho', pullRequest: true },
};

function projeto(t, tickets = TICKETS) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  fs.writeFileSync(p.env.GH_FALSO_TICKETS, JSON.stringify(tickets));
  return p;
}
const FORA = { env: { GH_FALSO_FORA: '1' } };
const SEM_API = { env: { GH_FALSO_SEM_DEPENDENCIAS: '1' } };
const cacheDe = p => path.join(dirDoTeste(p), 'deps.json');
function recusou(r, motivo) {
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, motivo);
  assert.match(r.erro, /Faça: \S/);
}

test('bloqueiosDoCorpo lê a linha "Bloqueado por:" (uma ou mais, com vírgula)', () => {
  assert.deepEqual(bloqueiosDoCorpo('x\nBloqueado por: #3, #7\nbloqueado por: #9'), [3, 7, 9]);
  assert.deepEqual(bloqueiosDoCorpo('Bloqueado por #3'), []);
  assert.deepEqual(bloqueiosDoCorpo(null), []);
  assert.deepEqual(bloqueiosDoCorpo('Bloqueado por: #4 #4'), [4]);
});

test('ah deps mostra a árvore de bloqueios e as livres para começar; grava o cache', t => {
  const p = projeto(t);
  assert.equal(p.ah(['open', 'layout', '--tickets', '16']).codigo, 0);
  const r = p.ah(['deps']);
  assert.equal(r.codigo, 0, r.erro);
  const s = r.saida;
  assert.match(s, /^Bloqueios de exemplo\/loja \(lidos agora\)$/m);
  assert.match(s, /^#13 Cupom no checkout\n {2}bloqueada por #12 Carrinho persistente \(aberta\)\n {4}bloqueada por #11 Base do catálogo \(fechada\)\n {2}bloqueada por exemplo\/pagamentos#5 API de pagamento \(aberta\)$/m);
  assert.match(s, /^#14 Frete por região\n {2}bloqueada por #13 Cupom no checkout \(aberta\)$/m);
  assert.doesNotMatch(s, /^#12 /m); // bloqueada só pela fechada
  assert.match(s, /^Livres para começar: #15 Página de ajuda; #12 Carrinho persistente$/m);
  assert.match(s, /^Sem bloqueio, já com frente: #16 Revisão do layout \(as-1\)$/m);
  assert.doesNotMatch(s, /PR do carrinho/);
  const cache = JSON.parse(fs.readFileSync(cacheDe(p), 'utf8'));
  assert.ok(Date.parse(cache.lidoEm));
  assert.equal(cache.repo, 'exemplo/loja');
  assert.deepEqual(Object.keys(cache.issues).sort(), ['12', '13', '14', '15', '16']);

  const j = JSON.parse(p.ah(['deps', '--json']).saida);
  assert.equal(j.deCache, false);
  assert.equal(j.fonte, 'api');
  assert.deepEqual(j.livres, [15, 12]);
  const i13 = j.issues.find(i => i.numero === 13);
  assert.deepEqual(i13.bloqueadaPor.map(b => [b.repo, b.numero, b.estado]), [[null, 12, 'aberta'], ['exemplo/pagamentos', 5, 'aberta']]);
  assert.equal(j.issues.find(i => i.numero === 16).frente, 'as-1');
});

test('ah deps só chama a API de dependências das issues que o resumo diz ter bloqueio', t => {
  const p = projeto(t);
  p.ah(['deps']);
  const chamadas = fs.readFileSync(p.env.GH_FALSO_LOG, 'utf8').trim().split('\n').map(l => JSON.parse(l).argv).filter(a => a[0] === 'api');
  const deps = chamadas.filter(a => a[1].includes('/dependencies/')).map(a => a[1].replace(/\?.*/, ''));
  assert.deepEqual(deps.sort(), ['repos/exemplo/loja/issues/12/dependencies/blocked_by', 'repos/exemplo/loja/issues/13/dependencies/blocked_by']);
  assert.ok(chamadas.some(a => /^repos\/exemplo\/loja\/issues\?state=open&per_page=100&page=1$/.test(a[1])), JSON.stringify(chamadas));
});

test('ah deps <n> mostra o que bloqueia em cascata e o que ela bloqueia', t => {
  const p = projeto(t);
  let r = p.ah(['deps', '14']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^#14 Frete por região \(aberta\)\nBloqueada por:\n {2}#13 Cupom no checkout \(aberta\)\n {4}#12 Carrinho persistente \(aberta\)\n {6}#11 Base do catálogo \(fechada\)\n {4}exemplo\/pagamentos#5 API de pagamento \(aberta\)\nBloqueia: nada$/m);
  r = p.ah(['deps', '12']);
  assert.match(r.saida, /^Bloqueia:\n {2}#13 Cupom no checkout \(aberta\)$/m);
  // a 13 bloqueia a 14 só pelo corpo: aparece pela leitura guardada
  p.ah(['deps']);
  r = p.ah(['deps', '13', '--json']);
  const j = JSON.parse(r.saida);
  assert.deepEqual(j.ticket, { numero: 13, titulo: 'Cupom no checkout', estado: 'aberta', frente: null });
  assert.deepEqual(j.bloqueia.map(b => b.numero), [14]);
  assert.deepEqual(j.bloqueadaPor.map(b => b.numero), [12, 5]);
  assert.deepEqual(j.bloqueadaPor[0].bloqueadaPor.map(b => [b.numero, b.estado]), [[11, 'fechada']]);
});

test('sem a API de dependências, a fonte é a linha do corpo', t => {
  const p = projeto(t);
  const j = JSON.parse(p.ah(['deps', '--json'], SEM_API).saida);
  assert.equal(j.fonte, 'corpo');
  assert.deepEqual(j.livres, [16, 15, 13, 12]);
  assert.deepEqual(j.issues.find(i => i.numero === 14).bloqueadaPor.map(b => b.numero), [13]);
  const s = p.ah(['deps'], SEM_API).saida;
  assert.match(s, /^Fonte: a linha "Bloqueado por:" do corpo das issues \(a API de dependências do GitHub não respondeu\)$/m);
});

test('sem rede, usa o cache e diz de quando ele é; sem cache, recusa', t => {
  const p = projeto(t);
  recusou(p.ah(['deps'], FORA), /sem acesso ao GitHub e sem leitura guardada/);
  recusou(p.ah(['deps', '13'], FORA), /sem acesso ao GitHub e sem leitura guardada/);
  p.ah(['deps']);
  const r = p.ah(['deps'], FORA);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^Bloqueios de exemplo\/loja \(leitura guardada de \d{4}-\d{2}-\d{2} \d{2}:\d{2}; sem acesso ao GitHub agora\)$/m);
  assert.match(r.saida, /^Livres para começar: #16 Revisão do layout; #15 Página de ajuda; #12 Carrinho persistente$/m);
  const j = JSON.parse(p.ah(['deps', '13', '--json'], FORA).saida);
  assert.equal(j.deCache, true);
  assert.deepEqual(j.bloqueia.map(b => b.numero), [14]);
  recusou(p.ah(['deps', '99'], FORA), /a leitura guardada não tem a issue #99/);
});

test('ah deps recusa ticket inválido, issue que não existe e argumentos a mais, com o próximo passo', t => {
  const p = projeto(t);
  recusou(p.ah(['deps', 'abc']), /ticket inválido: abc/);
  recusou(p.ah(['deps', '12', '13']), /Argumento a mais: 13/);
  recusou(p.ah(['deps', '--tudo']), /Opção desconhecida: --tudo/);
  recusou(p.ah(['deps', '99']), /não achei a issue #99 em exemplo\/loja/);
});

test('open avisa (sem recusar) quando o ticket está bloqueado por outro aberto, pela leitura guardada', t => {
  const p = projeto(t);
  // sem cache, não avisa
  let r = p.ah(['open', 'carrinho', '--tickets', '13']);
  assert.equal(r.codigo, 0, r.erro);
  assert.doesNotMatch(r.erro, /bloquead/);
  p.ah(['deps']);
  const antes = fs.readFileSync(p.env.GH_FALSO_LOG, 'utf8').split('\n').length;
  r = p.ah(['open', 'frete', '--tickets', '14,15'], { env: { AH_SESSAO: 'sessao-teste-0002' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /^Aviso: o ticket #14 está bloqueado por #13 \(aberta\); a frente abre assim mesmo \(leitura de ah deps de \d{4}-\d{2}-\d{2} \d{2}:\d{2}\)\.$/m);
  assert.doesNotMatch(r.erro, /#15 está bloqueado/);
  // o aviso não chama a API de dependências
  const depois = fs.readFileSync(p.env.GH_FALSO_LOG, 'utf8').split('\n').slice(antes - 1).join('\n');
  assert.doesNotMatch(depois, /dependencies/);
});

test('cache ilegível: o open segue sem aviso e o deps sem rede recusa', t => {
  const p = projeto(t);
  fs.mkdirSync(dirDoTeste(p), { recursive: true });
  fs.writeFileSync(cacheDe(p), '{ pela metade');
  const r = p.ah(['open', 'cupom', '--tickets', '13']);
  assert.equal(r.codigo, 0, r.erro);
  recusou(p.ah(['deps'], FORA), /leitura guardada .*ilegível/);
});
