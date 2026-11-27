import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  acharDiarios, corpoDoDiario, devolverDiario, diarioDoComentario, lerDiario, lerMarcador, limparPastaDoSdd, mascararSegredos, resumoDoFechamento,
} from '../nucleo/extensoes/registros/diario.mjs';

const PLANO = 'docs/superpowers/plans/2026-11-20-carrinho.md';
// Um diário como o subagent-driven-development 7.0.2 escreve (references/fix-loop.md e SKILL.md).
const DIARIO = `# SDD ledger — plan: ${PLANO}
Ruling: o plano não cita o frete — sigo sem ele — custa refazer a Tarefa 2 se o frete entrar
Task 1: complete (commits a1b2c3d..e4f5a6b, review clean)
Task 2: minor (deferred): nome da variável
Task 2: complete (commits e4f5a6b..0c1d2e3, 1 parked)
Task 3: fix round 2/5 (1 addressed, 1 open — soma com desconto; commits 0c1d2e3..9f8e7d6)
`;
const FRENTE = { id: 'as-1', nome: 'carrinho' };

function pasta(t) {
  const p = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ah-diario-')));
  t.after(() => fs.rmSync(p, { recursive: true, force: true }));
  return p;
}

test('lerDiario reconhece as linhas da 7.0.2: concluídas, paradas e decisões', () => {
  const d = lerDiario(DIARIO);
  assert.equal(d.reconhecido, true);
  assert.equal(d.plano, PLANO);
  assert.deepEqual(d.concluidas, [
    { tarefa: 1, de: 'a1b2c3d', ate: 'e4f5a6b', revisao: 'review clean' },
    { tarefa: 2, de: 'e4f5a6b', ate: '0c1d2e3', revisao: '1 parked' },
  ]);
  assert.deepEqual(d.paradas, [{ tarefa: 3, ultima: 'Task 3: fix round 2/5 (1 addressed, 1 open — soma com desconto; commits 0c1d2e3..9f8e7d6)' }]);
  assert.equal(d.decisoes.length, 1);
  assert.match(d.decisoes[0], /^Ruling: o plano não cita o frete/);
  const outro = lerDiario('anotações soltas\nTask 1: complete (commits a..b, review clean)\n');
  assert.equal(outro.reconhecido, false);
  assert.equal(outro.plano, null);
});

test('corpoDoDiario e a leitura de volta dão o mesmo marcador e o mesmo texto', () => {
  for (const [plano, texto] of [
    [PLANO, DIARIO],
    ['docs/planos/plano com espaço.md', `# SDD ledger — plan: docs/planos/plano com espaço.md\nTask 1: complete (commits a..b, review clean)\n\`\`\`js\nconst x = 1;\n\`\`\`\n\`\`\`\`\`\n`],
  ]) {
    const em = '2026-11-27T12:00:00.000Z';
    const { corpo, cortado } = corpoDoDiario({ frente: FRENTE, diario: { pasta: 'carrinho', plano, texto }, commit: '9f8e7d6', em });
    assert.equal(cortado, false);
    assert.match(corpo, /^<!-- ah:registro id=as-1 nome=carrinho pasta=carrinho plano=\S+ commit=9f8e7d6 cortado=0 em=\S+ fase=passagem v=2 -->\n/);
    assert.deepEqual(lerMarcador(corpo), { id: 'as-1', nome: 'carrinho', pasta: 'carrinho', plano, commit: '9f8e7d6', cortado: false, em, fase: 'passagem' });
    assert.equal(diarioDoComentario(corpo), texto);
  }
  assert.equal(lerMarcador('comentário qualquer'), null);
  assert.equal(lerMarcador('<!-- ah:registro-resumo id=as-1 nome=carrinho v=1 -->'), null);
  assert.equal(diarioDoComentario('sem bloco'), null);
  // Comentário editado no navegador volta com \r\n: o diário continua legível.
  const { corpo } = corpoDoDiario({ frente: FRENTE, diario: { pasta: 'carrinho', plano: PLANO, texto: DIARIO }, commit: 'abc1234' });
  assert.equal(diarioDoComentario(corpo.replace(/\n/g, '\r\n')), DIARIO);
});

test('diário em formato desconhecido vai cortado em 4000 caracteres, e o comentário diz isso', () => {
  const texto = `notas do aluno\n${'x'.repeat(9000)}\n`;
  const { corpo, cortado } = corpoDoDiario({ frente: FRENTE, diario: { pasta: 'notas', plano: null, texto }, commit: 'abc1234' });
  assert.equal(cortado, true);
  assert.match(corpo, /cortado=1/);
  assert.match(corpo, /Formato não reconhecido/);
  assert.ok(diarioDoComentario(corpo).length <= 4001);
  assert.equal(lerMarcador(corpo).plano, null);
});

test('diário reconhecido maior que 60000 caracteres vai cortado, abaixo do limite do GitHub', () => {
  const texto = `# SDD ledger — plan: ${PLANO}\n${'Task 1: fix round 1/5 (muito texto)\n'.repeat(2000)}`;
  assert.ok(texto.length > 70000);
  const { corpo, cortado } = corpoDoDiario({ frente: FRENTE, diario: { pasta: 'carrinho', plano: PLANO, texto }, commit: 'abc1234' });
  assert.equal(cortado, true);
  assert.match(corpo, /cortado em 60000 caracteres/);
  assert.ok(corpo.length < 65536, String(corpo.length));
});

test('resumoDoFechamento conta tarefas, paradas e decisões por plano', () => {
  const corpo = resumoDoFechamento({ frente: FRENTE, copias: [{ pasta: 'carrinho', plano: PLANO, texto: DIARIO }, { pasta: 'notas', plano: null, texto: 'texto livre\n' }] });
  assert.match(corpo, /^<!-- ah:registro-resumo id=as-1 nome=carrinho v=1 -->\n/);
  assert.match(corpo, new RegExp(`Plano \`${PLANO}\`: 2 tarefas concluídas \\(Task 1 a1b2c3d\\.\\.e4f5a6b, review clean; Task 2 e4f5a6b\\.\\.0c1d2e3, 1 parked\\), 1 parada \\(Task 3: fix round 2/5`));
  assert.match(corpo, /1 decisão/);
  assert.match(corpo, /^ {2}- Ruling: o plano não cita o frete/m);
  assert.match(corpo, /Plano notas: diário em formato não reconhecido/);
  assert.equal(lerMarcador(corpo), null);
});

test('acharDiarios e devolverDiario: ida e volta com dois planos, sem reescrever o .gitignore', t => {
  const wt = pasta(t);
  devolverDiario(wt, { pasta: 'carrinho', plano: PLANO, texto: DIARIO });
  devolverDiario(wt, { pasta: 'frete', plano: 'docs/frete.md', texto: '# SDD ledger — plan: docs/frete.md\n' });
  const sdd = path.join(wt, '.superpowers', 'sdd');
  assert.equal(fs.readFileSync(path.join(sdd, '.gitignore'), 'utf8'), '*\n');
  assert.equal(fs.readFileSync(path.join(sdd, 'carrinho', 'plan-path'), 'utf8'), `${PLANO}\n`);
  fs.writeFileSync(path.join(sdd, '.gitignore'), '*\n!progress.md\n');
  devolverDiario(wt, { pasta: 'carrinho', plano: PLANO, texto: DIARIO });
  assert.equal(fs.readFileSync(path.join(sdd, '.gitignore'), 'utf8'), '*\n!progress.md\n');
  // Pasta de plano sem plan-path: o plano vem da primeira linha. Pasta sem progress.md não é diário.
  fs.mkdirSync(path.join(sdd, 'sem-marcador'));
  fs.writeFileSync(path.join(sdd, 'sem-marcador', 'progress.md'), `# SDD ledger — plan: docs/outro.md\n`);
  fs.mkdirSync(path.join(sdd, 'vazia'));
  assert.deepEqual(acharDiarios(wt).map(d => [d.pasta, d.plano, d.texto.split('\n')[0]]), [
    ['carrinho', PLANO, `# SDD ledger — plan: ${PLANO}`],
    ['frete', 'docs/frete.md', '# SDD ledger — plan: docs/frete.md'],
    ['sem-marcador', 'docs/outro.md', '# SDD ledger — plan: docs/outro.md'],
  ]);
  assert.equal(acharDiarios(wt)[0].arquivo, path.join(sdd, 'carrinho', 'progress.md'));
  assert.deepEqual(acharDiarios(path.join(wt, 'nao-existe')), []);
  // Nome de pasta vindo de fora (marcador de ticket) não sai de .superpowers/sdd/.
  assert.throws(() => devolverDiario(wt, { pasta: '../fora', plano: null, texto: 'x\n' }), /pasta inválida/);
  // Nem nome que começa por ponto (sombrearia o .gitignore do sdd-workspace), nem plano fora da raiz.
  assert.throws(() => devolverDiario(wt, { pasta: '.gitignore', plano: null, texto: 'x\n' }), /pasta inválida/);
  for (const plano of ['../../../etc/x', '/etc/x', 'docs\\x.md']) {
    assert.throws(() => devolverDiario(wt, { pasta: 'outro', plano, texto: 'x\n' }), /plano inválido/, plano);
  }
});

test('limparPastaDoSdd tira só os arquivos copiados e o .gitignore do sdd-workspace; o resto fica e é devolvido', t => {
  const wt = pasta(t);
  const sdd = path.join(wt, '.superpowers', 'sdd');
  devolverDiario(wt, { pasta: 'carrinho', plano: PLANO, texto: DIARIO });
  fs.writeFileSync(path.join(sdd, 'carrinho', 'task-1-brief.md'), 'instruções');
  const copiados = ['carrinho/progress.md', 'carrinho/plan-path', 'carrinho/task-1-brief.md'].map(r => path.join(sdd, r));
  assert.deepEqual(limparPastaDoSdd(wt, new Set(), new Set(copiados)), []);
  assert.ok(!fs.existsSync(path.join(wt, '.superpowers')));
  // O que não foi copiado fica: um arquivo novo na pasta do plano, um arquivo do aluno e uma pasta sem marcador.
  devolverDiario(wt, { pasta: 'carrinho', plano: PLANO, texto: DIARIO });
  fs.writeFileSync(path.join(sdd, 'carrinho', 'novo.md'), 'apareceu depois');
  fs.writeFileSync(path.join(sdd, 'minhas-notas.txt'), 'notas');
  fs.mkdirSync(path.join(sdd, 'rascunhos'));
  fs.writeFileSync(path.join(sdd, 'rascunhos', 'a.txt'), 'a');
  const sobras = limparPastaDoSdd(wt, new Set(), new Set(['carrinho/progress.md', 'carrinho/plan-path'].map(r => path.join(sdd, r))));
  assert.deepEqual(sobras, ['.superpowers/sdd/carrinho/novo.md', '.superpowers/sdd/minhas-notas.txt', '.superpowers/sdd/rascunhos/']);
  assert.ok(!fs.existsSync(path.join(sdd, 'carrinho', 'progress.md')));
  assert.ok(fs.existsSync(path.join(sdd, '.gitignore')));
  assert.deepEqual(limparPastaDoSdd(path.join(wt, 'nao-existe')), []);
});

test('marcador v=2: em e fase; o v=1 ainda se lê, como o mais antigo e de passagem', () => {
  const { corpo } = corpoDoDiario({ frente: FRENTE, diario: { pasta: 'carrinho', plano: PLANO, texto: DIARIO }, commit: 'abc1234', fase: 'guardado', em: '2026-11-27T10:00:00.000Z' });
  assert.match(corpo, /^<!-- ah:registro .* em=2026-11-27T10%3A00%3A00\.000Z fase=guardado v=2 -->\n/);
  const m = lerMarcador(corpo);
  assert.deepEqual([m.em, m.fase], ['2026-11-27T10:00:00.000Z', 'guardado']);
  const antigo = lerMarcador('<!-- ah:registro id=as-1 nome=carrinho pasta=carrinho plano= commit=abc1234 cortado=0 v=1 -->\n');
  assert.deepEqual([antigo.em, antigo.fase, antigo.pasta], ['', 'passagem', 'carrinho']);
  assert.equal(lerMarcador('<!-- ah:registro id=as-1 pasta=x fase=outra v=2 -->'), null);
});

test('mascararSegredos troca padrões evidentes de segredo por [removido] e conta quantos', () => {
  // Valores inventados, montados por partes para nenhum deles parecer um segredo de verdade no repositório.
  const gh = `ghp_${'a1B2'.repeat(9)}`;
  const pat = `github_pat_${'X9y8'.repeat(8)}`;
  const sk = `sk-${'q'.repeat(24)}`;
  const aws = `AKIA${'B'.repeat(16)}`;
  const pem = ['-----BEGIN OPENSSH PRIVATE KEY-----', 'b3BlbnNzaC1rZXktdjEAAAAA', '-----END OPENSSH PRIVATE KEY-----'].join('\n');
  const texto = [
    `Ruling: usei o token ${gh} só no teste`,
    `chave nova: ${pat}`,
    `OPENAI ${sk} e AWS ${aws}`,
    pem,
    'GITHUB_TOKEN=abc123segredo',
    'DB_PASSWORD: "minha senha"',
    'export API_KEY=valor-qualquer',
    'DATABASE_URL=postgres://ana:SenhaReal123@db.exemplo.test/loja',
  ].join('\n');
  const r = mascararSegredos(texto);
  assert.equal(r.n, 9);
  for (const segredo of [gh, pat, sk, aws, 'b3BlbnNzaC1rZXktdjEAAAAA', 'abc123segredo', 'minha senha', 'valor-qualquer', 'SenhaReal123']) {
    assert.ok(!r.texto.includes(segredo), segredo);
  }
  assert.match(r.texto, /^GITHUB_TOKEN=\[removido\]$/m);
  assert.match(r.texto, /^DATABASE_URL=postgres:\/\/ana:\[removido\]@db\.exemplo\.test\/loja$/m);
  // Texto comum do diário não muda.
  const comum = `${DIARIO}Ruling: a chave do cache é o id do carrinho — TOKEN de sessão fica fora — custa pouco\nTask 4: minor (deferred): KEY_PREFIX constante\n`;
  assert.deepEqual(mascararSegredos(comum), { texto: comum, n: 0 });
});

test('corpoDoDiario mascara os segredos antes de cortar e diz quantos removeu', () => {
  const texto = `${DIARIO}Ruling: rodei com GITHUB_TOKEN=abc123segredo — custa nada\n`;
  const { corpo, removidos } = corpoDoDiario({ frente: FRENTE, diario: { pasta: 'carrinho', plano: PLANO, texto }, commit: 'abc1234' });
  assert.equal(removidos, 1);
  assert.ok(!corpo.includes('abc123segredo'));
  assert.match(corpo, /GITHUB_TOKEN=\[removido\]/);
  assert.match(resumoDoFechamento({ frente: FRENTE, copias: [{ pasta: 'carrinho', plano: PLANO, texto }] }), /GITHUB_TOKEN=\[removido\]/);
});
