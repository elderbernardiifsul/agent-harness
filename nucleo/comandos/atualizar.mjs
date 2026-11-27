// `ah atualizar`: troca a cópia do núcleo (.harness/nucleo/) pela de um clone do agent-harness.
// Não toca na configuração, nas extensões nem no estado; reaplica o trecho do AGENTS.md e a linha @AGENTS.md do CLAUDE.md como o init.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ErroDeUso } from '../lib/caminhos.mjs';
import { ErroDeEstado, comTrava, gravarJson, lerJson, registrarEvento } from '../lib/estado.mjs';
import { git } from '../lib/git.mjs';
import {
  MANIFESTO, ancestralEstrito, arquivosDaCopia, citar, commitDoClone, compararVersoes, diferenca, eClone, lerManifesto, listaDoCommit,
  listaDoManifesto, listaInstalada, montarManifesto,
} from '../lib/copia.mjs';
import { LINHA_DO_CLAUDE, agentsComTrecho, claudeComLinha, claudeEhLinkParaAgents, mesclarGanchos, passosDoCommit } from './init.mjs';
import { VERSAO } from '../versao.mjs';

export const descricao = 'troca a cópia do núcleo (.harness/nucleo) pela de um clone do agent-harness';
export const uso = 'ah atualizar [--de <clone>] [--simular] [--forcar]';
export const requisitos = { config: true, sessao: false };

const RAIZ_DO_HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARQUIVO_AGENTS = 'AGENTS.md';
const ARQUIVO_CLAUDE_MD = 'CLAUDE.md';
const MENSAGEM_DO_COMMIT = 'chore: atualiza o agent-harness';
// A troca leva bem menos que isso; o segundo atualizar espera o primeiro terminar.
const ESPERA_DA_TRAVA_MS = 30000;
const PRAZO_DA_TRAVA_MS = 120000;
const curto = c => (typeof c === 'string' ? c.slice(0, 7) : 'sem commit');
const comoVersao = m => (typeof m?.versao === 'string' && /^\d+\.\d+\.\d+$/.test(m.versao) ? m.versao : null);
const lista = (titulo, itens) => (itens.length ? `${titulo}:\n${itens.map(r => `  ${r}`).join('\n')}\n` : '');

function lerOpcoes(args) {
  const o = { de: null, simular: false, forcar: false, resto: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--simular') { o.simular = true; o.resto.push(a); continue; }
    if (a === '--forcar') { o.forcar = true; o.resto.push(a); continue; }
    if (a === '--de' || a.startsWith('--de=')) {
      const valor = a === '--de' ? args[++i] : a.slice('--de='.length);
      if (!valor || valor.startsWith('--')) throw new ErroDeUso('A opção --de precisa de um valor.\nPróximo passo: escreva --de <caminho do clone do agent-harness>');
      o.de = valor;
      continue;
    }
    throw new ErroDeUso(`Opção desconhecida: ${a.slice(0, 40)}\nPróximo passo: use ${uso}`);
  }
  return o;
}

function realOuNulo(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

// Roda o atualizar do outro clone na mesma pasta e repassa a saída e o código: quem decide o que copiar é o código novo.
function delegar(clone, o, amb) {
  const r = spawnSync(process.execPath, [path.join(clone, 'nucleo', 'bin', 'ah.mjs'), 'atualizar', ...o.resto], {
    cwd: amb.cwd, env: amb.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new ErroDeEstado(`não consegui rodar o atualizar do clone em ${clone} (${r.error.message})`, null, `rode node ${citar(path.join(clone, 'nucleo', 'bin', 'ah.mjs'))} atualizar na pasta do projeto`);
  if (r.stdout) amb.escrever(r.stdout);
  if (r.stderr) amb.avisar(r.stderr);
  return r.status ?? 1;
}

// Sobras de uma troca interrompida ao lado de .harness/nucleo/: as cópias novas nunca valeram e saem;
// a velha sai se o núcleo está no lugar; sem núcleo, recusa com o comando que a devolve.
function tratarSobras(dirHarness, dirNucleo, simular) {
  let nomes = [];
  try { nomes = fs.readdirSync(dirHarness); } catch { return; }
  const velhas = nomes.filter(n => n.startsWith('nucleo.velho-'));
  if (!fs.existsSync(dirNucleo) && velhas.length) {
    throw new ErroDeEstado(`uma atualização parou no meio: .harness/nucleo/ não existe e sobrou .harness/${velhas[0]}`, null, `devolva a cópia antiga com mv .harness/${velhas[0]} .harness/nucleo e rode ah atualizar de novo`);
  }
  if (simular) return;
  for (const n of nomes) {
    if (n.startsWith('nucleo.novo-') || n.startsWith('nucleo.velho-')) fs.rmSync(path.join(dirHarness, n), { recursive: true, force: true });
  }
}

// Arquivos alterados à mão: {itens, semProva}. Vale a lista do manifesto; sem ela (manifesto anterior à
// fatia 5), a lista do commit instalado, montada a partir do clone. Sem as duas não há como provar que o
// núcleo está intacto (uma mudança à mão já commitada não aparece no git status): `semProva`, e os itens
// são o que o git mostra como não commitado.
function alteradosAMao(amb, anterior, instalado, clone) {
  const comparar = antes => {
    const d = diferenca(antes, instalado.lista);
    return [
      ...d.alterados.map(r => `${r} (mudou)`), ...d.removidos.map(r => `${r} (sumiu)`), ...d.novos.map(r => `${r} (a mais)`),
      ...instalado.links.map(r => `${r} (link simbólico)`),
    ];
  };
  const doManifesto = listaDoManifesto(anterior);
  if (doManifesto) return { itens: comparar(doManifesto), semProva: false };
  const doCommit = listaDoCommit(clone, anterior?.commit, amb.env);
  if (doCommit) return { itens: comparar(doCommit), semProva: false };
  const st = git(['status', '--porcelain', '--untracked-files=all', '--', '.harness/nucleo'], { cwd: amb.raiz, env: amb.env });
  const itens = st.codigo !== 0
    ? [`.harness/nucleo (o git status falhou: ${(st.erro.trim().split('\n')[0] || `código ${st.codigo}`).slice(0, 120)})`]
    : st.saida.split('\n').filter(Boolean).map(l => `${l.slice(3).replace(/^\.harness\/nucleo\//, '')} (não commitado)`);
  return { itens: [...itens, ...instalado.links.map(r => `${r} (link simbólico)`)], semProva: true };
}

// Arquivos fora do núcleo que mudam de versão para versão e que o atualizar não troca: os que diferem
// do que o init deste clone gravaria.
function foraDoNucleo(amb) {
  const diferentes = [];
  for (const [rel, modelo] of [['tools/ah', 'ah'], ['tools/ah.cmd', 'ah.cmd']]) {
    let atual = null;
    try { atual = fs.readFileSync(path.join(amb.raiz, ...rel.split('/'))); } catch { /* falta: conta como diferente */ }
    if (!atual || !atual.equals(fs.readFileSync(path.join(RAIZ_DO_HARNESS, 'modelos', modelo)))) diferentes.push(rel);
  }
  if (amb.config.agentes?.includes('claude-code')) {
    const modelo = JSON.parse(fs.readFileSync(path.join(RAIZ_DO_HARNESS, 'modelos', 'claude-code', 'ganchos.json'), 'utf8'));
    try {
      const atual = JSON.parse(fs.readFileSync(path.join(amb.raiz, '.claude', 'settings.json'), 'utf8'));
      if (JSON.stringify(mesclarGanchos(atual, modelo)) !== JSON.stringify(atual)) diferentes.push('.claude/settings.json (ganchos)');
    } catch {
      diferentes.push('.claude/settings.json (ganchos)');
    }
  }
  return diferentes;
}

// O AGENTS.md com o trecho novo: {texto, aviso, link} ou null se nada muda.
function agentsNovo(raiz) {
  const arquivo = path.join(raiz, ARQUIVO_AGENTS);
  let st = null;
  try { st = fs.lstatSync(arquivo); } catch { /* não existe */ }
  if (st?.isSymbolicLink()) return { link: true };
  if (st && !st.isFile()) return null;
  const atual = st ? fs.readFileSync(arquivo, 'utf8') : null;
  const r = agentsComTrecho(atual, fs.readFileSync(path.join(RAIZ_DO_HARNESS, 'modelos', 'agents-trecho.md'), 'utf8'));
  return r.texto === atual ? null : r;
}

// O CLAUDE.md com a linha @AGENTS.md: {texto, link} ou null se nada muda (ou se o Claude Code não está ligado).
function claudeNovo(raiz, config) {
  if (!config?.agentes?.includes('claude-code')) return null;
  const arquivo = path.join(raiz, ARQUIVO_CLAUDE_MD);
  let st = null;
  try { st = fs.lstatSync(arquivo); } catch { /* não existe */ }
  if (st?.isSymbolicLink()) return claudeEhLinkParaAgents(raiz) ? null : { link: true };
  if (st && !st.isFile()) return null;
  const r = claudeComLinha(st ? fs.readFileSync(arquivo, 'utf8') : null);
  return r.muda ? r : null;
}

// Monta a cópia nova ao lado e troca as pastas; se a segunda renomeação falha, a velha volta.
function trocar(dirHarness, dirNucleo, arquivos, manifesto) {
  const sufixo = `${process.pid}-${Date.now()}`;
  const novo = path.join(dirHarness, `nucleo.novo-${sufixo}`);
  const velho = path.join(dirHarness, `nucleo.velho-${sufixo}`);
  try {
    for (const a of arquivos) {
      const destino = path.join(novo, ...a.rel.split('/'));
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(a.origem, destino);
      if (process.platform !== 'win32') fs.chmodSync(destino, fs.statSync(a.origem).mode & 0o777);
    }
    fs.writeFileSync(path.join(novo, MANIFESTO), `${JSON.stringify(manifesto, null, 2)}\n`);
  } catch (e) {
    fs.rmSync(novo, { recursive: true, force: true });
    throw new ErroDeEstado(`não consegui montar a cópia nova em ${novo} (${e.code ?? e.message}); o núcleo ficou como estava`, novo, 'confira o espaço e as permissões de .harness/ e rode ah atualizar de novo');
  }
  try {
    fs.renameSync(dirNucleo, velho);
  } catch (e) {
    fs.rmSync(novo, { recursive: true, force: true });
    throw new ErroDeEstado(`não consegui tirar .harness/nucleo/ do lugar (${e.code ?? e.message}); o núcleo ficou como estava`, dirNucleo, 'feche o que estiver usando a pasta (outro ah, um editor) e rode ah atualizar de novo');
  }
  try {
    fs.renameSync(novo, dirNucleo);
  } catch (e) {
    fs.renameSync(velho, dirNucleo);
    fs.rmSync(novo, { recursive: true, force: true });
    throw new ErroDeEstado(`não consegui pôr a cópia nova no lugar (${e.code ?? e.message}); o núcleo antigo voltou`, dirNucleo, 'confira as permissões de .harness/ e rode ah atualizar de novo');
  }
  try { fs.rmSync(velho, { recursive: true, force: true }); } catch { /* sobra: sai na próxima chamada */ }
}

export async function executar(args, amb) {
  const o = lerOpcoes(args);
  try {
    return await atualizar(o, amb);
  } catch (e) {
    // Com --simular nada é gravado, nem a recusa nos eventos (o despacho lê `semRegistro`).
    if (o.simular && e instanceof ErroDeUso) e.semRegistro = true;
    throw e;
  }
}

async function atualizar(o, amb) {
  const aqui = fs.realpathSync(RAIZ_DO_HARNESS);
  let registro = null;
  try { registro = amb.dirEstado ? lerJson(path.join(amb.dirEstado, 'origem.json'), null) : null; } catch { /* ilegível: como sem registro; é regravado */ }

  // De onde: --de, ou este clone; da cópia instalada sem --de, recusa e diz o clone registrado.
  if (o.de !== null) {
    const clone = realOuNulo(path.resolve(amb.cwd, o.de));
    if (!clone || !eClone(clone)) {
      throw new ErroDeUso(`${o.de.slice(0, 120)} não é um clone do agent-harness (falta nucleo/bin/ah.mjs ou modelos/ah)\nPróximo passo: passe em --de a pasta do clone, a que tem nucleo/ e modelos/`);
    }
    if (clone !== aqui) return delegar(clone, o, amb);
  } else if (!eClone(aqui)) {
    const sugestao = typeof registro?.clone === 'string' ? citar(registro.clone) : '<caminho do clone do agent-harness>';
    throw new ErroDeUso(`não sei de onde atualizar: este é o núcleo instalado no projeto, não o clone\nPróximo passo: rode tools/ah atualizar --de ${sugestao}`);
  }
  const raiz = amb.raiz;
  if (fs.realpathSync(raiz) === aqui) {
    throw new ErroDeUso('Este é o próprio clone do agent-harness, não um projeto com o harness instalado.\nPróximo passo: entre na pasta do projeto e rode o atualizar de lá, usando o caminho do clone');
  }

  const dirHarness = path.join(raiz, '.harness');
  const dirNucleo = path.join(dirHarness, 'nucleo');
  for (const p of [dirHarness, dirNucleo]) {
    let st = null;
    try { st = fs.lstatSync(p); } catch { /* falta: tratado abaixo */ }
    if (st?.isSymbolicLink()) throw new ErroDeUso(`${path.relative(raiz, p)} é um link simbólico; não mexi nele\nPróximo passo: troque o link pela pasta e rode ah atualizar de novo`);
  }
  // Sob a trava 'atualizar' do estado: dois atualizar no mesmo projeto não cruzam as renomeações nem apagam,
  // como sobra, a cópia nova que o outro está montando. A simulação também espera, para não ler a troca pela metade.
  return comTrava(amb.dirEstado, 'atualizar', async () => atualizarNoProjeto(o, amb, { aqui, raiz, dirHarness, dirNucleo }),
    { esperaMs: ESPERA_DA_TRAVA_MS, venceMs: PRAZO_DA_TRAVA_MS });
}

// Confere, mostra e (sem --simular) troca o núcleo; roda com a trava 'atualizar' presa.
function atualizarNoProjeto(o, amb, { aqui, raiz, dirHarness, dirNucleo }) {
  tratarSobras(dirHarness, dirNucleo, o.simular);
  if (!fs.existsSync(dirNucleo)) throw new ErroDeUso('o projeto não tem .harness/nucleo/\nPróximo passo: rode o init a partir do clone (node <clone>/nucleo/bin/ah.mjs init)');

  // Versões: abaixo do mínimo do projeto, nunca; mais velha que a instalada, só com --forcar.
  const anterior = lerManifesto(dirNucleo);
  const versaoAntes = comoVersao(anterior);
  if (compararVersoes(VERSAO, amb.config.harnessMinimo) < 0) {
    throw new ErroDeUso(`o clone tem a versão ${VERSAO} e o projeto pede ${amb.config.harnessMinimo} ou mais nova (harnessMinimo)\nPróximo passo: atualize o clone (git pull nele) e rode ah atualizar de novo`);
  }
  if (versaoAntes && compararVersoes(VERSAO, versaoAntes) < 0 && !o.forcar) {
    throw new ErroDeUso(`o clone tem a versão ${VERSAO}, mais velha que a instalada (${versaoAntes})\nPróximo passo: atualize o clone (git pull nele), ou repita com --forcar para voltar à ${VERSAO}`);
  }

  // Commit mais velho que o instalado (a versão é a mesma em vários commits): só com --forcar.
  const commit = commitDoClone(aqui, amb.env);
  if (commit && !o.forcar && ancestralEstrito(aqui, commit, anterior?.commit, amb.env)) {
    throw new ErroDeUso(`o clone está no commit ${curto(commit)}, anterior ao instalado (${curto(anterior.commit)})\nPróximo passo: atualize o clone (git pull nele), ou repita com --forcar para voltar ao ${curto(commit)}`);
  }

  // O que muda e o que impede.
  const { arquivos } = arquivosDaCopia(aqui);
  const manifesto = montarManifesto({ versao: VERSAO, commit, arquivos });
  const instalado = listaInstalada(dirNucleo);
  const mudancas = diferenca(instalado.lista, manifesto.arquivos);
  const conferencia = alteradosAMao(amb, anterior, instalado, aqui);
  const aMao = conferencia.itens;
  const agents = agentsNovo(raiz);
  const claude = claudeNovo(raiz, amb.config);
  const fora = foraDoNucleo(amb);
  const nucleoMuda = mudancas.novos.length + mudancas.alterados.length + mudancas.removidos.length + instalado.links.length > 0
    || versaoAntes !== VERSAO || (anterior?.commit ?? null) !== commit || !listaDoManifesto(anterior);

  const de = `${versaoAntes ?? 'versão desconhecida'} (${curto(anterior?.commit)})`;
  const para = `${VERSAO} (${curto(commit)})`;
  let relatorio = '';
  if (nucleoMuda) {
    relatorio += `${o.simular ? 'Atualizaria' : 'Atualizei'} .harness/nucleo/ de ${de} para ${para}:\n`;
    for (const [titulo, itens] of [['Novos', mudancas.novos], ['Alterados', mudancas.alterados], ['Removidos', mudancas.removidos]]) {
      if (itens.length) relatorio += `  ${titulo}:\n${itens.map(r => `    ${r}`).join('\n')}\n`;
    }
    if (!mudancas.novos.length && !mudancas.alterados.length && !mudancas.removidos.length) relatorio += '  (só o MANIFEST.json)\n';
  }
  if (agents?.link) {
    amb.avisar(`${ARQUIVO_AGENTS} é um link simbólico; não mexi nele.\nFaça: copie para o arquivo de destino do link o trecho de .harness/nucleo/modelos/agents-trecho.md\n`);
  } else if (agents) {
    relatorio += `${o.simular ? 'Reaplicaria' : 'Reapliquei'} o trecho do harness em ${ARQUIVO_AGENTS}.\n`;
  }
  if (claude?.link) {
    amb.avisar(`${ARQUIVO_CLAUDE_MD} é um link simbólico; não mexi nele.\nFaça: acrescente a linha ${LINHA_DO_CLAUDE} ao arquivo de destino do link\n`);
  } else if (claude) {
    relatorio += `${o.simular ? 'Reaplicaria' : 'Reapliquei'} a linha ${LINHA_DO_CLAUDE} em ${ARQUIVO_CLAUDE_MD}.\n`;
  }

  if (conferencia.semProva && !o.forcar) {
    if (o.simular && relatorio) amb.escrever(relatorio);
    if (aMao.length) amb.avisar(lista('Arquivos do núcleo alterados à mão no projeto', aMao));
    throw new ErroDeUso(`não consigo provar que .harness/nucleo/ está intacto: o MANIFEST.json não tem a lista dos arquivos e o commit instalado (${curto(anterior?.commit)}) não está no clone\nPróximo passo: rode o atualizar de um clone que tenha esse commit (git fetch nele), ou confira as mudanças em .harness/nucleo/ (git log -p -- .harness/nucleo) e repita com --forcar`);
  }
  if (aMao.length && !o.forcar) {
    if (o.simular && relatorio) amb.escrever(relatorio);
    amb.avisar(lista('Arquivos do núcleo alterados à mão no projeto', aMao));
    throw new ErroDeUso(`${aMao.length} arquivo(s) de .harness/nucleo/ alterado(s) à mão; a atualização apagaria a mudança\nPróximo passo: leve a mudança para o clone do agent-harness (ou para .harness/extensoes/) e repita, ou repita com --forcar para descartá-la`);
  }
  if (!relatorio) {
    amb.escrever(`Nada a atualizar: .harness/nucleo/ já é o do clone (${para}).\n`);
    if (fora.length) amb.escrever(foraTexto(fora));
    return 0;
  }
  if (o.simular) {
    amb.escrever(`${relatorio}${aMao.length ? lista('Descartaria (--forcar)', aMao) : ''}${fora.length ? foraTexto(fora) : ''}Simulação: nada foi gravado.\n`);
    return 0;
  }

  // Grava: núcleo (troca atômica), AGENTS.md, clone de origem e evento.
  if (nucleoMuda) trocar(dirHarness, dirNucleo, arquivos, manifesto);
  if (agents && !agents.link) {
    if (agents.aviso) amb.avisar(agents.aviso);
    fs.writeFileSync(path.join(raiz, ARQUIVO_AGENTS), agents.texto);
  }
  if (claude && !claude.link) fs.writeFileSync(path.join(raiz, ARQUIVO_CLAUDE_MD), claude.texto);
  try { gravarJson(path.join(amb.dirEstado, 'origem.json'), { clone: aqui }); } catch { /* o doctor só não confere a origem */ }
  try {
    registrarEvento(amb.dirEstado, {
      tipo: 'atualizacao', sessao: amb.sessaoId, de: versaoAntes, para: VERSAO, deCommit: anterior?.commit ?? null, paraCommit: commit,
      novos: mudancas.novos.length, alterados: mudancas.alterados.length, removidos: mudancas.removidos.length, forcado: o.forcar && (aMao.length > 0 || conferencia.semProva),
    });
  } catch { /* sem como registrar: a atualização vale do mesmo jeito */ }

  amb.escrever(relatorio);
  if (aMao.length) amb.escrever(lista('Descartei (--forcar)', aMao));
  else if (conferencia.semProva) amb.escrever('Sem como conferir o núcleo antigo (--forcar): o que houvesse de mudança à mão foi descartado.\n');
  if (fora.length) amb.escrever(foraTexto(fora));
  amb.escrever(passosDoCommit(raiz, amb.config.git.base, amb.env, {
    caminhos: ['.harness/nucleo', ARQUIVO_AGENTS, ARQUIVO_CLAUDE_MD], mensagem: MENSAGEM_DO_COMMIT,
    falta: `Falta levar a atualização para o ramo base ${amb.config.git.base} (as frentes partem dele)`,
  }));
  // As skills do harness no projeto são cópias da pasta skills/ da extensão metodo: a cópia nova do núcleo não as troca.
  const metodo = amb.config.extensoes?.metodo;
  if (metodo === true || (metodo !== null && typeof metodo === 'object' && !Array.isArray(metodo))) {
    amb.escrever('A extensão metodo está ligada: depois do commit, rode tools/ah metodo atualizar, que traz as skills do harness da cópia nova do núcleo.\n');
  }
  return 0;
}

function foraTexto(fora) {
  return `${lista('Fora do núcleo, diferentes do que o init deste clone grava (não mexi)', fora)}Faça: rode o init a partir do clone (node ${citar(path.join(RAIZ_DO_HARNESS, 'nucleo', 'bin', 'ah.mjs'))} init) para trocá-los; ele mostra o que não sobrescreve\n`;
}
