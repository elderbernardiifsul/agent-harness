// `ah gancho <agente>`: o ponto em que o agente chama o harness. Lê o JSON do evento
// na entrada padrão, traduz pelo adaptador, chama o contrato e devolve saída, erro e
// código. A entrada é de fora (o agente e o comando que o modelo escreveu): nada aqui
// pode derrubar o processo; o que falhar segue a regra de quebra do contrato.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { raizPrincipal, dirEstado as caminhoDoEstado } from '../lib/caminhos.mjs';
import { fileURLToPath } from 'node:url';
import { carregarConfig } from '../lib/config.mjs';
import { tratar, respostaNaQuebra } from '../adaptadores/contrato.mjs';
import * as claudeCode from '../adaptadores/claude-code.mjs';

export const descricao = 'recebe um evento do agente (uso dos ganchos instalados pelo init)';
export const uso = 'ah gancho claude-code  (o agente chama; o evento chega em JSON pela entrada padrão)';
// Roda sem configuração válida e sem sessão no ambiente: a sessão vem do JSON, e a
// regra de quebra precisa valer justamente quando a configuração está ruim.
export const requisitos = { config: false, sessao: false, repositorio: false };

const ADAPTADORES = { 'claude-code': claudeCode };
const LIMITE_ENTRADA = 16 * 1024 * 1024;

// Lê a entrada padrão inteira, até o limite; o excesso é lido e descartado.
async function lerEntradaPadrao() {
  if (process.stdin.isTTY) return { texto: '', excesso: false };
  const partes = [];
  let total = 0;
  let excesso = false;
  for await (const parte of process.stdin) {
    if (total + parte.length > LIMITE_ENTRADA) { excesso = true; continue; }
    partes.push(parte);
    total += parte.length;
  }
  return { texto: Buffer.concat(partes).toString('utf8'), excesso };
}

// Raiz do projeto do harness a partir de uma pasta, ou null se não é um.
function raizDoHarness(cwd) {
  if (typeof cwd !== 'string' || cwd === '' || !path.isAbsolute(cwd)) return null;
  let raiz;
  try {
    raiz = raizPrincipal(cwd);
  } catch {
    return null;
  }
  return fs.existsSync(path.join(raiz, '.harness')) ? raiz : null;
}

// Raiz do projeto em que este núcleo está instalado (`<raiz>/.harness/nucleo/comandos/`), ou null no clone.
function raizDaInstalacao() {
  const nucleo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const harness = path.dirname(nucleo);
  return path.basename(nucleo) === 'nucleo' && path.basename(harness) === '.harness' ? path.dirname(harness) : null;
}

// O projeto do evento: a pasta do evento, a do processo, CLAUDE_PROJECT_DIR e, por fim, a
// instalação deste núcleo. Um `cd` do agente para fora do projeto não desliga as travas.
function acharRaiz(cwdDoEvento, amb) {
  const candidatos = [cwdDoEvento, amb.cwd, amb.env?.CLAUDE_PROJECT_DIR, raizDaInstalacao()];
  for (const c of candidatos) {
    const raiz = raizDoHarness(c);
    if (raiz) return raiz;
  }
  return null;
}

function escreverSaida(amb, { saida, erro, codigo }) {
  const comFim = t => (t && !t.endsWith('\n') ? `${t}\n` : t);
  if (saida) amb.escrever(comFim(saida));
  if (erro) amb.avisar(comFim(erro));
  return codigo;
}

export async function executar(args, amb) {
  const adaptador = Object.hasOwn(ADAPTADORES, args[0]) ? ADAPTADORES[args[0]] : null;
  // O adaptador do Claude Code também serve para ler entrada ruim quando o nome é desconhecido.
  const leitor = adaptador ?? claudeCode;
  let json = null;
  let evento = null;
  let ctx = { raiz: null, cwd: amb.cwd };
  try {
    const { texto, excesso } = amb.lerEntrada ? await amb.lerEntrada() : await lerEntradaPadrao();
    try {
      json = JSON.parse(texto);
    } catch {
      json = texto;
    }
    if (!adaptador) throw new Error(`adaptador desconhecido: ${String(args[0] ?? '').slice(0, 40) || '(nenhum)'}`);
    if (excesso) throw new Error(`entrada do agente maior que ${LIMITE_ENTRADA / 1024 / 1024} MB`);
    if (typeof json === 'string') throw new Error('a entrada do agente não é JSON');
    evento = adaptador.traduzirEntrada(json);
    if (!evento) throw new Error('a entrada do agente não é um objeto JSON');

    // O evento pode vir de um worktree de frente; sem projeto do harness achado, não é conosco.
    ctx = { raiz: null, cwd: evento.cwd };
    const raiz = acharRaiz(evento.cwd, amb);
    if (!raiz) return 0;
    ctx = { raiz, cwd: evento.cwd };
    const config = carregarConfig(raiz);
    const dirEstado = caminhoDoEstado(config.projeto, amb.env, process.platform, os.homedir());
    const resposta = tratar(evento, { ...amb, raiz, config, dirEstado, cwd: evento.cwd });
    return escreverSaida(amb, adaptador.traduzirSaida(evento, resposta));
  } catch (e) {
    let tipo = 'desconhecido';
    try {
      tipo = evento?.tipo ?? e?.tipo ?? leitor.tipoProvavel(json);
      const provavel = evento ?? { tipo, acao: tipo === 'antes' ? leitor.acaoLeniente(json) : null };
      if (ctx.raiz == null && provavel.acao) {
        // A tradução falhou antes de achar a raiz: as exceções precisam dela (caminho absoluto do ah, configuração).
        const cwd = typeof json?.cwd === 'string' && path.isAbsolute(json.cwd) ? json.cwd : null;
        ctx = { raiz: acharRaiz(cwd, amb), cwd: cwd ?? amb.cwd };
      }
      const resposta = respostaNaQuebra(provavel, e?.message ?? String(e), ctx);
      return escreverSaida(amb, leitor.traduzirSaida(provavel, resposta));
    } catch (e2) {
      // Última linha: nem a regra de quebra rodou. Recusa no antes; nos outros, segue.
      const motivo = String(e2?.message ?? e2).replace(/\s+/g, ' ').slice(0, 200);
      if (tipo === 'antes') return escreverSaida(amb, { saida: '', erro: `Recusado (T0): o harness não conseguiu avaliar (${motivo}).\nFaça: rode tools/ah doctor`, codigo: 2 });
      return escreverSaida(amb, { saida: '', erro: `Aviso: o harness não conseguiu tratar o evento (${motivo}). Rode tools/ah doctor.`, codigo: 0 });
    }
  }
}
