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
  // A subárvore de #12 sai uma vez (sob #14 > #13); sob a raiz #13 ela vira "ver acima".
  assert.match(s, /^#14 Frete por região\n {2}bloqueada por #13 Cupom no checkout \(aberta\)\n {4}bloqueada por #12 Carrinho persistente \(aberta\)\n {6}bloqueada por #11 Base do catálogo \(fechada\)\n {4}bloqueada por exemplo\/pagamentos#5 API de pagamento \(aberta\)$/m);
  assert.match(s, /^#13 Cupom no checkout\n {2}bloqueada por #12 Carrinho persistente \(aberta, ver acima\)\n {2}bloqueada por exemplo\/pagamentos#5 API de pagamento \(aberta\)$/m);
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
  assert.match(r.saida, /^Bloqueios de exemplo\/loja \(leitura guardada de \d{4}-\d{2}-\d{2} \d{2}:\d{2} America\/Sao_Paulo; sem acesso ao GitHub agora\)$/m);
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
  assert.match(r.erro, /^Aviso: o ticket #14 está bloqueado por #13 \(aberta\); a frente abre assim mesmo \(leitura de ah deps de \d{4}-\d{2}-\d{2} \d{2}:\d{2} America\/Sao_Paulo\)\.$/m);
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

// Achado 5 da revisão: o cache feito só por `ah deps <n>` não é a lista das abertas; sem rede, `ah deps` avisa
// que a lista de livres sai dele e o marca como parcial no JSON.
test('cache feito só por ah deps <n> é parcial: sem rede, ah deps avisa; depois da lista inteira, não', t => {
  const p = projeto(t);
  assert.equal(p.ah(['deps', '13']).codigo, 0);
  const r = p.ah(['deps'], FORA);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^Aviso: a leitura guardada veio só de ah deps <ticket> \(\d+ issues\), não da lista das abertas: as livres para começar podem ser outras\. Com acesso ao GitHub, rode ah deps\.$/m);
  assert.equal(JSON.parse(p.ah(['deps', '--json'], FORA).saida).parcial, true);
  assert.equal(p.ah(['deps']).codigo, 0);
  assert.equal(p.ah(['deps', '13']).codigo, 0); // soma à lista inteira: continua completa
  const s = p.ah(['deps'], FORA);
  assert.doesNotMatch(s.saida, /veio só de ah deps <ticket>/);
  assert.equal(JSON.parse(p.ah(['deps', '--json'], FORA).saida).parcial, false);
});

// Achado 6 da revisão: grafo denso (cada issue bloqueada por todas as anteriores) não pode explodir; a
// subárvore já mostrada vira "ver acima", no texto e no JSON.
test('grafo denso: cada subárvore aparece uma vez e as repetições dizem ver acima', async t => {
  const p = projeto(t);
  const N = 30;
  const issues = {};
  for (let k = 1; k <= N; k++) {
    issues[k] = { numero: k, titulo: `Tarefa ${k}`, estado: 'aberta', bloqueadoPor: Array.from({ length: k - 1 }, (_, j) => ({ numero: k - 1 - j, repo: null, titulo: null, estado: 'aberta' })) };
  }
  fs.mkdirSync(dirDoTeste(p), { recursive: true });
  fs.writeFileSync(cacheDe(p), JSON.stringify({ esquema: 1, repo: 'exemplo/loja', lidoEm: new Date().toISOString(), fonte: 'api', completa: true, issues }));
  const rodar = async args => {
    const { processo, fim } = p.ahAoFundo(args, FORA);
    const prazo = setTimeout(() => processo.kill('SIGKILL'), 20000);
    const r = await fim;
    clearTimeout(prazo);
    return r;
  };
  const r = await rodar(['deps']);
  assert.equal(r.codigo, 0, `${r.erro} (sinal ${r.sinal})`);
  assert.match(r.saida, /^#30 Tarefa 30\n {2}bloqueada por #29 Tarefa 29 \(aberta\)\n {4}bloqueada por #28 Tarefa 28 \(aberta\)\n/m);
  assert.match(r.saida, /^ {2}bloqueada por #28 Tarefa 28 \(aberta, ver acima\)$/m);
  const j = JSON.parse((await rodar(['deps', '--json'])).saida);
  // No JSON, cada issue tem a subárvore expandida uma vez só; as repetições vêm com verAcima e sem filhos.
  const expandidas = new Map();
  const percorrer = nos => {
    for (const n of nos) {
      if (n.verAcima) assert.deepEqual(n.bloqueadaPor, []);
      if (n.bloqueadaPor.length) expandidas.set(n.numero, (expandidas.get(n.numero) ?? 0) + 1);
      percorrer(n.bloqueadaPor);
    }
  };
  for (const i of j.issues) percorrer(i.bloqueadaPor);
  assert.ok([...expandidas.values()].every(v => v === 1), JSON.stringify([...expandidas]));
  assert.ok(j.issues.some(i => i.bloqueadaPor.some(b => b.verAcima)));
  const uma = await rodar(['deps', '30']);
  assert.equal(uma.codigo, 0, uma.erro);
  assert.ok(uma.saida.split('\n').length < 2000, `${uma.saida.split('\n').length} linhas`);
});
