// Interface de extensão (versão 1). Uma extensão é a pasta `<nome>/` com `extensao.mjs`, cujo `export default`
// declara o que ela acrescenta: comandos, travas, verificações do doctor, reações ao ciclo, linhas no resumo e
// colunas no quadro. Ficam em nucleo/extensoes/ (as que acompanham o harness) e em .harness/extensoes/ (as do
// projeto, que sombreiam as do harness com o mesmo nome) e só carregam se ligadas em `extensoes` na configuração.
// A carga é tolerante: a extensão que falha fica de fora com o motivo, e o núcleo segue. Referência:
// docs/extensoes/interface.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ErroDeUso } from './caminhos.mjs';
import { comTrava } from './estado.mjs';
import { gravarFrente, lerFrente, listarFrentesTolerante } from './frente.mjs';
import { git } from './git.mjs';
import { gh } from './github.mjs';
import { vidaDaDona } from './vida.mjs';

export const VERSAO_DA_INTERFACE = 1;
export const DIR_DO_NUCLEO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'extensoes');
const DIR_COMANDOS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'comandos');
export const NOME_VALIDO = /^[a-z][a-z0-9-]*$/;
export const REACOES = ['depoisDeAbrir', 'antesDeFechar', 'depoisDeFechar', 'aoPassar', 'noSweep'];
const CAMPOS = new Set(['versaoDaInterface', 'descricao', 'comandos', 'travas', 'verificacoes', 'reacoes', 'resumo', 'colunas', 'validarConfig']);
export const CONSERTO_PADRAO = 'corrija a extensão ou desligue-a em .harness/config.json';

const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const eFuncao = v => typeof v === 'function';
const eTexto = v => typeof v === 'string' && v.trim() !== '';
const umaLinha = (t, limite = 300) => {
  const s = String(t ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return s.length > limite ? `${s.slice(0, limite - 1)}…` : s;
};
export const mensagemDe = e => umaLinha(e?.message ?? e, 200);

const comandosDoNucleo = () => {
  try {
    return new Set(fs.readdirSync(DIR_COMANDOS).filter(f => f.endsWith('.mjs')).map(f => f.slice(0, -4)));
  } catch {
    return new Set();
  }
};

// Pastas `<nome>/extensao.mjs` de um diretório; nome fora do padrão é ignorado.
function pastasDe(dir) {
  let nomes;
  try {
    nomes = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && NOME_VALIDO.test(e.name)).map(e => e.name);
  } catch {
    return [];
  }
  return nomes.map(nome => ({ nome, arquivo: path.join(dir, nome, 'extensao.mjs') }));
}

// Todas as extensões achadas (ligadas ou não), em ordem de nome: [{nome, origem: 'projeto'|'harness', arquivo, sombra}].
export function descobrir(raiz, { dirNucleo = DIR_DO_NUCLEO } = {}) {
  const achadas = new Map();
  for (const e of pastasDe(dirNucleo)) achadas.set(e.nome, { ...e, origem: 'harness', sombra: false });
  if (raiz) {
    for (const e of pastasDe(path.join(raiz, '.harness', 'extensoes'))) {
      achadas.set(e.nome, { ...e, origem: 'projeto', sombra: achadas.has(e.nome) });
    }
  }
  return [...achadas.values()].sort((a, b) => (a.nome < b.nome ? -1 : 1));
}

// Confere a forma do `export default`. Devolve o motivo da recusa, ou null.
export function errosDaForma(def) {
  if (!eObjeto(def)) return 'o arquivo não tem export default com um objeto';
  if (def.versaoDaInterface !== VERSAO_DA_INTERFACE) {
    return `versão ${umaLinha(def.versaoDaInterface ?? 'ausente', 20)} da interface; o núcleo espera a ${VERSAO_DA_INTERFACE}`;
  }
  for (const k of Object.keys(def)) if (!CAMPOS.has(k)) return `campo desconhecido: ${umaLinha(k, 40)}`;
  if (!eTexto(def.descricao)) return 'descricao deve ser um texto';
  if (def.comandos !== undefined) {
    if (!eObjeto(def.comandos)) return 'comandos deve ser um objeto {nome: {descricao, uso, requisitos, executar}}';
    for (const [nome, c] of Object.entries(def.comandos)) {
      if (!NOME_VALIDO.test(nome)) return `comandos.${umaLinha(nome, 40)}: nome inválido (minúsculas, números e hífen, começando por letra)`;
      if (!eObjeto(c) || !eFuncao(c.executar)) return `comandos.${nome} deve ter executar(args, ctx)`;
      if (!eTexto(c.descricao)) return `comandos.${nome} deve ter descricao`;
      if (c.uso !== undefined && typeof c.uso !== 'string') return `comandos.${nome}.uso deve ser texto`;
      if (c.requisitos !== undefined && !eObjeto(c.requisitos)) return `comandos.${nome}.requisitos deve ser um objeto`;
    }
  }
  if (def.travas !== undefined) {
    if (!Array.isArray(def.travas)) return 'travas deve ser uma lista [{id, avaliar}]';
    const ids = new Set();
    for (const [i, t] of def.travas.entries()) {
      if (!eObjeto(t) || typeof t.id !== 'string' || !NOME_VALIDO.test(t.id)) return `travas[${i}].id deve ter só minúsculas, números e hífen, começando por letra`;
      if (ids.has(t.id)) return `travas[${i}].id repetido: ${t.id}`;
      ids.add(t.id);
      if (!eFuncao(t.avaliar)) return `travas[${i}] deve ter avaliar(acao, ctx)`;
    }
  }
  if (def.verificacoes !== undefined) {
    if (!Array.isArray(def.verificacoes)) return 'verificacoes deve ser uma lista [{item, conferir}]';
    for (const [i, v] of def.verificacoes.entries()) {
      if (!eObjeto(v) || !eTexto(v.item) || !eFuncao(v.conferir)) return `verificacoes[${i}] deve ter item (texto) e conferir(ctx)`;
    }
  }
  if (def.reacoes !== undefined) {
    if (!eObjeto(def.reacoes)) return `reacoes deve ser um objeto {${REACOES.join(', ')}}`;
    for (const [k, fn] of Object.entries(def.reacoes)) {
      if (!REACOES.includes(k)) return `reação desconhecida: ${umaLinha(k, 40)} (valem ${REACOES.join(', ')})`;
      if (!eFuncao(fn)) return `reacoes.${k} deve ser uma função`;
    }
  }
  if (def.resumo !== undefined && !eFuncao(def.resumo)) return 'resumo deve ser uma função';
  if (def.colunas !== undefined) {
    if (!Array.isArray(def.colunas)) return 'colunas deve ser uma lista [{titulo, valor}]';
    for (const [i, c] of def.colunas.entries()) {
      if (!eObjeto(c) || !eTexto(c.titulo) || !eFuncao(c.valor)) return `colunas[${i}] deve ter titulo (texto) e valor(frente, ctx)`;
    }
  }
  if (def.validarConfig !== undefined && !eFuncao(def.validarConfig)) return 'validarConfig deve ser uma função';
  return null;
}

async function carregarUma(achada, nome, config, comandosUsados) {
  const base = { nome, origem: achada?.origem ?? null, arquivo: achada?.arquivo ?? null, sombra: achada?.sombra ?? false, config };
  const falhou = (motivo, conserto = CONSERTO_PADRAO) => ({ ...base, carregou: false, motivo, conserto });
  if (!achada || !fs.existsSync(achada.arquivo)) {
    return falhou(`não achei .harness/extensoes/${nome}/extensao.mjs nem a extensão ${nome} no harness`,
      `crie .harness/extensoes/${nome}/extensao.mjs ou tire ${nome} de extensoes em .harness/config.json`);
  }
  let modulo;
  try {
    // O `?v=` com a data do arquivo deixa recarregar a extensão alterada no mesmo processo (testes).
    const v = fs.statSync(achada.arquivo).mtimeMs;
    modulo = await import(`${pathToFileURL(achada.arquivo).href}?v=${v}`);
  } catch (e) {
    return falhou(`o arquivo ${achada.arquivo} não carregou: ${mensagemDe(e)}`);
  }
  const def = modulo.default;
  const erro = errosDaForma(def);
  if (erro) {
    const conserto = eObjeto(def) && def.versaoDaInterface !== VERSAO_DA_INTERFACE
      ? `atualize a extensão para a versão ${VERSAO_DA_INTERFACE} da interface (docs/extensoes/interface.md) ou desligue-a em .harness/config.json`
      : `${CONSERTO_PADRAO} (a forma está em docs/extensoes/interface.md)`;
    return falhou(erro, conserto);
  }
  if (def.validarConfig) {
    let r;
    try {
      r = def.validarConfig(config);
    } catch (e) {
      return falhou(`validarConfig falhou: ${mensagemDe(e)}`);
    }
    if (r !== null && r !== undefined && r !== true) {
      return falhou(`configuração recusada: ${umaLinha(r, 200)}`, `corrija extensoes.${nome} em .harness/config.json`);
    }
  }
  for (const c of Object.keys(def.comandos ?? {})) {
    const dono = comandosUsados.get(c);
    if (dono) {
      return falhou(dono === '(núcleo)' ? `o comando ${c} já é do núcleo` : `o comando ${c} já é da extensão ${dono}`,
        `renomeie o comando ${c} da extensão ${nome}, ou desligue-a em .harness/config.json`);
    }
  }
  for (const c of Object.keys(def.comandos ?? {})) comandosUsados.set(c, nome);
  return { ...base, carregou: true, def };
}

const cache = new Map();
const avisadas = new Set();

// Esquece o cache (testes, ou quem mudou a configuração no mesmo processo).
export function esquecerExtensoes() {
  cache.clear();
  avisadas.clear();
}

// As extensões ligadas em `amb.config.extensoes`: {ligadas: [...], ativas: [as que carregaram]}. Cada item tem
// {nome, origem, arquivo, sombra, config, carregou, motivo?, conserto?, def?}. Nunca lança.
// `avisar`: avisa, uma vez por processo, de cada extensão que não carregou. `semCache`: sempre recarrega.
export async function carregarExtensoes(amb, { dirNucleo = DIR_DO_NUCLEO, avisar = null, semCache = false } = {}) {
  const ligadas = Object.entries(amb?.config?.extensoes ?? {}).filter(([, v]) => v === true || eObjeto(v));
  if (!ligadas.length || !amb?.raiz) return { ligadas: [], ativas: [] };
  const chave = `${amb.raiz}\0${dirNucleo}\0${JSON.stringify(amb.config.extensoes)}`;
  let r = semCache ? null : cache.get(chave);
  if (!r) {
    const achadas = new Map(descobrir(amb.raiz, { dirNucleo }).map(e => [e.nome, e]));
    const usados = new Map([...comandosDoNucleo()].map(c => [c, '(núcleo)']));
    const lista = [];
    for (const [nome, valor] of ligadas.sort(([a], [b]) => (a < b ? -1 : 1))) {
      // A configuração da extensão é uma cópia: a extensão não muda a do projeto.
      lista.push(await carregarUma(achadas.get(nome), nome, valor === true ? {} : structuredClone(valor), usados));
    }
    r = { ligadas: lista, ativas: lista.filter(e => e.carregou) };
    if (!semCache) cache.set(chave, r);
  }
  if (avisar) {
    for (const e of r.ligadas) {
      if (e.carregou || avisadas.has(`${chave}\0${e.nome}`)) continue;
      avisadas.add(`${chave}\0${e.nome}`);
      avisar(`Aviso: a extensão ${e.nome} não carregou (${e.motivo}); rode ah doctor.\n`);
    }
  }
  return r;
}

// Carga que nunca derruba quem chama: qualquer erro inesperado vira "sem extensões".
export async function ativasOuNada(amb, opcoes) {
  try {
    return (await carregarExtensoes(amb, opcoes)).ativas;
  } catch {
    return [];
  }
}

function congelar(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) congelar(v);
  }
  return obj;
}
const copiaSoDeLeitura = f => (f ? congelar(structuredClone(f)) : null);

// O contexto que toda chamada da extensão recebe. `amb` é o do comando (raiz, config, dirEstado, sessaoId,
// escrever, avisar, env, cwd). `extra`: `frente` (cópia só de leitura), `dentroDaTrava` (quem chama já tem a
// trava `frentes`: gravarCampos grava sem pegá-la de novo) e campos próprios da chamada (reparar, retomada…).
export function montarCtx(ext, amb, extra = {}) {
  const { frente = null, dentroDaTrava = false, ...resto } = extra;
  const nome = ext.nome;
  const dirEstado = amb.dirEstado ?? null;
  const env = amb.env ?? process.env;
  const raiz = amb.raiz ?? null;
  return {
    extensao: nome,
    config: congelar(structuredClone(ext.config ?? {})),
    configDoProjeto: amb.config ? congelar(structuredClone(amb.config)) : null,
    raiz,
    dirEstado,
    sessaoId: amb.sessaoId ?? null,
    cwd: amb.cwd ?? raiz,
    env,
    escrever: amb.escrever ?? (() => {}),
    avisar: amb.avisar ?? (() => {}),
    frente: copiaSoDeLeitura(frente),
    frentes: () => (dirEstado ? listarFrentesTolerante(dirEstado).frentes.map(copiaSoDeLeitura) : []),
    // A sessão dona da frente (`frente.dona`) está viva? Mesma regra do takeover e do board (vida.mjs): registro
    // ilegível conta como viva (pode estar), e frente sem dona, como não. Para a extensão não mexer em frente
    // ativa de outra sessão de pé.
    donaViva(frente) {
      if (!dirEstado || !frente?.dona) return false;
      const estado = vidaDaDona(dirEstado, frente.dona, { config: amb.config })?.estado;
      return estado === 'viva' || estado === 'ilegivel';
    },
    // Grava em frente.extensoes[<nome>] os campos dados (undefined apaga o campo) e devolve a seção como ficou.
    // `campos` também pode ser uma função (seçãoAtual, {frentes}) -> campos, chamada sob a trava das frentes: o
    // que ela confere não muda até a gravação; se ela lança, nada é gravado.
    async gravarCampos(nomeDaFrente, campos) {
      if (!eObjeto(campos) && !eFuncao(campos)) throw new TypeError('gravarCampos: campos deve ser um objeto {campo: valor} ou uma função');
      const fazer = () => {
        const f = lerFrente(dirEstado, nomeDaFrente);
        if (!f) throw new ErroDeUso(`Não achei a frente ${umaLinha(nomeDaFrente, 49)} no estado.\nPróximo passo: rode ah board para ver as frentes abertas`);
        const atual = eObjeto(f.extensoes?.[nome]) ? f.extensoes[nome] : {};
        const dados = eFuncao(campos)
          ? campos(structuredClone(atual), { frentes: listarFrentesTolerante(dirEstado).frentes.map(copiaSoDeLeitura) })
          : campos;
        if (!eObjeto(dados)) throw new TypeError('gravarCampos: a função deve devolver um objeto {campo: valor}');
        const novos = JSON.parse(JSON.stringify(dados));
        const secao = { ...atual, ...novos };
        for (const k of Object.keys(dados)) if (dados[k] === undefined) delete secao[k];
        f.extensoes = { ...(eObjeto(f.extensoes) ? f.extensoes : {}), [nome]: secao };
        gravarFrente(dirEstado, f);
        return structuredClone(secao);
      };
      if (!dirEstado) throw new Error('gravarCampos: sem pasta de estado');
      return dentroDaTrava ? fazer() : comTrava(dirEstado, 'frentes', async () => fazer());
    },
    git: (args, opcoes = {}) => git(args, { cwd: raiz ?? undefined, env, ...opcoes }),
    gh: (args, opcoes = {}) => gh(args, { cwd: raiz ?? undefined, env, ...opcoes }),
    ErroDeUso,
    ...resto,
  };
}

// A frente em foco da sessão (ou null), sem lançar.
export function frenteDaSessao(dirEstado, sessaoId, lerSessao) {
  if (!dirEstado || !sessaoId) return null;
  try {
    const s = lerSessao(dirEstado, sessaoId);
    const nome = s?.frente?.nome ?? s?.frente;
    return typeof nome === 'string' ? lerFrente(dirEstado, nome) : null;
  } catch {
    return null;
  }
}

// Roda a reação `nome` (não antesDeFechar) de cada extensão ativa; erro vira aviso e não desfaz nada.
// Devolve [{extensao, valor}] com o que cada uma devolveu.
export async function reagir(nome, amb, extra = {}) {
  const ativas = await ativasOuNada(amb, { avisar: amb.avisar });
  const resultados = [];
  for (const ext of ativas) {
    const fn = ext.def.reacoes?.[nome];
    if (!fn) continue;
    try {
      resultados.push({ extensao: ext.nome, valor: await fn(montarCtx(ext, amb, extra)) });
    } catch (e) {
      amb.avisar?.(`Aviso: extensão ${ext.nome} falhou em ${nome}: ${mensagemDe(e)}\n`);
    }
  }
  return resultados;
}

// antesDeFechar de cada extensão ativa: a primeira recusa ({extensao, motivo, saida}), ou null. A reação que
// lança também recusa: fechar sem a conferência dela poderia perder o que ela guarda.
export async function recusaAntesDeFechar(amb, extra = {}) {
  const ativas = await ativasOuNada(amb, { avisar: amb.avisar });
  for (const ext of ativas) {
    const fn = ext.def.reacoes?.antesDeFechar;
    if (!fn) continue;
    let r;
    try {
      r = await fn(montarCtx(ext, amb, extra));
    } catch (e) {
      return { extensao: ext.nome, falhou: true, motivo: mensagemDe(e), saida: CONSERTO_PADRAO };
    }
    if (eObjeto(r) && r.recusa) {
      return {
        extensao: ext.nome, motivo: umaLinha(r.recusa, 300),
        saida: eTexto(r.saida) ? umaLinha(r.saida, 300) : `veja o motivo acima na extensão ${ext.nome}, ou desligue-a em .harness/config.json`,
      };
    }
  }
  return null;
}

// As travas das extensões ativas, prontas para a avaliação: [{id: '<extensão>/<id>', extensao, avaliar(acao)}].
export function travasDasExtensoes(ativas, amb, extra = {}) {
  const lista = [];
  for (const ext of ativas) {
    if (!ext.def.travas?.length) continue;
    let ctx = null;
    const ctxDe = () => (ctx ??= montarCtx(ext, amb, extra));
    for (const t of ext.def.travas) lista.push({ id: `${ext.nome}/${t.id}`, extensao: ext.nome, avaliar: acao => t.avaliar(acao, ctxDe()) });
  }
  return lista;
}

export const LIMITE_LINHA_DO_RESUMO = 200;

// Até duas linhas de cada extensão ativa com `resumo`, já cortadas. Erro: a extensão fica de fora do resumo e
// entra em `falhas` (o resumo avisa numa linha só).
export async function linhasDoResumo(ativas, amb, extra = {}) {
  const linhas = [];
  const falhas = [];
  for (const ext of ativas) {
    if (!ext.def.resumo) continue;
    try {
      const r = await ext.def.resumo(montarCtx(ext, amb, extra));
      const lista = (Array.isArray(r) ? r : r == null ? [] : [r]).filter(l => l != null && String(l).trim() !== '').slice(0, 2);
      linhas.push(...lista.map(l => umaLinha(l, LIMITE_LINHA_DO_RESUMO)));
    } catch {
      falhas.push(ext.nome);
    }
  }
  return { linhas, falhas };
}

export const LIMITE_DA_COLUNA = 30;

// As colunas das extensões ativas: [{extensao, titulo, valor(frente) -> texto cortado}]. Erro vira '!'.
export function colunasDasExtensoes(ativas, amb) {
  const lista = [];
  for (const ext of ativas) {
    if (!ext.def.colunas?.length) continue;
    let ctx = null;
    for (const c of ext.def.colunas) {
      lista.push({
        extensao: ext.nome,
        titulo: umaLinha(c.titulo, LIMITE_DA_COLUNA),
        async valor(frente) {
          ctx ??= montarCtx(ext, amb);
          try {
            const v = await c.valor(copiaSoDeLeitura(frente), ctx);
            return v == null || v === '' ? '—' : umaLinha(v, LIMITE_DA_COLUNA);
          } catch {
            return '!';
          }
        },
      });
    }
  }
  return lista;
}

// Itens do doctor: o item "Extensões" (uma linha por extensão ligada) e as verificações das que carregaram.
// Formato do doctor: {item, estado, fazer?}.
export async function itensDoDoctor(amb, opcoes = {}) {
  const { ligadas, ativas } = await carregarExtensoes(amb, opcoes);
  if (!ligadas.length) return [{ item: 'Extensões (nenhuma ligada)', estado: 'ok' }];
  const itens = [];
  for (const e of ligadas) {
    if (!e.carregou) itens.push({ item: `Extensão ${e.nome}`, estado: 'falha', fazer: `${e.motivo}; ${e.conserto}` });
    else if (e.sombra) {
      itens.push({ item: `Extensão ${e.nome} (projeto)`, estado: 'aviso', fazer: `a extensão ${e.nome} de .harness/extensoes/ sombreia a que acompanha o harness; renomeie a do projeto se a do harness era a desejada` });
    } else itens.push({ item: `Extensão ${e.nome} (${e.origem})`, estado: 'ok' });
  }
  for (const ext of ativas) {
    for (const v of ext.def.verificacoes ?? []) {
      const item = `${umaLinha(v.item, 80)} (${ext.nome})`;
      let r;
      try {
        r = await v.conferir(montarCtx(ext, amb));
      } catch (e) {
        itens.push({ item, estado: 'falha', fazer: `${mensagemDe(e)}; ${CONSERTO_PADRAO}` });
        continue;
      }
      if (!eObjeto(r) || !['ok', 'aviso', 'falha'].includes(r.estado)) {
        itens.push({ item, estado: 'falha', fazer: `a verificação devolveu um formato inválido (espera {estado: 'ok'|'aviso'|'falha', detalhe, conserto}); ${CONSERTO_PADRAO}` });
        continue;
      }
      const detalhe = eTexto(r.detalhe) ? umaLinha(r.detalhe) : null;
      if (r.estado === 'ok') itens.push({ item: detalhe ? `${item}: ${detalhe}` : item, estado: 'ok' });
      else itens.push({ item, estado: r.estado, fazer: [detalhe, eTexto(r.conserto) ? umaLinha(r.conserto) : `confira a extensão ${ext.nome}`].filter(Boolean).join('; ') });
    }
  }
  return itens;
}

// Os comandos das extensões ativas: Map nome -> {extensao, def do comando}.
export function comandosDasExtensoes(ativas) {
  const m = new Map();
  for (const ext of ativas) for (const [nome, c] of Object.entries(ext.def.comandos ?? {})) m.set(nome, { extensao: ext, comando: c });
  return m;
}
