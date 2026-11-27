// Plugins que repetem uma coleção do método. Resolve a dor de "o agente carrega a mesma skill duas vezes": a
// coleção instalada no projeto e a mesma coleção como plugin do agente. Só o Claude Code é lido: onde o Codex e o
// OpenCode guardam os plugins instalados a sondagem não estabeleceu, e a conferência não chuta.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Prefixo da chave em installed_plugins.json ('<plugin>@<mercado>') -> coleção do método.
const COLECOES_DO_CLAUDE = ['superpowers', 'mattpocock-skills'];

// `env` dá HOME e CLAUDE_CONFIG_DIR (o teste aponta para uma pasta descartável); `casa` troca a pasta pessoal.
// Arquivo ausente ou ilegível não acusa nada: sem leitura, não há o que afirmar.
export function pluginsDuplicados({ env = process.env, casa, agentes, detalhado = false }) {
  const achados = [];
  let ilegivel = null;
  if (agentes.includes('claude-code')) {
    const base = env.CLAUDE_CONFIG_DIR || path.join(casa ?? env.HOME ?? env.USERPROFILE ?? os.homedir(), '.claude');
    const arquivo = path.join(base, 'plugins', 'installed_plugins.json');
    let chaves = [];
    try {
      const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      const plugins = dados?.plugins;
      if (plugins && typeof plugins === 'object' && !Array.isArray(plugins)) chaves = Object.keys(plugins);
      else ilegivel = arquivo;
    } catch (e) {
      // Sem o arquivo, sem plugin a acusar; arquivo que existe e não se lê é dito.
      if (e.code !== 'ENOENT') ilegivel = arquivo;
    }
    for (const colecao of COLECOES_DO_CLAUDE) {
      if (chaves.some(k => k.startsWith(`${colecao}@`))) achados.push(`${colecao} no Claude Code`);
    }
  }
  return detalhado ? { achados, ilegivel } : achados;
}
