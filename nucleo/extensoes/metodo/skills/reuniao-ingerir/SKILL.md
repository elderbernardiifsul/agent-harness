---
name: reuniao-ingerir
description: "Transforma a gravação de uma reunião (com vídeo e áudio, ou só áudio) numa pasta de material conferível: transcrição com o instante e o falante de cada fala, blocos de fatos com tempo, capturas de tela, sobras para o humano decidir, e os fatos ingeridos na wiki. Use para ingerir reunião, transcrever reunião, analisar gravação, ata da reunião com o cliente."
---

# Ingerir uma reunião

**Dor:** a reunião com o cliente vira só lembrança; e, quando vira texto, o fato se mistura com a hipótese dita na hora, o falante fica trocado e o número é completado de cabeça. Esta skill leva a gravação até fatos com instante, conferíveis por qualquer um, e depois até a wiki.

Esta skill diz **o que precisa sair**. As ferramentas são escolha sua, conforme a máquina em que você está.

## Entradas

- A gravação: com vídeo e áudio, ou só áudio.
- Quando houver, uma transcrição exportada pela plataforma da reunião: é uma leitura a mais do áudio, não a verdade. O resumo automático da plataforma não é fonte.

## Antes de começar

1. **Dado de terceiros.** A gravação tem a voz e, às vezes, a tela de outras pessoas. Pergunte se o arquivo entra no repositório (o padrão é **não** entrar: o README da reunião diz onde ele está) e lembre o aluno do **consentimento** dos participantes para gravar e transcrever.
2. **Pasta.** Proponha `docs/reunioes/<AAAA-MM-DD>-<assunto>/` e espere a confirmação. Ela precisa ficar entre as fontes da wiki (confira com `tools/ah wiki fontes` depois de criar o primeiro arquivo); se não ficar, diga ao aluno.
3. **Ferramentas.** Confira o que a máquina já tem para: extrair o áudio, reconhecer fala com o instante de cada trecho, ler a faixa de legenda embutida na gravação (quando há) e tirar quadros do vídeo num instante dado. Para o que faltar, diga o que instalaria, de onde e onde ficaria, e **só instale com o "sim" do aluno**. Pode trocar uma ferramenta por outra equivalente. Sem como lidar com vídeo, siga só com o áudio e registre no README o que deixou de fazer (capturas, legenda).

## Leituras do áudio

Use todas as que houver: a transcrição da plataforma, a faixa de legenda da gravação (costuma trazer o falante e o tempo fino), e o seu reconhecimento de fala.

- **Um eixo de tempo só**, `[H:MM:SS]`, o tempo da gravação. Confira o alinhamento numa fala que aparece em duas leituras e diga no README qual foi.
- Onde as leituras divergem, ouça o trecho. O que continuar incerto vai com `(?)`. Nada é completado de cabeça.

## O que sai, na pasta da reunião

- **`README.md`**: data, participantes, as fontes (onde está a gravação, que leituras do áudio foram usadas e como), o eixo de tempo e a fala usada para alinhar, o que é incerto, o que não foi feito e por quê, e os cuidados (dado sensível cortado, trecho fora de escopo).
- **`transcricao.md`**: toda fala com o instante `[H:MM:SS]`; o falante quando a fonte o traz, e `(inferido)` ao lado do nome quando é você quem atribui pelo contexto.
- **`blocos/bloco-NN.md`**: blocos de cerca de 10 minutos, cortados onde o assunto muda. Em cada um: o intervalo, um resumo curto e os **fatos**, cada um com o instante `[H:MM:SS]` e de onde vem (dito por quem, ou mostrado na tela). Separe o fato da hipótese ("acho que", "deve ser") e da decisão (quem decidiu o quê); o que uma pessoa afirma sem certeza não vira fato.
- **`capturas/`** (com vídeo): quadros no instante dos fatos que dependem da tela, com o nome começando pelo instante (`0h12m40s-carrinho.png`) e citados no bloco. Recorte ou amplie quando o texto da tela ficar pequeno.
- **`sobras.md`**: o que você não decidiu e o humano precisa decidir (trecho incerto, falante duvidoso, contradição entre falas, pergunta que ficou sem resposta), cada item com o instante.

## Cuidados

- Dado sensível dito em voz alta (senha, documento pessoal, dado de cartão) sai da transcrição e dos blocos, com a marca `[trecho suprimido: <motivo>]` no lugar e uma linha no README. Não capture a tela nesse instante.
- Conversa pessoal fica fora dos blocos.
- O arquivo de áudio ou vídeo nunca é fonte da wiki; a wiki cita os `.md` da pasta.

## Para a wiki

Com a pasta pronta, ingira os fatos pela skill `wiki-ingerir`, tendo os blocos (e o README) como fonte. Decisão dita na reunião não vale sobre ADR ou decisão registrada; a divergência fica marcada como a skill de ingestão manda. No fim, `tools/ah wiki conferir` nos artigos tocados: os instantes e os números da wiki estão nos blocos.

## Pronto quando

A pasta tem README, transcrição, blocos, `sobras.md` (e capturas, com vídeo); cada fato tem instante; o que é incerto está marcado; os fatos estão na wiki e a conferência não traz suspeito sem explicação.
