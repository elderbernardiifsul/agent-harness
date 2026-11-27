// Rótulos de triagem das skills do Matt Pocock no GitHub. Resolve a dor de a triagem aplicar um rótulo que não
// existe no repositório: cria os que faltam, com os nomes que o projeto escolheu em docs/agents/triage-labels.md.
// Não recria nem repinta os que já existem.
import fs from 'node:fs';
import path from 'node:path';

export const ARQUIVO_ROTULOS = 'docs/agents/triage-labels.md';

// Os cinco papéis da triagem, com a cor fixa e a descrição de cada um. O nome padrão do rótulo é o do papel.
const PAPEIS = [
  { papel: 'needs-triage', cor: 'D93F0B', descricao: 'precisa de triagem' },
  { papel: 'needs-info', cor: 'FBCA04', descricao: 'esperando mais informação de quem abriu' },
  { papel: 'ready-for-agent', cor: '0E8A16', descricao: 'especificado, pronto para um agente' },
  { papel: 'ready-for-human', cor: '1D76DB', descricao: 'precisa de implementação por uma pessoa' },
  { papel: 'wontfix', cor: 'CCCCCC', descricao: 'não será feito' },
];
export const ROTULOS_PADRAO = PAPEIS.map(p => p.papel);

const semCrase = c => c.trim().replace(/^`(.*)`$/, '$1').trim();

// {papel: nome no rastreador}, lido da tabela do triage-labels.md (1ª coluna o papel, 2ª o nome no rastreador).
// Tabela que não traz os cinco papéis com nome: valem os nomes padrão.
export function nomesDosRotulos(texto) {
  const nomes = {};
  for (const linha of String(texto ?? '').split(/\r?\n/)) {
    const celulas = linha.trim().startsWith('|') ? linha.trim().replace(/^\||\|$/g, '').split('|').map(semCrase) : [];
    if (celulas.length >= 2 && ROTULOS_PADRAO.includes(celulas[0]) && celulas[1] && celulas[1].length <= 50) nomes[celulas[0]] = celulas[1];
  }
  const completa = ROTULOS_PADRAO.every(p => nomes[p]);
  return Object.fromEntries(ROTULOS_PADRAO.map(p => [p, completa ? nomes[p] : p]));
}

// O repositório do projeto no GitHub: github.repo da configuração ou, sem ele (o init não o grava), o que o gh
// acha pelo remoto, como o núcleo faz (repoAtual em nucleo/lib/github.mjs). Sem remoto ou sem gh, null.
export function repoDoProjeto(ctx) {
  const doConfig = ctx.configDoProjeto?.github?.repo;
  if (typeof doConfig === 'string' && doConfig) return doConfig;
  const r = ctx.gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  const nome = String(r.saida ?? '').trim();
  return r.codigo === 0 && /^[^/\s]+\/[^/\s]+$/.test(nome) ? nome : null;
}

// Cria no repositório `repo` os rótulos que faltam; `repo` nulo (projeto sem repositório no GitHub) só avisa.
// Falha do gh vira aviso com o que fazer; nunca lança.
export function criarRotulos(ctx, repo, comando) {
  let texto = null;
  try { texto = fs.readFileSync(path.join(ctx.raiz, ...ARQUIVO_ROTULOS.split('/')), 'utf8'); } catch { /* sem arquivo: nomes padrão */ }
  const nomes = nomesDosRotulos(texto);
  const aMao = `crie à mão os rótulos ${Object.values(nomes).join(', ')}`;
  if (!repo) {
    return ctx.avisar(`Aviso: não criei os rótulos de triagem no GitHub (não achei o repositório do projeto no GitHub).\nFaça: ligue o projeto ao repositório (git remote add origin <endereço>; gh repo view deve mostrá-lo) ou escreva dono/nome em github.repo em .harness/config.json, e rode tools/ah metodo ${comando} de novo; ou ${aMao}\n`);
  }
  const avisar = motivo => ctx.avisar(`Aviso: não criei os rótulos de triagem no GitHub (${motivo}).\nFaça: confira o gh (gh auth status) e github.repo em .harness/config.json e rode tools/ah metodo ${comando} de novo, ou ${aMao}\n`);
  const erroDe = r => String(r.erro || r.saida).split('\n').map(l => l.trim()).find(Boolean)?.slice(0, 200) || `código ${r.codigo}`;

  const lista = ctx.gh(['label', 'list', '--repo', repo, '--json', 'name', '--limit', '200']);
  if (lista.codigo !== 0) return avisar(erroDe(lista));
  let existentes;
  try {
    existentes = new Set(JSON.parse(lista.saida).map(l => l.name));
  } catch {
    return avisar('a lista de rótulos do gh não é JSON');
  }
  for (const { papel, cor, descricao } of PAPEIS) {
    if (existentes.has(nomes[papel])) continue;
    const r = ctx.gh(['label', 'create', nomes[papel], '--repo', repo, '--color', cor, '--description', descricao]);
    if (r.codigo !== 0) return avisar(erroDe(r));
  }
}
