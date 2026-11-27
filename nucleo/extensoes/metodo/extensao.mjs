// Extensão `metodo`: instala no projeto o método de trabalho (skills de coleções fixadas e skills do próprio
// harness) nas pastas de cada agente, grava a trava .harness/skills.lock.json e o trecho do método no AGENTS.md.
// Configuração: `{"agentes": ["claude-code", "codex", "opencode"]}`. O trabalho fica em sincronizar.mjs.
import { AGENTES } from './colecoes.mjs';
import { sincronizar } from './sincronizar.mjs';

const USO = 'ah metodo instalar [--forcar] | atualizar [--colecao <nome>] [--para <tag|commit>] [--simular] [--forcar]';

export default {
  versaoDaInterface: 1,
  descricao: 'instala as skills do método de trabalho nas pastas dos agentes do projeto',

  validarConfig(c) {
    for (const k of Object.keys(c)) if (k !== 'agentes') return `campo desconhecido: ${k} (só vale agentes)`;
    const a = c.agentes;
    if (!Array.isArray(a) || !a.length) return `agentes deve ser uma lista não vazia com ${AGENTES.join(', ')}`;
    const ruim = a.find(x => !AGENTES.includes(x));
    if (ruim !== undefined) return `agentes tem um agente desconhecido: ${String(ruim).slice(0, 40)} (use ${AGENTES.join(', ')})`;
    if (new Set(a).size !== a.length) return 'agentes não pode repetir agente';
    return null;
  },

  comandos: {
    metodo: {
      descricao: 'instala e atualiza as skills do método de trabalho',
      uso: USO,
      requisitos: { sessao: false },
      async executar([sub, ...args], ctx) {
        const recusa = m => new ctx.ErroDeUso(`${m}\nPróximo passo: use ${USO}`);
        if (sub === 'instalar') {
          const ruim = args.find(a => a !== '--forcar');
          if (ruim !== undefined) throw recusa(`${ruim.startsWith('--') ? 'Opção desconhecida' : 'Argumento a mais'}: ${ruim.slice(0, 40)}`);
          return sincronizar(ctx, { forcar: args.includes('--forcar') });
        }
        if (sub === 'atualizar') {
          // Opções com valor (--colecao, --para) e sem valor (--simular, --forcar).
          const opcoes = { simular: false, forcar: false };
          for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === '--simular' || a === '--forcar') opcoes[a.slice(2)] = true;
            else if (a === '--colecao' || a === '--para') {
              const valor = args[++i];
              if (valor === undefined || valor.startsWith('--')) throw recusa(`Falta o valor de ${a}`);
              opcoes[a.slice(2)] = valor;
            } else throw recusa(`${a.startsWith('--') ? 'Opção desconhecida' : 'Argumento a mais'}: ${a.slice(0, 40)}`);
          }
          if (opcoes.para && !opcoes.colecao) throw recusa('--para precisa de --colecao (cada coleção tem os seus commits e tags)');
          return sincronizar(ctx, {
            comando: 'atualizar',
            colecoesPedidas: opcoes.colecao ? [opcoes.colecao] : null,
            refs: opcoes.para ? { [opcoes.colecao]: opcoes.para } : {},
            simular: opcoes.simular,
            forcar: opcoes.forcar,
          });
        }
        throw recusa(sub ? `Subcomando desconhecido: ${sub.slice(0, 40)}` : 'Falta o subcomando.');
      },
    },
  },
};
