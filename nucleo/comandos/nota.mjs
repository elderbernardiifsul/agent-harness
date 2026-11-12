import { ErroDeUso } from '../lib/caminhos.mjs';
import { comTrava, registrarEvento } from '../lib/estado.mjs';
import { gravarFrente, lerFrente } from '../lib/frente.mjs';
import { lerSessao } from '../lib/sessao.mjs';

export const descricao = 'acrescenta uma nota à frente da sessão';
export const requisitos = { config: true, sessao: true };

export async function executar(args, amb) {
  const texto = args.join(' ').trim();
  if (!texto) throw new ErroDeUso('A nota está vazia.\nPróximo passo: escreva o texto, como ah nota "mexendo no total"');
  const sessao = lerSessao(amb.dirEstado, amb.sessaoId);
  const nome = sessao?.frente ? (sessao.frente.nome ?? sessao.frente) : null;
  if (!nome) throw new ErroDeUso('Esta sessão não tem frente ativa.\nPróximo passo: rode ah open <nome> para abrir uma');
  return comTrava(amb.dirEstado, 'frentes', async () => {
    const frente = lerFrente(amb.dirEstado, nome);
    if (!frente) throw new ErroDeUso(`Não achei a frente ${String(nome).slice(0, 60)} no estado.\nPróximo passo: rode ah doctor`);
    frente.notas = [...(frente.notas ?? []), { em: new Date().toISOString(), sessao: amb.sessaoId, texto }];
    gravarFrente(amb.dirEstado, frente);
    registrarEvento(amb.dirEstado, { tipo: 'nota', sessao: amb.sessaoId, frente: frente.nome });
    amb.escrever(`Nota registrada na frente ${frente.id} ${frente.nome}.\n`);
    return 0;
  });
}
