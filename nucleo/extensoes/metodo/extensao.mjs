// Extensão `metodo`: instala no projeto o método de trabalho (skills de coleções fixadas e skills do próprio
// harness) nas pastas de cada agente. Nesta etapa: a lista de coleções, o cache e a busca da origem; os comandos
// instalar e atualizar ainda recusam. Configuração: `{"agentes": ["claude-code", "codex", "opencode"]}`.
import { AGENTES } from './colecoes.mjs';

const USO = 'ah metodo instalar | atualizar';

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
      executar([sub], ctx) {
        const recusa = m => new ctx.ErroDeUso(`${m}\nPróximo passo: esta versão do harness ainda não instala as skills e nada foi alterado; o uso previsto é ${USO}`);
        if (sub === 'instalar' || sub === 'atualizar') throw recusa(`ah metodo ${sub} ainda não implementado.`);
        throw recusa(sub ? `Subcomando desconhecido: ${sub.slice(0, 40)}` : 'Falta o subcomando.');
      },
    },
  },
};
