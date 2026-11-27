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

const arquivoDasColecoes = env => (env.AH_METODO_COLECOES ? path.resolve(env.AH_METODO_COLECOES) : path.join(DIR, 'colecoes.json'));
const colecoesRecomendadas = env => lerColecoes(arquivoDasColecoes(env)).colecoes;

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

// Pastas de skill da trava que não se leem (arquivo sem permissão, por exemplo): ['<destino>/<skill>: <código>'].
function pastasIlegiveis(raiz, trava) {
  const ruins = [];
  for (const destino of trava.destinos) {
    for (const c of Object.values(trava.colecoes)) {
      for (const skill of c.skills) {
        try { hashesDe(path.join(raiz, ...destino.split('/'), skill)); } catch (e) { ruins.push(`${destino}/${skill} (${e.code ?? 'erro'})`); }
      }
    }
  }
  return ruins;
}

const CONSERTO_ILEGIVEL = 'devolva a permissão de leitura (ou apague o arquivo ou link quebrado) e rode ah doctor de novo; se a skill não for sua, rode tools/ah metodo instalar --forcar';

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
      let alterados;
      let ausentes;
      try {
        ({ alterados, ausentes } = conferir(ctx.raiz, trava));
      } catch (e) {
        const ruins = pastasIlegiveis(ctx.raiz, trava);
        return { estado: 'aviso', detalhe: `não consegui ler a pasta da skill: ${ruins.length ? ruins.join(', ') : String(e.message).slice(0, 100)}`, conserto: CONSERTO_ILEGIVEL };
      }
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
        // Só há o que guardar quando algum arquivo mudou à mão.
        conserto: alterados.length
          ? 'se as mudanças foram de propósito, guarde-as numa skill de outro nome; senão, rode tools/ah metodo instalar (--forcar descarta as mudanças)'
          : 'rode tools/ah metodo instalar',
      };
    },
  },
  {
    // Depois de um `ah atualizar`, a cópia do núcleo pode trazer outra versão das skills do harness; o disco e a
    // trava continuam iguais entre si, então só a comparação da trava com a pasta skills/ do núcleo mostra o atraso.
    item: 'Skills do harness em dia',
    conferir(ctx) {
      const { trava } = travaOuResultado(ctx);
      const instalada = trava?.colecoes[DO_HARNESS];
      if (!instalada) return { estado: 'ok' };
      let doHarness;
      try { doHarness = colecoesRecomendadas(ctx.env)[DO_HARNESS]; } catch { return { estado: 'ok', detalhe: 'sem colecoes.json legível para conferir (veja o item Coleções na versão recomendada)' }; }
      if (!doHarness) return { estado: 'ok' };
      const dirFonte = path.resolve(path.dirname(arquivoDasColecoes(ctx.env)), doHarness.local);
      const velhas = [];
      const saiu = [];
      for (const skill of instalada.skills) {
        if (!Object.hasOwn(doHarness.skills, skill)) { saiu.push(skill); continue; }
        let fonte = {};
        try { fonte = hashesDe(path.join(dirFonte, ...doHarness.skills[skill].split('/'))); } catch { /* ilegível: conta como diferente */ }
        const daTrava = Object.entries(instalada.arquivos).filter(([k]) => k.startsWith(`${skill}/`));
        if (daTrava.length !== Object.keys(fonte).length || daTrava.some(([k, h]) => fonte[k.slice(skill.length + 1)] !== h)) velhas.push(skill);
      }
      const partes = [];
      if (velhas.length) partes.push(`a cópia do núcleo traz outra versão de ${velhas.join(', ')}`);
      for (const skill of saiu) partes.push(`a skill ${skill} não faz mais parte do harness`);
      if (!partes.length) return { estado: 'ok' };
      // Skill velha que também tem arquivo mudado à mão: o atualizar recusaria, e o conserto diz isso antes.
      let aMao = false;
      try { aMao = conferir(ctx.raiz, trava).alterados.some(({ arquivo }) => velhas.includes(arquivo.split('/')[0])); } catch { /* ilegível: o item Skills iguais à trava diz */ }
      const conserto = 'rode tools/ah metodo atualizar (as skills do harness vêm de .harness/nucleo/extensoes/metodo/skills/)';
      return {
        estado: 'aviso',
        detalhe: partes.join('; '),
        conserto: aMao ? `se você mudou essa skill à mão, o atualizar recusa; guarde a mudança numa skill de outro nome antes (ou use --forcar para descartá-la); depois, ${conserto}` : conserto,
      };
    },
  },
  {
    item: 'Coleções na versão recomendada',
    conferir(ctx) {
      const { trava } = travaOuResultado(ctx);
      if (!trava) return { estado: 'ok', detalhe: 'sem trava legível para conferir (veja o item Trava das skills)' };
      let recomendadas;
      try {
        recomendadas = colecoesRecomendadas(ctx.env);
      } catch (e) {
        return { estado: 'aviso', detalhe: `não consegui ler o colecoes.json: ${String(e.message).split('\n')[0].slice(0, 160)}`, conserto: 'corrija o colecoes.json (ou AH_METODO_COLECOES) e rode ah doctor' };
      }
      const partes = [];
      for (const [nome, c] of Object.entries(trava.colecoes)) {
        // As skills do harness não têm commit: acompanham o clone do núcleo.
        if (c.commit === null) continue;
        if (!recomendadas[nome]) { partes.push(`a coleção ${nome} não está mais entre as recomendadas`); continue; }
        if (c.commit !== recomendadas[nome].commit) partes.push(`${nome}: instalado ${curto(c.commit)}, recomendado ${curto(recomendadas[nome].commit)}`);
      }
      if (!partes.length) return { estado: 'ok' };
      return { estado: 'aviso', detalhe: partes.join('; '), conserto: 'rode tools/ah metodo atualizar (--simular mostra antes o que muda)' };
    },
  },
  {
    item: 'Coleções sem plugin duplicado',
    conferir(ctx) {
      const { achados, ilegivel } = pluginsDuplicados({ env: ctx.env, agentes: ctx.config.agentes, detalhado: true });
      if (ilegivel) return { estado: 'ok', detalhe: `não consegui ler ${ilegivel}; a conferência de plugin duplicado foi pulada` };
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
      const ilegiveis = [];
      for (const pasta of pastas) {
        const abs = path.join(ctx.raiz, ...pasta.split('/'));
        let nomes = [];
        try { nomes = fs.readdirSync(abs, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { /* pasta ausente */ }
        for (const nome of nomes) {
          let hashes;
          try { hashes = JSON.stringify(Object.entries(hashesDe(path.join(abs, nome)))); } catch (e) { ilegiveis.push(`${pasta}/${nome} (${e.code ?? 'erro'})`); continue; }
          porNome.set(nome, [...(porNome.get(nome) ?? []), { pasta, hashes }]);
        }
      }
      if (ilegiveis.length) return { estado: 'aviso', detalhe: `não consegui ler a pasta da skill: ${ilegiveis.join(', ')}`, conserto: CONSERTO_ILEGIVEL };
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
