// O trabalho comum de `metodo instalar` e `metodo atualizar`: buscar as coleções, montar a cópia nova em memória,
// conferir que nada mudado à mão se perde, escrever as skills, a trava, o trecho do AGENTS.md e os arquivos do
// projeto, criar os rótulos de triagem e dizer o commit. Resolve a dor de instalar pela metade: todas as origens
// são buscadas e conferidas antes da primeira escrita, e qualquer recusa até ali deixa o projeto como estava.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { passosDoCommit } from '../../comandos/init.mjs';
import { VERSAO } from '../../versao.mjs';
import { destinosDe, lerColecoes } from './colecoes.mjs';
import { buscar, dirDoCache } from './origem.mjs';
import { ARQUIVO_ROTULOS, criarRotulos } from './rotulos.mjs';
import { ARQUIVO_TRAVA, executaveisDe, hashesDe, lerTrava, linksDe, listarArquivos, sha256, textoDaTrava, gravarTrava } from './trava.mjs';
import { comTrecho } from './trecho.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DO_HARNESS = 'agent-harness';
const ARQUIVO_AGENTS = 'AGENTS.md';
const MENSAGEM_DO_COMMIT = 'chore: instala o método do agent-harness';

const eLigada = v => v === true || (v !== null && typeof v === 'object' && !Array.isArray(v));
const umaLinha = t => String(t ?? '').split('\n').map(l => l.trim()).find(Boolean)?.slice(0, 200) ?? '';
const absoluto = (raiz, rel) => path.join(raiz, ...rel.split('/'));
const mesmosHashes = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, h]) => b[k] === h);
const mesmaLista = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const comoLink = (destino, skill, rel) => `${destino}: ${rel ? `${skill}/${rel}` : skill} (link simbólico)`;

// Caminho `rel` ainda dentro do projeto depois de resolver os links simbólicos do que já existe nele?
function dentroDoProjeto(raiz, rel) {
  const real = fs.realpathSync(raiz);
  let atual = absoluto(raiz, rel);
  for (;;) {
    try {
      const r = fs.realpathSync(atual);
      return r === real || r.startsWith(real + path.sep);
    } catch { /* ainda não existe: sobe */ }
    const pai = path.dirname(atual);
    if (pai === atual) return false;
    atual = pai;
  }
}

// 1. Buscar todas as origens: {nome: {dir, commit, versao, origem}}. A do harness é uma pasta, sem busca.
function buscarFontes(ctx, colecoes, nomes, refs, arquivoColecoes, recusa, comando) {
  const fontes = {};
  const gitDoCtx = (args, opcoes) => ctx.git(args, opcoes);
  for (const nome of nomes) {
    const c = colecoes[nome];
    if (nome === DO_HARNESS) {
      fontes[nome] = { dir: path.resolve(path.dirname(arquivoColecoes), c.local), commit: null, versao: VERSAO, origem: DO_HARNESS };
      continue;
    }
    try {
      const { dir, commit } = buscar({ nome, origem: c.origem, ref: refs[nome] ?? c.commit, dirCache: dirDoCache(ctx.env), git: gitDoCtx, env: ctx.env });
      fontes[nome] = { dir, commit, versao: refs[nome] ?? c.versao, origem: c.origem };
    } catch (e) {
      throw recusa(`não consegui buscar a coleção ${nome} (${c.origem}): ${umaLinha(e.message)}`,
        `confira a conexão com a internet e o endereço da origem e rode tools/ah metodo ${comando} de novo; nada foi gravado`);
    }
  }
  return fontes;
}

// 2. A cópia nova de uma coleção, em memória: {skills: {skill: [{caminho, conteudo, modo}]}, doProjeto: {destino: conteudo}}.
// A skill do harness ligada a uma extensão desligada fica de fora.
function montarCopia(nome, c, fonte, extensoesLigadas, recusa) {
  const doHarness = nome === DO_HARNESS;
  const conserto = doHarness
    ? 'a cópia do harness está incompleta: rode tools/ah atualizar a partir do clone do agent-harness e tente de novo'
    : 'confira o commit da coleção em colecoes.json (ele precisa ter esse caminho) e tente de novo';
  const lerDaFonte = (rel, o_que) => {
    try { return fs.readFileSync(absoluto(fonte.dir, rel)); } catch { throw recusa(`a coleção ${nome} não tem ${o_que} (${rel})`, conserto); }
  };
  const licenca = c.licenca ? lerDaFonte(c.licenca, 'a licença') : null;
  const skills = {};
  for (const [skill, pasta] of Object.entries(c.skills)) {
    if (doHarness && c.extensoes[skill] && !extensoesLigadas.has(c.extensoes[skill])) continue;
    const dir = absoluto(fonte.dir, pasta);
    if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw recusa(`a coleção ${nome} não tem a pasta da skill ${skill} (${pasta})`, conserto);
    // O bit de execução vai junto: um script de skill sem ele quebra no primeiro uso.
    const arquivos = listarArquivos(dir).map(f => ({ caminho: f.caminho, conteudo: fs.readFileSync(f.absoluto), modo: fs.statSync(f.absoluto).mode & 0o111 ? 0o755 : 0o644 }));
    if (licenca && !arquivos.some(f => f.caminho === 'LICENSE')) arquivos.push({ caminho: 'LICENSE', conteudo: licenca, modo: 0o644 });
    skills[skill] = arquivos.sort((a, b) => (a.caminho < b.caminho ? -1 : 1));
  }
  const doProjeto = {};
  for (const [destino, rel] of Object.entries(c.arquivosDoProjeto ?? {})) doProjeto[destino] = lerDaFonte(rel, 'um arquivo do projeto');
  return { skills, doProjeto };
}

// 3. O que muda no disco, sem gravar nada: escritas e remoções de pastas de skill, e o que se perderia (`perdas`).
// Um arquivo do disco pode ser trocado quando é igual à trava anterior ou ao novo; senão, é mudança à mão. Link
// simbólico na pasta (ou a pasta que é link) é sempre mudança à mão. Script com o bit de execução diferente da
// origem é recopiado (não é perda: o conteúdo é o mesmo).
function planejar(raiz, { copias, destinos, anterior, tocadas, forcar }) {
  const daTrava = new Map(); // skill -> {arquivos da trava anterior}, só nos destinos que a trava conhece
  for (const c of Object.values(anterior?.colecoes ?? {})) for (const s of c.skills) daTrava.set(s, c.arquivos);
  const hashAntigo = (destino, skill, rel) => (anterior?.destinos.includes(destino) ? daTrava.get(skill)?.[`${skill}/${rel}`] : undefined);

  const escritas = [];
  const perdas = [];
  const novas = new Set();
  for (const [nome, copia] of Object.entries(copias)) {
    for (const [skill, arquivos] of Object.entries(copia.skills)) {
      const desejado = Object.fromEntries(arquivos.map(f => [f.caminho, sha256(f.conteudo)]));
      const executaveis = arquivos.filter(f => f.modo === 0o755).map(f => f.caminho);
      for (const destino of destinos) {
        novas.add(`${destino}/${skill}`);
        const dir = absoluto(raiz, `${destino}/${skill}`);
        const noDisco = hashesDe(dir);
        const links = linksDe(dir);
        const bitsIguais = process.platform === 'win32' || mesmaLista(executaveisDe(dir), executaveis);
        if (!links.length && bitsIguais && mesmosHashes(noDisco, desejado)) continue;
        escritas.push({ colecao: nome, destino, skill, arquivos, noDisco, bitsNoDisco: executaveisDe(dir) });
        for (const [rel, h] of Object.entries(noDisco)) {
          if (h !== desejado[rel] && h !== hashAntigo(destino, skill, rel)) perdas.push(`${destino}: ${skill}/${rel}`);
        }
        perdas.push(...links.map(rel => comoLink(destino, skill, rel)));
      }
    }
  }

  // Skills que saíram (da lista, da coleção, por extensão desligada ou por agente a menos): saem do disco se iguais à trava; com mudança à mão,
  // ficam (e o aluno é avisado), salvo com --forcar.
  const remocoes = [];
  const mantidas = [];
  for (const [nome, c] of Object.entries(anterior?.colecoes ?? {})) {
    if (!tocadas.has(nome)) continue;
    for (const skill of c.skills) {
      for (const destino of anterior.destinos) {
        if (novas.has(`${destino}/${skill}`)) continue;
        const dir = absoluto(raiz, `${destino}/${skill}`);
        const noDisco = hashesDe(dir);
        const links = linksDe(dir);
        if (!Object.keys(noDisco).length && !links.length) continue;
        const mudada = links.length > 0 || Object.entries(noDisco).some(([rel, h]) => h !== hashAntigo(destino, skill, rel));
        (mudada && !forcar ? mantidas : remocoes).push({ destino, skill });
      }
    }
  }
  return { escritas, perdas, remocoes, mantidas };
}

function escreverSkill(raiz, { destino, skill, arquivos }) {
  const dir = absoluto(raiz, `${destino}/${skill}`);
  // A pasta sai inteira antes da cópia: arquivo que a versão nova não tem não pode sobrar.
  fs.rmSync(dir, { recursive: true, force: true });
  for (const f of arquivos) {
    const alvo = absoluto(dir, f.caminho);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, f.conteudo, { mode: f.modo });
    if (process.platform !== 'win32') fs.chmodSync(alvo, f.modo);
  }
}

// A trava nova: as coleções não tocadas como estavam, as tocadas com o que acabou de ser montado.
function novaTrava({ anterior, tocadas, copias, fontes, destinos }) {
  const trava = { versaoDoFormato: 1, destinos, colecoes: {} };
  for (const [nome, c] of Object.entries(anterior?.colecoes ?? {})) if (!tocadas.has(nome)) trava.colecoes[nome] = c;
  for (const [nome, copia] of Object.entries(copias)) {
    const arquivos = {};
    for (const [skill, lista] of Object.entries(copia.skills)) for (const f of lista) arquivos[`${skill}/${f.caminho}`] = sha256(f.conteudo);
    const { origem, commit, versao } = fontes[nome];
    trava.colecoes[nome] = { origem, commit, versao, skills: Object.keys(copia.skills), arquivos };
  }
  return trava;
}

// O que muda em cada coleção, para o relatório do `atualizar`: {nome: {alterados, novos, removidos, novasSkills}}.
// Os arquivos vêm como `skill/arquivo`, sem repetir por pasta de agente; skill nova só aparece em `novasSkills`.
function diferencas(plano) {
  const por = {};
  for (const e of plano.escritas) {
    const d = (por[e.colecao] ??= { alterados: new Set(), novos: new Set(), removidos: new Set(), novasSkills: new Set() });
    if (!Object.keys(e.noDisco).length) { d.novasSkills.add(e.skill); continue; }
    const desejado = Object.fromEntries(e.arquivos.map(f => [f.caminho, sha256(f.conteudo)]));
    for (const [rel, h] of Object.entries(desejado)) {
      if (!(rel in e.noDisco)) d.novos.add(`${e.skill}/${rel}`);
      else if (e.noDisco[rel] !== h) d.alterados.add(`${e.skill}/${rel}`);
      else if (e.arquivos.find(f => f.caminho === rel).modo === 0o755 !== e.bitsNoDisco.includes(rel)) d.alterados.add(`${e.skill}/${rel} (modo)`);
    }
    for (const rel of Object.keys(e.noDisco)) if (!(rel in desejado)) d.removidos.add(`${e.skill}/${rel}`);
  }
  return por;
}

// Instala ou atualiza as coleções (`colecoesPedidas`: só essas; null: todas) nos commits de `refs` ({nome: ref}) ou nos
// de colecoes.json. `simular`: só relata. `forcar`: descarta as mudanças à mão. Devolve o código de saída.
export async function sincronizar(ctx, { colecoesPedidas = null, refs = {}, simular = false, forcar = false, comando = 'instalar' } = {}) {
  const recusa = (motivo, passo) => new ctx.ErroDeUso(`${motivo}\nPróximo passo: ${passo}`);
  const raiz = ctx.raiz;
  const arquivoColecoes = ctx.env.AH_METODO_COLECOES ? path.resolve(ctx.env.AH_METODO_COLECOES) : path.join(DIR, 'colecoes.json');
  let colecoes;
  try {
    ({ colecoes } = lerColecoes(arquivoColecoes));
  } catch (e) {
    throw recusa(`a lista de coleções do método está inválida: ${umaLinha(e.message)}`, 'a cópia do harness está incompleta ou foi mudada: rode tools/ah atualizar a partir do clone do agent-harness e tente de novo');
  }
  const { trava: anterior, erro } = lerTrava(raiz);
  if (erro) throw recusa(`a trava ${ARQUIVO_TRAVA} está ilegível: ${erro}`, `recupere-a do git (git checkout -- ${ARQUIVO_TRAVA}), ou apague-a, e rode tools/ah metodo ${comando} de novo`);
  const destinos = destinosDe(ctx.config.agentes);
  const pedidas = colecoesPedidas ?? Object.keys(colecoes);
  for (const nome of pedidas) if (!colecoes[nome]) throw recusa(`não conheço a coleção ${String(nome).slice(0, 40)}`, `use uma destas: ${Object.keys(colecoes).join(', ')}`);
  // As coleções não pedidas ficam como na trava; isso só vale se as pastas de destino são as mesmas.
  if (colecoesPedidas && anterior && [...destinos].sort().join() !== [...anterior.destinos].sort().join()) {
    throw recusa('os agentes do método mudaram desde a última instalação', 'rode tools/ah metodo instalar, que leva todas as coleções às pastas novas');
  }
  const tocadas = new Set(colecoesPedidas ?? [...pedidas, ...Object.keys(anterior?.colecoes ?? {})]);

  // 1 e 2: buscar tudo e montar a cópia em memória.
  const fontes = buscarFontes(ctx, colecoes, [...pedidas].sort(), refs, arquivoColecoes, recusa, comando);
  const ligadas = new Set(Object.entries(ctx.configDoProjeto?.extensoes ?? {}).filter(([, v]) => eLigada(v)).map(([k]) => k));
  const copias = {};
  const donas = new Map();
  for (const nome of Object.keys(fontes)) {
    copias[nome] = montarCopia(nome, colecoes[nome], fontes[nome], ligadas, recusa);
    for (const skill of Object.keys(copias[nome].skills)) {
      if (donas.has(skill)) throw recusa(`a skill ${skill} está em duas coleções (${donas.get(skill)} e ${nome})`, 'tire a skill de uma das coleções em colecoes.json');
      donas.set(skill, nome);
    }
  }

  // 3. Conferir contra o disco.
  const usados = [...new Set([...destinos, ...(anterior?.destinos ?? [])])];
  const doProjeto = Object.assign({}, ...Object.values(copias).map(c => c.doProjeto));
  const fora = [...usados, ...Object.keys(doProjeto), ARQUIVO_AGENTS].find(rel => !dentroDoProjeto(raiz, rel));
  if (fora) throw recusa(`o destino sai do projeto: ${fora}`, `remova o link simbólico no caminho e rode tools/ah metodo ${comando} de novo`);
  const plano = planejar(raiz, { copias, destinos, anterior, tocadas, forcar });
  if (plano.perdas.length && !forcar) {
    const lista = plano.perdas.slice(0, 10).join('; ') + (plano.perdas.length > 10 ? `; e mais ${plano.perdas.length - 10}` : '');
    throw recusa(`a instalação sobrescreveria arquivos de skill mudados à mão (${lista})`,
      `guarde as suas mudanças fora da pasta da skill (ou numa skill de outro nome) e rode tools/ah metodo ${comando} de novo; para descartá-las, rode tools/ah metodo ${comando} --forcar`);
  }

  const trava = novaTrava({ anterior, tocadas, copias, fontes, destinos });
  const textoTrava = textoDaTrava(trava);
  const mudaTrava = textoTrava !== (fs.existsSync(absoluto(raiz, ARQUIVO_TRAVA)) ? fs.readFileSync(absoluto(raiz, ARQUIVO_TRAVA), 'utf8') : null);

  // AGENTS.md: link simbólico não é seguido nem trocado.
  const agentsSt = fs.lstatSync(absoluto(raiz, ARQUIVO_AGENTS), { throwIfNoEntry: false });
  const agentsAtual = agentsSt?.isFile() ? fs.readFileSync(absoluto(raiz, ARQUIVO_AGENTS), 'utf8') : null;
  const agents = agentsSt?.isSymbolicLink() ? null : comTrecho(agentsAtual, fs.readFileSync(path.join(DIR, 'modelos', 'agents-metodo.md'), 'utf8'));
  const mudaAgents = agents !== null && agents.texto !== agentsAtual;
  // Os arquivos do projeto (rastreador, rótulos, domínio) são do aluno depois de copiados: só entram quando faltam.
  const copiar = Object.keys(doProjeto).filter(rel => !fs.lstatSync(absoluto(raiz, rel), { throwIfNoEntry: false }));

  // Relatório (o mesmo na simulação).
  const linhas = [];
  const dif = diferencas(plano);
  for (const nome of Object.keys(copias).sort()) {
    // Contam só as skills escritas agora; as que já estavam iguais ficam de fora.
    const escritas = new Set(plano.escritas.filter(e => e.colecao === nome).map(e => e.skill)).size;
    if (!escritas) continue;
    const f = fontes[nome];
    linhas.push(`${comando === 'atualizar' ? 'Atualizei' : 'Instalei'} ${escritas} skill(s) de ${nome} (${f.versao}${f.commit ? `, ${f.commit.slice(0, 7)}` : ''}) em ${destinos.join(', ')}.`);
    if (comando !== 'atualizar') continue;
    for (const [titulo, conjunto] of [['Alterados', 'alterados'], ['Novos arquivos', 'novos'], ['Arquivos removidos', 'removidos']]) {
      const lista = [...dif[nome][conjunto]].sort();
      if (lista.length) linhas.push(`${titulo}:\n  ${nome}: ${lista.join(', ')}`);
    }
    if (dif[nome].novasSkills.size) linhas.push(`Novas skills: ${[...dif[nome].novasSkills].sort().join(', ')}`);
  }
  if (comando === 'atualizar' && plano.remocoes.length) linhas.push(`Skills removidas: ${[...new Set(plano.remocoes.map(r => r.skill))].sort().join(', ')}`);
  if (comando !== 'atualizar') for (const r of plano.remocoes) linhas.push(`Removi a skill ${r.skill} de ${r.destino}.`);
  for (const rel of copiar) linhas.push(`Criei ${rel}.`);
  if (mudaAgents) linhas.push(`Escrevi o trecho do método no ${ARQUIVO_AGENTS}.`);
  if (mudaTrava) linhas.push(`Gravei a trava ${ARQUIVO_TRAVA}.`);
  const avisos = plano.mantidas.map(m => `Aviso: mantive a skill ${m.skill} em ${m.destino}: ela não faz mais parte do método aqui, mas tem mudanças à mão.\nFaça: apague a pasta ${m.destino}/${m.skill} se não precisar mais dela, ou rode tools/ah metodo ${comando} --forcar\n`);
  if (agentsSt?.isSymbolicLink()) avisos.push(`Aviso: ${ARQUIVO_AGENTS} é um link simbólico; não mexi nele.\nFaça: copie para o arquivo de destino do link o trecho de .harness/nucleo/extensoes/metodo/modelos/agents-metodo.md\n`);
  if (agents?.aviso) avisos.push(`Aviso: ${agents.aviso}`);
  const relatorio = linhas.length ? `${linhas.join('\n')}\n` : 'Nada a mudar: as skills já estão como a trava.\n';

  if (simular) {
    ctx.escrever(`${relatorio}Simulação: nada foi gravado.\n`);
    for (const a of avisos) ctx.avisar(a);
    return 0;
  }

  // 5 e 6: escrever.
  for (const e of plano.escritas) escreverSkill(raiz, e);
  for (const r of plano.remocoes) fs.rmSync(absoluto(raiz, `${r.destino}/${r.skill}`), { recursive: true, force: true });
  if (mudaTrava) gravarTrava(raiz, trava);
  if (mudaAgents) fs.writeFileSync(absoluto(raiz, ARQUIVO_AGENTS), agents.texto);
  for (const rel of copiar) {
    fs.mkdirSync(path.dirname(absoluto(raiz, rel)), { recursive: true });
    fs.writeFileSync(absoluto(raiz, rel), doProjeto[rel]);
  }
  ctx.escrever(relatorio);
  for (const a of avisos) ctx.avisar(a);

  // 7. Rótulos, quando o projeto tem repositório no GitHub e o rastreador do método.
  const repo = ctx.configDoProjeto?.github?.repo;
  if (typeof repo === 'string' && repo && Object.hasOwn(doProjeto, ARQUIVO_ROTULOS)) criarRotulos(ctx, repo, comando);

  // 8. O commit.
  const base = ctx.configDoProjeto?.git?.base ?? 'dev';
  ctx.escrever(passosDoCommit(raiz, base, ctx.env, {
    caminhos: [ARQUIVO_TRAVA, ...usados, ARQUIVO_AGENTS, ...Object.keys(doProjeto)],
    mensagem: MENSAGEM_DO_COMMIT,
    falta: `Falta levar o método para o ramo base ${base} (as frentes partem dele)`,
  }));
  return 0;
}
