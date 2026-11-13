// Registro dos adaptadores de agente: o `ah gancho <nome>` e o `doctor` leem daqui.
// Adaptador novo: escreva nucleo/adaptadores/<nome>.mjs e acrescente-o em ADAPTADORES
// (roteiro: docs/agentes/escrever-um-adaptador.md).
import * as claudeCode from './claude-code.mjs';

export const ADAPTADORES = { 'claude-code': claudeCode };

export const EVENTOS_DO_CONTRATO = ['inicio', 'sinal', 'antes', 'fim'];

// O que deixa de valer quando o agente não entrega um dos eventos (degradação declarada).
export const O_QUE_SE_PERDE = {
  inicio: 'sem resumo no começo nem herança da frente na continuação; a sessão só é registrada pelo ah open (rode tools/ah whoami no começo)',
  sinal: 'o sinal de vida só se renova a cada ferramenta (antes); sessão parada mais que o prazo do sinal parece morta',
  antes: 'sem travas automáticas (T0 a T6): nada é recusado antes de rodar',
  fim: 'a sessão não se encerra pelo agente; vale a vida do processo e do sinal',
};

// Variáveis que indicam o agente que roda o comando, na ordem em que se consultam: um agente
// aberto de dentro de outro herda as variáveis do pai, por isso as do Claude Code vêm por último
// (docs/referencia/capacidades-por-agente.md, "Detalhes que decidem código", item 2).
const INDICADORES = [
  ['opencode', ['OPENCODE_SESSION_ID', 'OPENCODE']],
  ['codex', ['CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'CODEX_CI']],
  ['claude-code', ['CLAUDE_CODE_SESSION_ID', 'CLAUDECODE']],
];

// Nome do agente em uso: AH_AGENTE, se definida; senão o primeiro indicador presente; senão null.
export function agenteEmUso(env = {}) {
  const declarado = typeof env.AH_AGENTE === 'string' ? env.AH_AGENTE.trim() : '';
  if (declarado) return declarado;
  for (const [nome, variaveis] of INDICADORES) {
    if (variaveis.some(v => typeof env[v] === 'string' && env[v] !== '')) return nome;
  }
  return null;
}
