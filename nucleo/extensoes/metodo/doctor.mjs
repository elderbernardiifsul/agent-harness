// Conferências do `doctor` da extensão `metodo`. Todas são aviso, salvo a trava ilegível (falha): o harness
// sugere e registra, quem decide é o autor do projeto.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PASTAS, lerColecoes } from './colecoes.mjs';
import { pluginsDuplicados } from './plugins.mjs';
import { ARQUIVO_TRAVA, conferir, hashesDe, lerTrava } from './trava.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DO_HARNESS = 'agent-harness';
const eLigada = v => v === true || (v !== null && typeof v === 'object' && !Array.isArray(v));
const curto = h => String(h).slice(0, 7);

const avisoSemTrava = { estado: 'aviso', detalhe: `falta a trava ${ARQUIVO_TRAVA}`, conserto: 'rode tools/ah metodo instalar' };

function colecoesRecomendadas(env) {
  const arquivo = env.AH_METODO_COLECOES ? path.resolve(env.AH_METODO_COLECOES) : path.join(DIR, 'colecoes.json');
  return lerColecoes(arquivo).colecoes;
}

// Resultado de lerTrava, ou o resultado final da conferência quando não há trava para conferir.
function travaOuResultado(ctx) {
  const { trava, erro } = lerTrava(ctx.raiz);
  if (erro) return { resultado: { estado: 'falha', detalhe: `a trava ${ARQUIVO_TRAVA} está ilegível: ${erro}`, conserto: `recupere-a do git (git checkout -- ${ARQUIVO_TRAVA}) ou apague-a, e rode tools/ah metodo instalar` } };
  if (!trava) return { resultado: avisoSemTrava };
  return { trava };
}

const trilha = (lista, rotulo, partes) => {
  if (!lista.length) return;
  const porDestino = new Map();
  for (const { destino, arquivo } of lista) porDestino.set(destino, [...(porDestino.get(destino) ?? []), arquivo]);
  for (const [destino, arquivos] of porDestino) partes.push(`${rotulo} em ${destino}: ${arquivos.join(', ')}`);
};

export const verificacoes = [
  {
    item: 'Trava das skills',
    conferir(ctx) {
      const { resultado } = travaOuResultado(ctx);
      return resultado ?? { estado: 'ok' };
    },
  },
  {
    item: 'Skills iguais à trava',
    conferir(ctx) {
      const { trava } = travaOuResultado(ctx);
      if (!trava) return { estado: 'ok', detalhe: 'sem trava legível para conferir (veja o item Trava das skills)' };
      const partes = [];
      const { alterados, ausentes } = conferir(ctx.raiz, trava);
      trilha(alterados, 'alterados', partes);
      trilha(ausentes, 'ausentes', partes);
      // Skill do harness presa a uma extensão: instalada com a extensão desligada, ou faltando com ela ligada.
      let doHarness = null;
      try { doHarness = colecoesRecomendadas(ctx.env)[DO_HARNESS]; } catch { /* lista ilegível: a instalação já recusa e diz */ }
      if (doHarness) {
        const ligadas = new Set(Object.entries(ctx.configDoProjeto?.extensoes ?? {}).filter(([, v]) => eLigada(v)).map(([k]) => k));
        const instaladas = new Set(trava.colecoes[DO_HARNESS]?.skills ?? []);
        for (const [skill, ext] of Object.entries(doHarness.extensoes)) {
          if (instaladas.has(skill) && !ligadas.has(ext)) partes.push(`a skill ${skill} está instalada, mas a extensão ${ext} desligada`);
          if (!instaladas.has(skill) && ligadas.has(ext)) partes.push(`falta a skill ${skill}, que acompanha a extensão ${ext} ligada`);
        }
      }
      if (!partes.length) return { estado: 'ok' };
      return {
        estado: 'aviso',
        detalhe: partes.join('; '),
        conserto: 'se as mudanças foram de propósito, guarde-as numa skill de outro nome; senão, rode tools/ah metodo instalar (--forcar descarta as mudanças)',
      };
    },
  },
  {
    item: 'Coleções na versão recomendada',
    conferir(ctx) {
      const { trava } = travaOuResultado(ctx);
      if (!trava) return { estado: 'ok', detalhe: 'sem trava legível para conferir (veja o item Trava das skills)' };
      const recomendadas = colecoesRecomendadas(ctx.env);
      const partes = [];
      for (const [nome, c] of Object.entries(trava.colecoes)) {
        // As skills do harness não têm commit: acompanham o clone do núcleo.
        if (c.commit === null || !recomendadas[nome]?.commit) continue;
        if (c.commit !== recomendadas[nome].commit) partes.push(`${nome}: instalado ${curto(c.commit)}, recomendado ${curto(recomendadas[nome].commit)}`);
      }
      if (!partes.length) return { estado: 'ok' };
      return { estado: 'aviso', detalhe: partes.join('; '), conserto: 'rode tools/ah metodo atualizar (--simular mostra antes o que muda)' };
    },
  },
  {
    item: 'Coleções sem plugin duplicado',
    conferir(ctx) {
      const achados = pluginsDuplicados({ env: ctx.env, agentes: ctx.config.agentes });
      if (!achados.length) return { estado: 'ok' };
      return {
        estado: 'aviso',
        detalhe: `a coleção também é plugin do agente: ${achados.join(', ')}`,
        conserto: 'desinstale o plugin do agente (ou tire a coleção do método): com os dois, o agente carrega a mesma skill duas vezes',
      };
    },
  },
  {
    item: 'Skills sem nome repetido',
    conferir(ctx) {
      // Só o OpenCode lê mais de uma pasta e pode escolher a cópia que a pessoa não espera; cópia idêntica é inofensiva.
      if (!ctx.config.agentes.includes('opencode')) return { estado: 'ok' };
      const pastas = [...PASTAS, '.opencode/skills'];
      const porNome = new Map();
      for (const pasta of pastas) {
        const abs = path.join(ctx.raiz, ...pasta.split('/'));
        let nomes = [];
        try { nomes = fs.readdirSync(abs, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { /* pasta ausente */ }
        for (const nome of nomes) porNome.set(nome, [...(porNome.get(nome) ?? []), { pasta, hashes: JSON.stringify(Object.entries(hashesDe(path.join(abs, nome)))) }]);
      }
      const repetidas = [...porNome].filter(([, v]) => v.length > 1 && new Set(v.map(x => x.hashes)).size > 1).sort(([a], [b]) => (a < b ? -1 : 1));
      if (!repetidas.length) return { estado: 'ok' };
      return {
        estado: 'aviso',
        detalhe: `o OpenCode lê mais de uma pasta e a mesma skill tem conteúdo diferente: ${repetidas.map(([n, v]) => `${n} (${v.map(x => x.pasta).join(', ')})`).join('; ')}`,
        conserto: 'deixe cópias iguais: renomeie a skill própria ou rode tools/ah metodo instalar --forcar para igualar à trava',
      };
    },
  },
];
