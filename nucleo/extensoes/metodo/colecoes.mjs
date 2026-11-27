// Lista fixada das coleções de skills de terceiros (colecoes.json) e a tabela agente -> pasta de skills.
// Resolve a dor de "qual versão de cada skill o projeto recebe": o commit fica fixado aqui, não na origem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pasta onde cada agente procura as skills do projeto (sondagem dos três agentes).
const PASTA_DO_AGENTE = {
  'claude-code': '.claude/skills',
  codex: '.agents/skills',
  opencode: '.agents/skills',
};
export const AGENTES = Object.keys(PASTA_DO_AGENTE);
// As pastas possíveis: a trava só pode apontar para elas (o que a trava lista pode ser apagado).
export const PASTAS = [...new Set(Object.values(PASTA_DO_AGENTE))];

// Pastas de destino dos agentes dados, sem repetir (Codex e OpenCode dividem a mesma), na ordem dos agentes.
export function destinosDe(agentes) {
  return [...new Set(agentes.map(a => PASTA_DO_AGENTE[a]).filter(Boolean))];
}

const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const texto = v => typeof v === 'string' && v.trim() !== '';
// Caminho relativo e sem `..`: a skill nunca aponta para fora da origem ou do projeto.
export const caminhoSeguro = v => texto(v) && !v.startsWith('/') && !v.includes('\\') && !v.split('/').some(p => p === '..' || p === '');
export const NOME = /^[a-z][a-z0-9-]*$/;

function mapa(valor, onde, o_que) {
  if (!eObjeto(valor) || !Object.keys(valor).length) throw new Error(`${onde}: precisa ser um objeto não vazio (${o_que})`);
  return valor;
}

function conferirColecao(nome, c) {
  const onde = `colecoes.${nome}`;
  if (!eObjeto(c)) throw new Error(`${onde}: precisa ser um objeto`);
  if (!texto(c.origem)) throw new Error(`${onde}.origem: precisa ser o endereço git da coleção`);
  if (!/^[0-9a-f]{40}$/.test(c.commit ?? '')) throw new Error(`${onde}.commit: precisa ser o commit completo (40 caracteres hexadecimais)`);
  if (!texto(c.versao)) throw new Error(`${onde}.versao: precisa ser o texto da versão`);
  if (!caminhoSeguro(c.licenca)) throw new Error(`${onde}.licenca: precisa ser o caminho da licença na origem`);
  for (const [skill, pasta] of Object.entries(mapa(c.skills, `${onde}.skills`, '{skill: pasta na origem}'))) {
    if (!NOME.test(skill) || !caminhoSeguro(pasta)) throw new Error(`${onde}.skills.${skill}: precisa de um nome simples e de uma pasta relativa na origem (sem ..)`);
  }
  if (c.arquivosDoProjeto !== undefined) {
    if (!eObjeto(c.arquivosDoProjeto)) throw new Error(`${onde}.arquivosDoProjeto: precisa ser {destino no projeto: arquivo na origem}`);
    for (const [destino, arquivo] of Object.entries(c.arquivosDoProjeto)) {
      if (!caminhoSeguro(destino) || !caminhoSeguro(arquivo)) throw new Error(`${onde}.arquivosDoProjeto.${destino}: os dois caminhos precisam ser relativos (sem ..)`);
    }
  }
}

function conferirDoHarness(h) {
  const onde = 'colecoes.agent-harness';
  if (!eObjeto(h)) throw new Error(`${onde}: falta a entrada das skills do próprio harness`);
  if (!caminhoSeguro(h.local)) throw new Error(`${onde}.local: precisa ser a pasta das skills dentro da extensão`);
  for (const [skill, pasta] of Object.entries(mapa(h.skills, `${onde}.skills`, '{skill: pasta}'))) {
    if (!NOME.test(skill) || !caminhoSeguro(pasta)) throw new Error(`${onde}.skills.${skill}: precisa de um nome simples e de uma pasta relativa`);
  }
  // `extensoes`: a skill que só entra com aquela extensão ligada.
  if (!eObjeto(h.extensoes)) throw new Error(`${onde}.extensoes: precisa ser {skill: extensão}, mesmo vazio`);
  for (const [skill, ext] of Object.entries(h.extensoes)) {
    if (!Object.hasOwn(h.skills, skill) || !texto(ext) || !NOME.test(ext)) throw new Error(`${onde}.extensoes.${skill}: a skill precisa estar em skills e a extensão ter nome simples`);
  }
}

// Lê e confere o colecoes.json em `arquivo`. Formato inválido lança Error com o motivo.
export function lerColecoes(arquivo) {
  let bruto;
  try {
    bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (e) {
    throw new Error(`não consegui ler o colecoes.json (${arquivo}): ${e.message}`);
  }
  if (!eObjeto(bruto) || bruto.versaoDoFormato !== 1) throw new Error('colecoes.json: versaoDoFormato precisa ser 1');
  if (!eObjeto(bruto.colecoes)) throw new Error('colecoes.json: colecoes precisa ser um objeto');
  for (const [nome, c] of Object.entries(bruto.colecoes)) {
    if (nome === 'agent-harness') conferirDoHarness(c);
    else conferirColecao(nome, c);
  }
  if (!bruto.colecoes['agent-harness']) conferirDoHarness(undefined);
  return { colecoes: bruto.colecoes };
}

// O colecoes.json em uso: AH_METODO_COLECOES (para os testes e para quem experimenta outra lista) ou o da extensão.
export const arquivoDasColecoes = env => (env.AH_METODO_COLECOES
  ? path.resolve(env.AH_METODO_COLECOES)
  : path.join(path.dirname(fileURLToPath(import.meta.url)), 'colecoes.json'));

// As extensões ligadas na configuração do projeto: `true` ou um objeto (a mesma regra do núcleo).
const eLigada = v => v === true || eObjeto(v);
export const extensoesLigadas = configDoProjeto => new Set(Object.entries(configDoProjeto?.extensoes ?? {}).filter(([, v]) => eLigada(v)).map(([k]) => k));
