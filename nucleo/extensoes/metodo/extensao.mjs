// Extensão `metodo`: instala no projeto o método de trabalho (skills de coleções fixadas e skills do próprio
// harness) nas pastas de cada agente, grava a trava .harness/skills.lock.json e o trecho do método no AGENTS.md.
// Configuração: `{"agentes": ["claude-code", "codex", "opencode"]}`. O trabalho fica em sincronizar.mjs.
import { AGENTES } from './colecoes.mjs';
import { sincronizar } from './sincronizar.mjs';

const USO = 'ah metodo instalar [--forcar] | atualizar';

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
          throw new ctx.ErroDeUso('ah metodo atualizar ainda não implementado.\nPróximo passo: nada foi alterado; para reinstalar as skills na versão recomendada, rode tools/ah metodo instalar');
        }
        throw recusa(sub ? `Subcomando desconhecido: ${sub.slice(0, 40)}` : 'Falta o subcomando.');
      },
    },
  },
};
