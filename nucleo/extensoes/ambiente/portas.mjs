// Portas da extensão ambiente: a escolha (pura) e a sondagem (a porta está escutando agora nesta máquina?).
import net from 'node:net';

// As `quantas` menores portas da faixa [de, ate] fora de `ocupadas`, em ordem; null quando não cabem.
export function escolherPortas([de, ate], quantas, ocupadas) {
  const livres = [];
  for (let p = de; p <= ate && livres.length < quantas; p++) if (!ocupadas.has(p)) livres.push(p);
  return livres.length === quantas ? livres : null;
}

// Tenta escutar na porta, em IPv4 e em IPv6 (um servidor em "localhost" costuma escutar só em ::1). Se outro
// processo já escuta (EADDRINUSE), ela está em uso. Máquina sem IPv6 (EADDRNOTAVAIL, EAFNOSUPPORT) não conta como
// uso; outro erro (permissão, por exemplo) conta: na dúvida, a porta não vai para a frente.
function tentar(porta, endereco) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', e => resolve(endereco === '::1' && ['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(e.code) ? false : true));
    s.listen(porta, endereco, () => s.close(() => resolve(false)));
  });
}

export async function portaEmUso(porta) {
  return (await tentar(porta, '127.0.0.1')) || (await tentar(porta, '::1'));
}
