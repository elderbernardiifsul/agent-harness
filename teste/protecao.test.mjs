import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarRepo, escreverConfig } from './apoio/repo.mjs';
import { protegerRamo, protecaoDoRamo } from '../nucleo/lib/github.mjs';

const ler = (p, rel) => fs.readFileSync(path.join(p.raiz, rel), 'utf8');
const existe = (p, rel) => fs.existsSync(path.join(p.raiz, rel));
const ARQ = '.github/workflows/ah-ci.yml';
const puts = p => p.ghChamadas().filter(c => c.argv.includes('PUT'));
// O gh falso responde 404 "Branch not protected" ao GET da proteção (senão o init vê o ramo como já protegido).
const semProtecao = (p, extra = [], ramos = ['main', 'stage']) => p.ghResponder([
  ...extra,
  ...ramos.map(r => ({ prefixo: ['api', `repos/exemplo/loja/branches/${r}/protection`], codigo: 1, saida: '{"message":"Branch not protected","status":"404"}' })),
]);
const o = p => ({ cwd: p.raiz, env: p.env });

test('init protege os ramos que estão no remoto, com enforce_admins', () => {
  const p = criarRepo();
  p.git(['push', 'origin', 'main', 'stage']);
  semProtecao(p);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.equal(r.codigo, 0, r.erro);
  const chamadas = puts(p);
  assert.deepEqual(chamadas.map(c => c.argv.find(a => a.includes('/branches/'))).sort(),
    ['repos/exemplo/loja/branches/main/protection', 'repos/exemplo/loja/branches/stage/protection']);
  const corpo = JSON.parse(chamadas[0].entrada);
  assert.equal(corpo.enforce_admins, true);
  assert.deepEqual(corpo.required_pull_request_reviews, { required_approving_review_count: 0 });
  assert.equal(corpo.required_status_checks, null);
  assert.equal(corpo.restrictions, null);
  assert.ok(chamadas[0].argv.includes('--input') && chamadas[0].argv.includes('-'));
});

test('ramo que não está no remoto: aviso, sem PUT para ele', () => {
  const p = criarRepo();
  p.git(['push', 'origin', 'main']);
  semProtecao(p);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /stage ainda não está no remoto; rode ah init de novo depois do primeiro push/);
  assert.equal(puts(p).length, 1);
});

test('sem remoto: init segue e avisa, sem chamar a API de proteção', () => {
  const p = criarRepo({ remoto: false });
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(puts(p).length, 0);
  assert.match(r.erro, /origin/);
});

test('conta sem direito a proteção: init segue e avisa', () => {
  const p = criarRepo();
  p.git(['push', 'origin', 'main', 'stage']);
  semProtecao(p, [{ prefixo: ['api', '-X', 'PUT'], codigo: 1, saida: 'HTTP 403' }]);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /Sem proteção no servidor para main: HTTP 403\. Só a trava local protege\./);
  assert.match(r.erro, /Sem proteção no servidor para stage/);
});

test('--sem-protecao não chama a API', () => {
  const p = criarRepo();
  p.git(['push', 'origin', 'main', 'stage']);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(puts(p).length, 0);
  assert.doesNotMatch(r.erro, /ainda não está no remoto/);
});

test('os ramos protegidos vêm da configuração', () => {
  const p = criarRepo({ ramos: ['main', 'dev', 'release'] });
  escreverConfig(p, { git: { protegidos: ['release'] } });
  p.git(['push', 'origin', 'main', 'release']);
  semProtecao(p, [], ['release']);
  const r = p.ah(['init', '--sigla', 'as']);
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual(puts(p).map(c => c.argv.find(a => a.includes('/branches/'))), ['repos/exemplo/loja/branches/release/protection']);
});

test('rodar o init duas vezes é idempotente (CI e proteção)', () => {
  const p = criarRepo();
  p.git(['push', 'origin', 'main', 'stage']);
  semProtecao(p);
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--teste', 'npm test']).codigo, 0);
  const antes = ler(p, ARQ);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--teste', 'npm test']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(ler(p, ARQ), antes);
  assert.doesNotMatch(r.saida, /^\s+\.github\/workflows\/ah-ci\.yml$/m); // não aparece entre os gravados
  assert.equal(puts(p).length, 4);
  // com o servidor já protegido, o segundo init não altera nada
  p.ghResponder([]);
  const r3 = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--teste', 'npm test']);
  assert.match(r3.saida, /main já está protegido no servidor; não alterei/);
  assert.equal(puts(p).length, 4);
});

test('CI com comando de teste', () => {
  const p = criarRepo();
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--teste', 'npm test', '--sem-protecao']);
  assert.equal(r.codigo, 0, r.erro);
  const y = ler(p, ARQ);
  assert.match(y, /run: 'npm test'/);
  assert.doesNotMatch(y, /if: false/);
  assert.match(y, /branches: \[ ?'dev' ?\]/);
  assert.match(y, /pull_request/);
  assert.match(y, /permissions:\n  contents: read/);
  assert.match(y, /runs-on: ubuntu-latest/);
  assert.doesNotMatch(r.erro, /CI criada desligada/);
});

test('CI sem comando nasce desligada e avisa', () => {
  const p = criarRepo();
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(ler(p, ARQ), /if: false/);
  assert.match(r.erro, /CI criada desligada: defina ci\.comandoDeTeste em \.harness\/config\.json e rode ah init de novo/);
});

test('definir o comando na configuração e rodar o init de novo liga a CI', () => {
  const p = criarRepo();
  p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']);
  const cfg = JSON.parse(ler(p, '.harness/config.json'));
  cfg.ci.comandoDeTeste = 'make check';
  fs.writeFileSync(path.join(p.raiz, '.harness/config.json'), JSON.stringify(cfg));
  const r = p.ah(['init', '--sigla', 'as', '--sem-protecao']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(ler(p, ARQ), /run: 'make check'/);
  assert.doesNotMatch(ler(p, ARQ), /if: false/);
});

test('CI editada à mão (sem a marca do harness) não é sobrescrita sem --sobrescrever', () => {
  const p = criarRepo();
  p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']);
  fs.writeFileSync(path.join(p.raiz, ARQ), 'name: minha\n');
  // Sem --teste: com a configuração existente, --teste diferente dela é recusado antes (teste no init.test).
  const r = p.ah(['init', '--sigla', 'as', '--sem-protecao']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /ah-ci\.yml/);
  assert.equal(ler(p, ARQ), 'name: minha\n');
  assert.equal(p.ah(['init', '--sigla', 'as', '--sem-protecao', '--sobrescrever']).codigo, 0);
  assert.match(ler(p, ARQ), /ubuntu-latest/);
});

test('comando de teste com dois pontos ou aspas vira YAML válido', () => {
  const p = criarRepo();
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao', '--teste', "echo 'a: b' # x"]);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(ler(p, ARQ), /run: 'echo ''a: b'' # x'/);
});

test('o comando de teste vai ao run: exatamente como veio', () => {
  for (const cmd of ['echo $$', "grep -c 'x$' f", 'echo $&', 'echo $`', "echo $'a'", 'make\tcheck', 'echo "oi" && ls']) {
    const p = criarRepo();
    const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao', '--teste', cmd]);
    assert.equal(r.codigo, 0, r.erro);
    const y = ler(p, ARQ);
    assert.ok(y.includes(`      - run: '${cmd.replaceAll("'", "''")}'\n`), `${cmd}\n${y}`);
    assert.equal(y.split('\n').length, 18);
  }
});

test('expressão do Actions no comando de teste é recusada', () => {
  const p = criarRepo();
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao', '--teste', 'echo ${{ secrets.X }}']);
  assert.notEqual(r.codigo, 0);
  assert.match(r.erro, /expressões do Actions/);
  assert.equal(existe(p, ARQ), false);
});

test('ramo já protegido no servidor: init não faz PUT e diz que não alterou', () => {
  const p = criarRepo();
  p.git(['push', 'origin', 'main', 'stage']);
  semProtecao(p, [{ prefixo: ['api', 'repos/exemplo/loja/branches/main/protection'], codigo: 0, saida: '{"required_status_checks":{}}' }]);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /main já está protegido no servidor; não alterei/);
  assert.deepEqual(puts(p).map(c => c.argv.find(a => a.includes('/branches/'))), ['repos/exemplo/loja/branches/stage/protection']);
});

test('GET da proteção negado (403, plano gratuito): aviso e nenhum PUT', () => {
  const p = criarRepo();
  p.git(['push', 'origin', 'main', 'stage']);
  p.ghResponder(['main', 'stage'].map(r => ({ prefixo: ['api', `repos/exemplo/loja/branches/${r}/protection`], codigo: 1, saida: '{"message":"Upgrade to GitHub Pro or make this repository public to enable this feature.","status":"403"}' })));
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(puts(p).length, 0);
  assert.match(r.erro, /Sem proteção no servidor para main: Upgrade to GitHub Pro or make this repository public to enable this feature\. Só a trava local protege\./);
});

test('remoto inacessível: um aviso só, diferente de "ainda não está no remoto"', () => {
  const p = criarRepo();
  p.git(['remote', 'set-url', 'origin', path.join(p.raiz, 'nao-existe.git')]);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(r.erro.match(/Não consegui consultar o remoto/g).length, 1);
  assert.match(r.erro, /proteção não conferida\. Rode ah init de novo quando o remoto responder\./);
  assert.doesNotMatch(r.erro, /ainda não está no remoto/);
  assert.equal(puts(p).length, 0);
});

test('gh ausente: init sai com 0 e avisa', () => {
  const p = criarRepo();
  p.git(['push', 'origin', 'main', 'stage']);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as'], { env: { AH_GH: path.join(p.raiz, 'nao-existe-gh') } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /Sem proteção no servidor para main: .*Só a trava local protege\./);
});

test('ramo com barra vai codificado por segmento no caminho da API', () => {
  const p = criarRepo();
  protegerRamo('rel/1.0 x', o(p));
  assert.ok(p.ghChamadas().at(-1).argv.includes('repos/exemplo/loja/branches/rel/1.0%20x/protection'));
});

test('comando de teste com nova linha é recusado antes de gravar', () => {
  const p = criarRepo();
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao', '--teste', 'npm test\nrm -rf x']);
  assert.notEqual(r.codigo, 0);
  assert.match(r.erro, /Faça: escreva o comando numa linha só/);
  assert.equal(existe(p, ARQ), false);
  assert.equal(existe(p, '.harness/config.json'), false);
});

test('motivo vem da message do JSON da API', () => {
  const p = criarRepo();
  p.ghResponder([{ prefixo: ['api', '-X', 'PUT'], codigo: 1, saida: '{"message":"Resource not accessible","status":"403"}' }]);
  assert.deepEqual(protegerRamo('main', o(p)), { ok: false, motivo: 'Resource not accessible' });
});

test('protegerRamo e protecaoDoRamo', () => {
  const p = criarRepo();
  assert.deepEqual(protegerRamo('main', o(p)), { ok: true });
  p.ghResponder([{ prefixo: ['api', '-X', 'PUT'], codigo: 1, saida: 'Upgrade to GitHub Pro\nmais' }]);
  const r = protegerRamo('main', o(p));
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'Upgrade to GitHub Pro');
  p.ghResponder([{ prefixo: ['api', 'repos/exemplo/loja/branches/main/protection'], codigo: 0, saida: '{}' }]);
  assert.equal(protecaoDoRamo('main', o(p)), 'protegido');
  p.ghResponder([{ prefixo: ['api', 'repos/exemplo/loja/branches/main/protection'], codigo: 1, saida: '{"message":"Branch not protected","status":"404"}' }]);
  assert.equal(protecaoDoRamo('main', o(p)), 'sem-protecao');
  p.ghResponder([{ prefixo: ['api', 'repos/exemplo/loja/branches/main/protection'], codigo: 1, saida: 'HTTP 403' }]);
  assert.equal(protecaoDoRamo('main', o(p)), 'desconhecido');
  p.ghResponder([]);
  p.env.GH_FALSO_FORA = '1';
  assert.equal(protecaoDoRamo('main', o(p)), 'desconhecido');
  assert.equal(protegerRamo('main', o(p)).ok, false);
});
