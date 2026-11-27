// Monta o laboratório do ensaio da skill orquestrar com o Claude Code (fatia 5 do método):
// `node teste/orquestracao-ensaio-montar.mjs <pasta>` cria, dentro de <pasta>, uma loja de mentira com o harness
// instalado a partir deste clone, as extensões orquestracao, modelo e prova ligadas, a skill orquestrar copiada à mão,
// cinco tickets no gh falso e um HOME descartável. No fim, imprime as variáveis de ambiente da rodada (num arquivo
// `ambiente.sh`, sem token nenhum) e o comando. A pasta não pode existir; nada fora dela é tocado.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLONE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [destino] = process.argv.slice(2);
if (!destino) { console.error('uso: node teste/orquestracao-ensaio-montar.mjs <pasta que ainda não existe>'); process.exit(2); }
const LAB = path.resolve(destino);
if (fs.existsSync(LAB)) { console.error(`${LAB} já existe: escolha outra pasta ou apague esta`); process.exit(2); }

const P = {
  casa: path.join(LAB, 'casa'), bin: path.join(LAB, 'bin'), estado: path.join(LAB, 'estado'), wt: path.join(LAB, 'wt'),
  fila: path.join(LAB, 'fila'), remoto: path.join(LAB, 'remoto.git'), loja: path.join(LAB, 'loja'), tickets: path.join(LAB, 'tickets.json'),
};
const GH = path.join(CLONE, 'teste', 'orquestracao-ensaio-gh.mjs');
const env = {
  ...process.env,
  HOME: P.casa, CLAUDE_CONFIG_DIR: path.join(P.casa, '.claude'), PATH: `${P.bin}:${process.env.PATH}`,
  AH_ESTADO: P.estado, AH_WORKTREES: P.wt, AH_FILA: P.fila, AH_GH: GH, GH_FALSO_TICKETS: P.tickets,
  GIT_CONFIG_GLOBAL: path.join(P.casa, '.gitconfig'), GIT_CONFIG_NOSYSTEM: '1',
};
for (const v of ['CLAUDE_CODE_SESSION_ID', 'AH_SESSAO', 'AH_GUARD', 'AH_PESADO_ANINHADO', 'CLAUDE_CODE_OAUTH_TOKEN']) delete env[v];
const rodar = (prog, args, cwd = P.loja) => execFileSync(prog, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const escrever = (rel, texto, base = P.loja) => { fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true }); fs.writeFileSync(path.join(base, rel), texto); };

for (const p of [P.casa, P.bin, P.estado, P.wt, P.fila, P.loja]) fs.mkdirSync(p, { recursive: true });
fs.writeFileSync(env.GIT_CONFIG_GLOBAL, '[user]\n\tname = ana-souza\n\temail = ana@exemplo.test\n[init]\n\tdefaultBranch = main\n');
fs.writeFileSync(path.join(P.bin, 'gh'), `#!/bin/sh\nexec node "${GH}" "$@"\n`, { mode: 0o755 });

// A loja: um módulo pequeno com testes que passam.
escrever('package.json', `${JSON.stringify({ name: 'loja', private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2)}\n`);
escrever('src/carrinho.mjs', `// Carrinho da loja: itens {nome, preco, quantidade}.
export function total(itens) {
  return itens.reduce((soma, i) => soma + i.preco * i.quantidade, 0);
}

export function resumo(itens) {
  return \`\${itens.length} item(ns), total \${total(itens).toFixed(2)}\`;
}
`);
escrever('test/carrinho.test.mjs', `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { total, resumo } from '../src/carrinho.mjs';

const itens = [{ nome: 'caneca', preco: 30, quantidade: 2 }, { nome: 'camiseta', preco: 50, quantidade: 1 }];

test('total soma preço vezes quantidade', () => assert.equal(total(itens), 110));
test('resumo diz itens e total', () => assert.equal(resumo(itens), '2 item(ns), total 110.00'));
`);
escrever('.gitignore', 'node_modules/\n');
rodar('git', ['init', '-q', '-b', 'main']);
rodar('git', ['add', '-A']);
rodar('git', ['commit', '-q', '-m', 'começo da loja']);
rodar('git', ['init', '-q', '--bare', '-b', 'main', P.remoto], LAB);
rodar('git', ['remote', 'add', 'origin', P.remoto]);
rodar('git', ['push', '-q', 'origin', 'main']);

// O harness deste clone, com as extensões do ensaio.
console.log(rodar(process.execPath, [path.join(CLONE, 'nucleo', 'bin', 'ah.mjs'), 'init', '--sigla', 'as', '--sem-protecao']).trim());
rodar('git', ['switch', '-q', 'dev']);
const arqConfig = path.join(P.loja, '.harness', 'config.json');
const config = JSON.parse(fs.readFileSync(arqConfig, 'utf8'));
config.extensoes = { orquestracao: { revisao: ['src/pagamento/**'] }, modelo: true, prova: { comandos: { unit: ['npm', 'test'] } } };
fs.writeFileSync(arqConfig, `${JSON.stringify(config, null, 2)}\n`);
// A skill copiada à mão (as de terceiros não entram neste ensaio).
fs.cpSync(path.join(CLONE, 'nucleo', 'extensoes', 'metodo', 'skills', 'orquestrar'), path.join(P.loja, '.claude', 'skills', 'orquestrar'), { recursive: true });
rodar('git', ['add', '-A']);
rodar('git', ['commit', '-q', '-m', 'chore: instala o agent-harness, liga a orquestração e a skill orquestrar']);
rodar('git', ['push', '-q', 'origin', 'dev', 'stage']);

// Dois prontos e pequenos; um pronto com decisão pendente num comentário; um pronto e bloqueado; um sem rótulo.
const PRONTO = 'ready-for-agent';
fs.writeFileSync(P.tickets, JSON.stringify({
  12: { title: 'Total do carrinho com desconto', labels: [PRONTO], body: 'Em src/carrinho.mjs, `total(itens, desconto)` aceita um desconto em porcentagem (0 a 100, padrão 0) e aplica sobre a soma. Desconto fora de 0 a 100 lança RangeError. Teste para 10% e para o erro.' },
  13: { title: 'Carrinho vazio mostra mensagem', labels: [PRONTO], body: 'Em src/carrinho.mjs, `resumo([])` devolve "Carrinho vazio" em vez de "0 item(ns), total 0.00". Teste para o vazio; o resumo com itens não muda.' },
  14: { title: 'Frete por região', labels: [PRONTO], body: 'Calcular o frete pela região do CEP.', comments: [{ author: 'carla', body: 'A decidir: o frete grátis vale para o Norte?' }] },
  15: { title: 'Cupom no checkout', labels: [PRONTO], body: 'Cupom usa o desconto do total.\n\nBloqueado por: #12' },
  16: { title: 'Página de ajuda', body: 'Texto da página de ajuda.' },
}, null, 2));

const nomes = ['HOME', 'CLAUDE_CONFIG_DIR', 'PATH', 'AH_ESTADO', 'AH_WORKTREES', 'AH_FILA', 'AH_GH', 'GH_FALSO_TICKETS', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'];
fs.writeFileSync(path.join(LAB, 'ambiente.sh'), `${nomes.map(n => `export ${n}=${JSON.stringify(env[n])}`).join('\n')}\nunset CLAUDE_CODE_SESSION_ID AH_SESSAO\n`);
console.log(`\nLaboratório em ${LAB}. Antes da rodada: ${path.join(P.loja, 'tools', 'ah')} candidatos (com o ambiente.sh).`);
console.log(`Rodada (o token é lido na hora, de ~/.claude/.credentials.json do usuário, e não vai para arquivo):\n  cd ${P.loja} && . ../ambiente.sh && CLAUDE_CODE_OAUTH_TOKEN=... claude -p "<pedido>" ...`);
