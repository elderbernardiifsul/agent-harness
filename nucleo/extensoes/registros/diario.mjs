// O diário da execução por subagentes: onde fica, como se lê e como vai para um comentário de ticket e volta.
//
// A dor: o subagent-driven-development (Superpowers 7.0.2) guarda o diário de cada plano em
// `.superpowers/sdd/<pasta do plano>/progress.md`, dentro do worktree e ignorado pelo git. Remover o worktree apaga
// o diário, e a própria skill apaga a pasta quando a revisão final fica limpa. Este módulo não guarda nada: só lê e
// escreve o formato. Quem guarda é a extensão (`extensao.mjs`).
//
// O formato da 7.0.2 (SKILL.md, scripts/sdd-workspace e references/ da skill):
//   - a pasta tem `plan-path` (o caminho do plano, relativo à raiz) e `progress.md`;
//   - a primeira linha do diário é `# SDD ledger — plan: <caminho do plano>`;
//   - linhas `Task <N>: complete (commits <a7>..<b7>, review clean|<K> parked)`, `Task <N>: fix round <R>/5 (…)`,
//     `Task <N>: minor (deferred): …`, `Task <N>: parked — …` e decisões com `Ruling:`.
// A leitura é tolerante: diário em outro formato vai como texto, cortado, e o comentário diz isso.
import fs from 'node:fs';
import path from 'node:path';

const CABECALHO = /^# SDD ledger — plan: (.+?)\s*$/;
const CONCLUIDA = /^Task (\d+): complete \(commits ([0-9a-f]+)\.\.([0-9a-f]+), (.+)\)\s*$/;
const TAREFA = /^Task (\d+):/;
// Limites do texto do diário no comentário. O GitHub aceita até 65 536 caracteres por comentário.
export const LIMITE_RECONHECIDO = 60000;
export const LIMITE_DESCONHECIDO = 4000;
// Nome da pasta de plano e caminho do plano vindos de fora (o marcador de um comentário): a pasta não começa por
// ponto (sombrearia o .gitignore do sdd-workspace) nem tem barra; o plano é relativo à raiz, sem `..` nem `\\`.
const PASTA_VALIDA = /^[^./\\][^/\\]*$/;
const planoValido = plano => typeof plano === 'string' && plano !== '' && !path.isAbsolute(plano) && !plano.includes('\\') && !plano.split('/').includes('..');

const sdd = worktree => path.join(worktree, '.superpowers', 'sdd');

// Os arquivos que o subagent-driven-development 7.0.2 grava na pasta de um plano (SKILL.md e scripts/ da skill): o
// diário, o marcador do plano, as instruções e os relatórios de cada tarefa e os pacotes de revisão. Só eles são
// guardados e tirados do worktree; o resto da pasta (um arquivo do aluno) fica, e o close recusa por ele.
const ARQUIVO_DO_SDD = /^(?:progress\.md|plan-path|task-\d+-(?:brief|report)\.md|review-[0-9a-f]+\.\.[0-9a-f]+\.diff)$/;
// Acima disto, o arquivo não é copiado (fica no worktree, com aviso).
export const LIMITE_DO_ARQUIVO = 5 * 1024 * 1024;

// O que um arquivo é, sem seguir link simbólico: 'comum', 'link', 'grande' ou null (não existe ou não é arquivo).
function tipoDoArquivo(abs) {
  let st;
  try { st = fs.lstatSync(abs); } catch { return null; }
  if (st.isSymbolicLink()) return 'link';
  if (!st.isFile()) return null;
  return st.size > LIMITE_DO_ARQUIVO ? 'grande' : 'comum';
}

// Os arquivos do subagent-driven-development na pasta de um plano: {copiar: [abs], recusados: [{abs, motivo}]}. Link
// simbólico não é seguido (poderia apontar para fora do worktree) e arquivo grande não é copiado: os dois ficam.
export function arquivosDoSdd(pastaDoPlano) {
  let nomes;
  try { nomes = fs.readdirSync(pastaDoPlano).sort(); } catch { return { copiar: [], recusados: [] }; }
  const copiar = [];
  const recusados = [];
  for (const nome of nomes.filter(n => ARQUIVO_DO_SDD.test(n))) {
    const abs = path.join(pastaDoPlano, nome);
    const tipo = tipoDoArquivo(abs);
    if (tipo === 'comum') copiar.push(abs);
    else if (tipo === 'link') recusados.push({ abs, motivo: 'link simbólico' });
    else if (tipo === 'grande') recusados.push({ abs, motivo: 'maior que 5 MB' });
  }
  return { copiar, recusados };
}
const lerOuNada = arquivo => { try { return fs.readFileSync(arquivo, 'utf8'); } catch { return null; } };
const curta = (t, n = 100) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

// Os diários do worktree, um por pasta de plano, em ordem de nome: [{pasta, plano, arquivo, texto}].
export function acharDiarios(worktree) {
  let nomes;
  try {
    nomes = fs.readdirSync(sdd(worktree), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch {
    return [];
  }
  const achados = [];
  for (const pasta of nomes) {
    const arquivo = path.join(sdd(worktree), pasta, 'progress.md');
    // Só o diário que é arquivo comum: um link simbólico levaria a publicar o arquivo para onde ele aponta.
    if (tipoDoArquivo(arquivo) !== 'comum') continue;
    const texto = lerOuNada(arquivo);
    if (texto === null) continue;
    const marcado = lerOuNada(path.join(sdd(worktree), pasta, 'plan-path'))?.trim() || null;
    achados.push({ pasta, plano: marcado ?? lerDiario(texto).plano, arquivo, texto });
  }
  return achados;
}

// O que o diário diz: {reconhecido, plano, concluidas: [{tarefa, de, ate, revisao}], paradas: [{tarefa, ultima}],
// decisoes: [linha]}. `paradas` são as tarefas citadas sem a linha `complete`, com a última linha de cada uma.
export function lerDiario(texto) {
  const linhas = String(texto).split('\n');
  const cabeca = CABECALHO.exec(linhas[0] ?? '');
  const concluidas = [];
  const ultimas = new Map();
  const decisoes = [];
  for (const l of linhas) {
    const c = CONCLUIDA.exec(l);
    if (c) concluidas.push({ tarefa: Number(c[1]), de: c[2], ate: c[3], revisao: c[4] });
    const t = TAREFA.exec(l);
    if (t) ultimas.set(Number(t[1]), l.trim());
    if (l.includes('Ruling:')) decisoes.push(l.trim());
  }
  const feitas = new Set(concluidas.map(c => c.tarefa));
  const paradas = [...ultimas].filter(([n]) => !feitas.has(n)).map(([tarefa, ultima]) => ({ tarefa, ultima }));
  return { reconhecido: Boolean(cabeca), plano: cabeca?.[1] ?? null, concluidas, paradas, decisoes };
}

// A cerca do bloco de código tem uma crase a mais que a maior sequência de crases do diário (no mínimo quatro),
// para o texto nunca fechar o bloco antes da hora.
function cercaPara(texto) {
  const maiores = [...String(texto).matchAll(/`+/g)].map(m => m[0].length + 1);
  return '`'.repeat(Math.max(4, ...maiores));
}

// `<!-- ah:<tipo> chave=valor … v=<n> -->`, com cada valor em encodeURIComponent (sem espaço, legível por máquina).
function marcador(tipo, campos, versao = 1) {
  const pares = Object.entries(campos).map(([k, v]) => `${k}=${encodeURIComponent(v ?? '')}`);
  return `<!-- ah:${tipo} ${pares.join(' ')} v=${versao} -->`;
}

// As duas fases de um diário no ticket. `passagem`: o trabalho continua (handoff), e a retomada o devolve.
// `guardado`: saiu do worktree de propósito (`registros guardar`), e a retomada não o traz de volta.
export const FASES = ['passagem', 'guardado'];

// Segredos com cara de segredo, para mascarar antes de o diário ir ao ticket (que pode ser público, e o handoff
// comenta sozinho). É uma rede, não garantia: pega os formatos evidentes, e um segredo em outro formato passa. A regra
// continua sendo não guardar segredo no diário.
const SEGREDOS = [
  // chave privada PEM, do BEGIN ao END (ou até o fim, se o END faltar)
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
  // tokens do GitHub
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  // chaves de API no formato sk-…
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  // chave de acesso da AWS
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
];
// `Bearer <token>` (cabeçalho Authorization): fica o Bearer, sai o token.
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/g;
// NOME=valor (ou NOME: valor) com nome de variável de segredo: em maiúsculas, como as de ambiente, com prefixo
// opcional (TOKEN, GITHUB_TOKEN, SECRET, *_KEY, PASSWORD, PASSWD, APIKEY…); e, em minúsculas, os nomes que aparecem
// em configuração (password, passwd, api_key, apikey).
const NOME_DE_SEGREDO = String.raw`(?:[A-Z][A-Z0-9_]*)?(?:TOKEN|SECRET|PASSWORD|PASSWD|_KEY|API_?KEY)[A-Z0-9_]*|password|passwd|api_?key`;
const ATRIBUICAO = new RegExp(String.raw`\b(${NOME_DE_SEGREDO})(\s*(?:=|:\s)\s*)(?:"([^"\n]*)"|'([^'\n]*)'|([^\s"']+))`, 'g');
// usuário:senha@ dentro de uma URL
const CREDENCIAL_EM_URL = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(@)/gi;
const REMOVIDO = '[removido]';

// O texto com os segredos evidentes trocados por [removido], e quantos foram: {texto, n}.
export function mascararSegredos(texto) {
  let n = 0;
  let r = String(texto);
  for (const re of SEGREDOS) r = r.replace(re, () => { n += 1; return REMOVIDO; });
  r = r.replace(BEARER, (tudo, antes) => { n += 1; return `${antes}${REMOVIDO}`; });
  r = r.replace(ATRIBUICAO, (tudo, nome, sinal, aspas2, aspas1, solto) => {
    const valor = aspas2 ?? aspas1 ?? solto ?? '';
    if (!valor || valor === REMOVIDO) return tudo;
    n += 1;
    return `${nome}${sinal}${REMOVIDO}`;
  });
  r = r.replace(CREDENCIAL_EM_URL, (tudo, antes, senha, arroba) => (senha === REMOVIDO ? tudo : (n += 1, `${antes}${REMOVIDO}${arroba}`)));
  return { texto: r, n };
}

// O comentário com o diário de um plano: {corpo, cortado, removidos}. Marcador v=2: `em` (quando foi guardado, ISO, para
// achar o mais novo entre tickets e máquinas) e `fase`.
export function corpoDoDiario({ frente, diario, commit, fase = 'passagem', em = new Date().toISOString() }) {
  // Os segredos saem antes do corte: um segredo no começo não escapa por estar no trecho que fica.
  const { texto: limpo, n: removidos } = mascararSegredos(diario.texto);
  const reconhecido = lerDiario(limpo).reconhecido;
  const limite = reconhecido ? LIMITE_RECONHECIDO : LIMITE_DESCONHECIDO;
  const cortado = limpo.length > limite;
  const texto = cortado ? `${limpo.slice(0, limite).replace(/\n?$/, '\n')}` : limpo;
  const motivo = !cortado ? null : reconhecido
    ? `Diário maior que ${LIMITE_RECONHECIDO} caracteres: cortado em ${LIMITE_RECONHECIDO} caracteres; a cópia inteira ficou na máquina que guardou.`
    : `Formato não reconhecido: o diário vai como texto, cortado em ${LIMITE_DESCONHECIDO} caracteres.`;
  const cerca = cercaPara(texto);
  const corpo = [
    marcador('registro', { id: frente.id, nome: frente.nome, pasta: diario.pasta, plano: diario.plano, commit, cortado: cortado ? '1' : '0', em, fase }, 2),
    `**Diário da execução por subagentes** da frente ${frente.id} ${frente.nome}: plano \`${diario.plano ?? diario.pasta}\`, commit \`${commit}\`.`,
    ...(motivo ? [`> ${motivo}`] : []),
    '',
    `${cerca}text`,
    texto.replace(/\n$/, ''),
    cerca,
    '',
  ].join('\n');
  return { corpo, cortado, removidos };
}

// Os campos do marcador `ah:registro` de um comentário, ou null (o do resumo, `ah:registro-resumo`, não conta).
// O v=1 (antes de 27/11) não tem `em` nem `fase`: conta como o mais antigo (em vazio) e como passagem.
export function lerMarcador(corpo) {
  const m = /<!-- ah:registro ((?:\S+=\S* )*)v=[12] -->/.exec(String(corpo));
  if (!m) return null;
  const campos = {};
  for (const par of m[1].trim().split(' ')) {
    const i = par.indexOf('=');
    try { campos[par.slice(0, i)] = decodeURIComponent(par.slice(i + 1)); } catch { return null; }
  }
  const fase = campos.fase || 'passagem';
  if (!campos.id || !campos.pasta || !FASES.includes(fase)) return null;
  return {
    id: campos.id, nome: campos.nome ?? '', pasta: campos.pasta, plano: campos.plano || null,
    commit: campos.commit ?? '', cortado: campos.cortado === '1', em: campos.em ?? '', fase,
  };
}

// O texto do diário dentro do bloco do comentário (sempre com uma quebra de linha no fim), ou null.
export function diarioDoComentario(corpo) {
  // Comentário editado no navegador pode voltar com \r\n.
  const linhas = String(corpo).replace(/\r\n/g, '\n').split('\n');
  const inicio = linhas.findIndex(l => /^`{4,}text$/.test(l));
  if (inicio < 0) return null;
  const cerca = linhas[inicio].slice(0, -4);
  const fim = linhas.findIndex((l, i) => i > inicio && l === cerca);
  if (fim < 0) return null;
  return `${linhas.slice(inicio + 1, fim).join('\n')}\n`;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// O comentário de fechamento: por plano, as tarefas concluídas (com os commits e o veredito da revisão), as que
// ficaram paradas (com a última linha) e as decisões tomadas sem o humano (`Ruling:`), até cinco por plano.
export function resumoDoFechamento({ frente, copias }) {
  const linhas = [
    marcador('registro-resumo', { id: frente.id, nome: frente.nome }),
    `**Resumo da execução por subagentes** da frente ${frente.id} ${frente.nome}:`,
  ];
  for (const c of copias) {
    const d = lerDiario(c.texto);
    const nome = c.plano ? `\`${c.plano}\`` : c.pasta;
    if (!d.reconhecido) {
      linhas.push(`- Plano ${nome}: diário em formato não reconhecido; o texto está no comentário do diário.`);
      continue;
    }
    const feitas = d.concluidas.length
      ? `${plural(d.concluidas.length, 'tarefa concluída', 'tarefas concluídas')} (${d.concluidas.map(x => `Task ${x.tarefa} ${x.de}..${x.ate}, ${x.revisao}`).join('; ')})`
      : 'nenhuma tarefa concluída';
    const paradas = d.paradas.length ? `, ${plural(d.paradas.length, 'parada', 'paradas')} (${d.paradas.map(x => curta(x.ultima)).join('; ')})` : '';
    linhas.push(`- Plano ${nome}: ${feitas}${paradas}, ${plural(d.decisoes.length, 'decisão', 'decisões')}.`);
    for (const r of d.decisoes.slice(0, 5)) linhas.push(`  - ${curta(r, 200)}`);
    if (d.decisoes.length > 5) linhas.push(`  - … e mais ${d.decisoes.length - 5} no comentário do diário`);
  }
  // As decisões vêm do diário: os segredos saem também do resumo.
  return mascararSegredos(`${linhas.join('\n')}\n`).texto;
}

// Devolve um diário ao lugar em que o subagent-driven-development o procura: progress.md e plan-path na pasta do
// plano, e o .gitignore da pasta `.superpowers/sdd/` (só se faltar: o projeto pode ter posto o dele). A pasta vem
// de fora (marcador de um ticket) e não pode sair de `.superpowers/sdd/`.
export function devolverDiario(worktree, { pasta, plano, texto }) {
  if (!PASTA_VALIDA.test(String(pasta))) throw new Error(`pasta inválida para o diário: ${curta(String(pasta), 60)}`);
  if (plano != null && !planoValido(plano)) throw new Error(`plano inválido para o diário: ${curta(String(plano), 60)}`);
  const dir = path.join(sdd(worktree), pasta);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'progress.md'), texto);
  if (plano) fs.writeFileSync(path.join(dir, 'plan-path'), `${plano}\n`);
  const ignora = path.join(sdd(worktree), '.gitignore');
  if (!fs.existsSync(ignora)) fs.writeFileSync(ignora, '*\n');
}

// As pastas de plano do worktree que têm diário (`progress.md`), relativas ao worktree e terminadas em /. São as que
// o guardar leva para a cópia. Lê só o disco: o close a chama sob a trava.
export function pastasDoSdd(worktree) {
  try {
    return fs.readdirSync(sdd(worktree), { withFileTypes: true })
      .filter(e => e.isDirectory() && tipoDoArquivo(path.join(sdd(worktree), e.name, 'progress.md')) === 'comum')
      .map(e => `.superpowers/sdd/${e.name}/`).sort();
  } catch {
    return [];
  }
}

// Os arquivos de uma pasta, recursivamente, como caminhos absolutos.
export function arquivosDe(dir) {
  let itens;
  try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return itens.flatMap(e => (e.isDirectory() ? arquivosDe(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

const relDoWorktree = (worktree, abs) => path.relative(worktree, abs).split(path.sep).join('/');

// Tira do worktree só o que o guardar copiou (`copiados`, caminhos absolutos) e, se nada mais sobrou, o `.gitignore`
// que o `sdd-workspace` cria e as pastas vazias. Não apaga o que o git versiona (`rastreados`, relativos ao worktree:
// o projeto pode versionar os diários, como o sdd-workspace prevê) nem o que não foi copiado: quem guarda não apaga
// o que não guardou. Devolve as sobras, relativas ao worktree; com sobra, o `ah close` recusa como sempre.
export function limparPastaDoSdd(worktree, rastreados = new Set(), copiados = new Set()) {
  const raiz = sdd(worktree);
  if (!fs.existsSync(raiz)) return [];
  for (const abs of copiados) if (!rastreados.has(relDoWorktree(worktree, abs))) fs.rmSync(abs, { force: true });
  const tirarVazias = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) tirarVazias(path.join(dir, e.name));
    if (dir !== raiz && !fs.readdirSync(dir).length) fs.rmdirSync(dir);
  };
  tirarVazias(raiz);
  // Pasta de onde algo foi copiado: as sobras saem arquivo por arquivo; as outras, como pasta inteira.
  const deOndeCopiou = new Set([...copiados].map(abs => relDoWorktree(raiz, abs).split('/')[0]));
  const naoRastreados = dir => arquivosDe(dir).map(abs => relDoWorktree(worktree, abs)).filter(rel => !rastreados.has(rel));
  const sobras = [];
  for (const e of fs.readdirSync(raiz, { withFileTypes: true })) {
    if (e.name === '.gitignore') continue;
    const abs = path.join(raiz, e.name);
    if (!e.isDirectory()) { if (!rastreados.has(relDoWorktree(worktree, abs))) sobras.push(relDoWorktree(worktree, abs)); continue; }
    const soltos = naoRastreados(abs);
    if (!soltos.length) continue;
    if (deOndeCopiou.has(e.name)) sobras.push(...soltos);
    else sobras.push(`${relDoWorktree(worktree, abs)}/`);
  }
  if (sobras.length) return sobras.sort();
  const ignora = '.superpowers/sdd/.gitignore';
  if (!rastreados.has(ignora)) fs.rmSync(path.join(worktree, ignora), { force: true });
  for (const dir of [raiz, path.join(worktree, '.superpowers')]) {
    try { fs.rmdirSync(dir); } catch { /* tem outra coisa: fica */ }
  }
  return [];
}

// O .gitignore que o sdd-workspace cria (`*`), e não um do projeto.
export const gitignoreDoSdd = worktree => lerOuNada(path.join(sdd(worktree), '.gitignore')) === '*\n';
