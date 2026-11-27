// Portas da extensão ambiente: a escolha (pura) e a sondagem (a porta está escutando agora nesta máquina?).
import net from 'node:net';

// As `quantas` menores portas da faixa [de, ate] fora de `ocupadas`, em ordem; null quando não cabem.
export function escolherPortas([de, ate], quantas, ocupadas) {
  const livres = [];
  for (let p = de; p <= ate && livres.length < quantas; p++) if (!ocupadas.has(p)) livres.push(p);
  return livres.length === quantas ? livres : null;
}

// Tenta escutar na porta: se outro processo já escuta (EADDRINUSE), ela está em uso. Outro erro (permissão, por
// exemplo) também conta como em uso: na dúvida, a porta não vai para a frente.
export function portaEmUso(porta) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(true));
    s.listen(porta, '127.0.0.1', () => s.close(() => resolve(false)));
  });
}
