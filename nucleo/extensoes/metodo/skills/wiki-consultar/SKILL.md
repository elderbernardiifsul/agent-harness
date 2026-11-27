---
name: wiki-consultar
description: "Responde pelo que a wiki do projeto sabe, com links para os artigos, e arquiva a resposta na wiki quando pedirem. Use para perguntas como 'o que a wiki diz sobre X', 'o que sabemos sobre Y', 'resuma tudo sobre Z', 'compare A e B pela wiki', ou 'guarde esta resposta na wiki'."
---

# Consultar a wiki

**Dor:** resposta plausível sem fonte. Quem pergunta pelo projeto merece a resposta que o projeto registrou, com o caminho até ela, e não a que o agente lembra de outro lugar.

O formato da wiki (artigo, página arquivada, índice, log) está em `.harness/nucleo/extensoes/wiki/formato.md`. A pasta da wiki vem de `extensoes.wiki` no `.harness/config.json` (padrão `docs/wiki/`).

Se a wiki não existe, diga: "A wiki ainda não tem ingestão; a skill wiki-ingerir cria a wiki." Não crie a estrutura.

## Passos

1. **Ache os candidatos.** Leia o `index.md` e busque na pasta da wiki os termos da pergunta **e os sinônimos** deles. Só diga que a wiki não cobre o assunto depois de índice e busca voltarem vazios, e diga que buscou.
2. **Leia e sintetize.** Leia os artigos achados e responda. A wiki vem antes do seu conhecimento prévio; onde ela tem bloco **Superado** ou **Contestado**, a resposta diz isso e quem decide.
3. **Cite** com links a partir da raiz: `[Frete grátis](docs/wiki/frete/frete-gratis.md)`.
4. **Se a wiki não cobre e uma fonte cobre** (o que é fonte: `tools/ah wiki fontes`), diga qual fonte e ofereça a ingestão (skill wiki-ingerir). Não responda pela fonte como se fosse a wiki.
5. **A resposta fica na conversa.** A consulta não escreve arquivo, a não ser que peçam o arquivamento.

## Arquivar a resposta

Só a pedido.

1. Página nova, no modelo de página arquivada do formato, na pasta de tema mais relevante, com o nome pelo assunto da pergunta. Os links da conversa (a partir da raiz) viram relativos ao arquivo; as Fontes são os artigos da wiki que a resposta citou.
2. Sempre página nova; nunca incorpore a resposta a um artigo (é síntese, não fonte).
3. Índice com `[Arquivado]` no começo do resumo; log com a entrada `consulta | Arquivado:`.

## Pronto quando

A resposta cita os artigos em que se apoia, diz o que está em disputa, e diz claramente o que a wiki não sabe.

---

Reescrita genérica da skill de [astro-han/karpathy-llm-wiki](https://github.com/astro-han/karpathy-llm-wiki) (MIT, commit `eafcc77`); licença em `LICENSE-karpathy-llm-wiki`, nesta pasta.
