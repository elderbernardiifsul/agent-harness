# Formato da wiki

O único lugar do formato da wiki: artigo, página arquivada, índice e log. As skills `wiki-ingerir`, `wiki-consultar` e `wiki-conferir` apontam para cá, e o `tools/ah wiki conferir` lê o que este arquivo define (o campo Fontes, a marca de arquivada, os blocos de status e a entrada "sem material" do log). Mudou aqui, muda para todos.

Reescrita genérica de [astro-han/karpathy-llm-wiki](https://github.com/astro-han/karpathy-llm-wiki) (MIT, commit `eafcc77`; licença em `LICENSE-karpathy-llm-wiki`, nesta pasta), que empacota a ideia de Andrej Karpathy: o agente escreve e mantém a wiki; o humano lê e pergunta. A diferença: não há pasta de material bruto. As fontes são os documentos que o projeto já tem, lidos onde estão.

## Onde fica

- A wiki fica na pasta de `extensoes.wiki.pasta` (padrão `docs/wiki/`): um nível de pasta por tema, `<pasta>/<tema>/<artigo>.md`, nada mais fundo.
- `<pasta>/index.md`: o índice global, uma linha por artigo, agrupada por tema.
- `<pasta>/log.md`: o registro das operações; só se acrescenta.
- O que a wiki pode citar como fonte sai da configuração; `tools/ah wiki fontes` lista. A wiki nunca edita uma fonte.

Nomes de arquivo pelo conceito, não pela fonte: `frete/frete-gratis.md`, não `frete/adr-0001.md`.

## A invariante de evidência

Todo número, data, horário ou citação de um artigo existe literalmente num arquivo ligado pelo campo Fontes daquele artigo.

São literais de alto sinal, conferidos pelo `tools/ah wiki conferir`:

- números com separador ou sufixo (`1.234,56`, `2,5%`, `42K`) e números de 4 ou mais dígitos (`2026`);
- datas (`2026-11-20`, `01/12/2026`, `01/12`) e horários (`0:12:40`, `12:40`);
- citações de 15 ou mais caracteres, entre aspas retas ou curvas, e blockquotes do corpo.

Inteiros pequenos ("3 lojas") e nomes não são conferidos pelo comando, mas valem pela mesma regra.

- **Escreva como está na fonte.** Se a fonte diz "dois reais", escreva "dois reais", não "R$ 2,00".
- **Valor derivado** (soma, diferença, contagem que você fez) mostra os componentes, cada um achável na fonte: "R$ 215,90 (R$ 200,00 do pedido mais R$ 15,90 de frete)".
- Não localizou o valor na fonte: tire-o, ou diga-o sem precisão.
- Literal que existia e sumiu da fonte aparece como suspeito: é o sinal de que a fonte mudou e o artigo precisa acompanhar.

## Artigo

```markdown
# <Título>

> Fontes: [<o quê e de quando>](<caminho relativo a este arquivo>); [<outra fonte>](<caminho>)
> Atualizado: <AAAA-MM-DD>

## Visão geral

<Um parágrafo com os pontos principais.>

## <Seções próprias>

<Destile e reorganize; não copie. Blockquote só para a formulação original que importa (a fala de quem decidiu, o
texto de uma decisão). Termo do glossário: link para o glossário em vez de redefinir.>

## Veja também

- [<Outro artigo do mesmo tema>](<outro-artigo>.md)
- [<Artigo de outro tema>](../<outro-tema>/<artigo>.md)
```

- **Fontes** fica no cabeçalho: o blockquote logo abaixo do título. A mesma linha no corpo não vale como campo. Os links são relativos ao artigo (de `docs/wiki/<tema>/` para `docs/adr/` é `../../adr/…`; para um arquivo na raiz do projeto, `../../../CONTEXT.md`), separados por `;`, e o texto do link diz o quê e de quando ("ADR 0001, 2026-11-20", "reunião de 20/11, transcrição"). Âncora (`#seção`) pode.
- **Atualizado** é a data da última mudança de conhecimento do artigo. Na criação, a data de hoje; correção de digitação ou de formatação não muda a data.
- **Veja também** é opcional, só com referências cruzadas reais.
- Nada do que está dentro de bloco de código é conferido; não esconda afirmação ali.

### Blocos de status

Logo abaixo da afirmação que deixou de valer como está escrita. Nunca reescreva a história em silêncio: a afirmação antiga fica, marcada.

```markdown
> **Status: Superado** (<AAAA-MM-DD>)
> <O que mudou e o que vale agora, com a fonte: ADR, decisão em ticket, verbete do glossário.>

> **Status: Contestado**
> <As afirmações em disputa, cada uma com a sua fonte, e quem decide (ticket, ADR, a pessoa), quando houver.>
```

O texto de um bloco de status não é conferido: ele cita o que deixou de valer.

### Exemplo

<!-- exemplo:fonte docs/adr/0001-frete-gratis.md -->
```markdown
# ADR 0001: frete grátis

Data: 2026-11-20. Decisão de Ana Souza.

A loja passa a dar frete grátis em pedidos acima de R$ 200,00, a partir de 01/12/2026, só para o Sul e o Sudeste.
"Frete grátis para o Norte fica para depois do Natal."
```
<!-- /exemplo -->

<!-- exemplo:artigo docs/wiki/frete/frete-gratis.md -->
```markdown
# Frete grátis

> Fontes: [ADR 0001, 2026-11-20](../../adr/0001-frete-gratis.md)
> Atualizado: 2026-11-20

## Visão geral

A partir de 01/12/2026, pedidos acima de R$ 200,00 têm frete grátis no Sul e no Sudeste. O Norte ficou de fora.

## Regra

Valor mínimo de R$ 200,00; vale só para o Sul e o Sudeste. Ana Souza decidiu em 2026-11-20:

> Frete grátis para o Norte fica para depois do Natal.

> **Status: Contestado**
> A reunião de 18/11 com a Carla propôs frete de R$ 15,90 para o Norte; a ADR 0001 deixou o Norte para depois. Quem decide: Ana Souza.
```
<!-- /exemplo -->

## Página arquivada

Resposta de uma consulta guardada a pedido. É retrato de um momento: nunca é atualizada em cascata e não é conferida pelo `tools/ah wiki conferir`.

```markdown
# <Título pela pergunta>

> Fontes: [<Artigo citado>](<artigo>.md); [<Outro>](../<outro-tema>/<artigo>.md)
> Arquivado: <AAAA-MM-DD>

## Visão geral

<A pergunta e o que a resposta encontrou.>

## <Seções>

<A resposta, levemente editada.>
```

As Fontes de uma página arquivada são os artigos da wiki que a resposta citou.

## Índice

```markdown
# Índice da wiki

## <tema>

<Uma linha descrevendo o tema.>

| Artigo | Resumo | Atualizado |
|---|---|---|
| [<Título>](<tema>/<artigo>.md) | <Resumo em uma linha> | <AAAA-MM-DD> |
| [<Página arquivada>](<tema>/<arquivada>.md) | [Arquivado] <Resumo> | <AAAA-MM-DD> |
| [<Artigo que sumiu>](<tema>/<sumiu>.md) | [AUSENTE] <Resumo> | <AAAA-MM-DD> |
```

A data é a do campo Atualizado do artigo (Arquivado, na página arquivada). `[AUSENTE]` marca a linha cujo arquivo não existe mais; quem apaga a linha é o humano.

## Log

Só se acrescenta; uma entrada por operação, com a data de hoje. Caminhos de fonte a partir da raiz do projeto; de artigo, a partir da pasta da wiki.

```markdown
## [<AAAA-MM-DD>] ingestão | <título do artigo principal>
- Disposição: <Novo; Atualização; Contestado>
- Fonte: <caminho>[ — <recorte, quando houver>]
- Atualizado: <título de artigo atualizado em cascata>

## [<AAAA-MM-DD>] mover | <título do artigo>
- De: <caminho antigo>
- Para: <caminho novo>
- Motivo: <quem pediu e por quê>
- Links corrigidos: <artigos com link de entrada corrigido>

## [<AAAA-MM-DD>] consulta | Arquivado: <título da página>

## [<AAAA-MM-DD>] lint | <N> problemas, <M> corrigidos
```

Omita as linhas `- Atualizado:` quando não houver cascata. A fonte que não trouxe nada novo também entra, com esta entrada exata, que o `tools/ah wiki conferir` lê para não cobrar a fonte na cobertura:

```markdown
## [2026-11-20] ingestão | sem material: docs/reunioes/2026-11-18-cupom/ata.md
- Disposição: Sem material
```

O primeiro commit que toca o log depois de uma ingestão marca a "última ingestão": o lembrete do começo de sessão e a sugestão do fechamento contam as fontes mudadas depois dele. Commite o log junto com os artigos.

## Convenções

- Markdown comum, links relativos dentro da wiki; na conversa, caminhos a partir da raiz (`docs/wiki/frete/frete-gratis.md`).
- Português, no estilo dos documentos do projeto; os termos do glossário do projeto (`CONTEXT.md` ou `GLOSSARY.md`), com link para ele.
- Quem escreve o quê: a ingestão atualiza o índice e o log (sem material, só o log); mover atualiza os dois; arquivar atualiza os dois; a conferência atualiza o log, e o índice só quando corrige linhas; a consulta simples não escreve nada.
