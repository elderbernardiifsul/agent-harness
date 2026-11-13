# Vídeo de apresentação do repositório

Vídeo narrado (8 a 10 min) que apresenta o agent-harness: cenário e problemática, o método, as pastas, uma demonstração com saídas reais e os limites. O vídeo, a legenda e os intermediários ficam fora do git.

| Arquivo | O que é |
|---|---|
| `roteiro.mjs` | as cenas, na ordem: tipo de tela, conteúdo e as falas (`fala` é a legenda; `voz`, quando existe, é o texto que a voz sintetizada lê) |
| `palco.html`, `palco.css`, `telas.js` | a tela de 1920×1080; `mostrar(cena, passo, t)` desenha cada quadro em função do tempo |
| `gerar.mjs` | narração (edge-tts), quadros (chromium headless pelo protocolo de depuração), legenda `.srt` e mp4 (ffmpeg) |
| `demo/capturar.sh` | roda o ciclo do harness num repositório descartável, sem rede, e grava cada comando com a saída em `demo/saidas/` |
| `demo/saidas/` | as saídas capturadas, fonte das telas da demonstração; `<demo>` substitui a pasta do ensaio, e `[código N]` é o código de saída anotado pelo script |

Requisitos: Node 22 ou mais novo, `chromium`, `ffmpeg` e `ffprobe` no PATH, e o `edge-tts` (num venv: `python3 -m venv <venv> && <venv>/bin/pip install -U edge-tts`). A narração usa a rede (serviço de voz do edge-tts); a demonstração não.

## Regenerar

```
bash docs/video/apresentacao/demo/capturar.sh <pasta-descartável>      # só se as saídas precisarem mudar
node docs/video/apresentacao/gerar.mjs --tmp <pasta> --previa           # um PNG por passo, sem voz, para conferir as telas
node docs/video/apresentacao/gerar.mjs --tmp <pasta> --saida <pasta> --tts <venv>/bin/edge-tts
```

A saída tem `apresentacao.mp4` (H.264, 30 fps, AAC, áudio a −16 LUFS), `apresentacao.srt` e `cenas.txt` (início de cada cena). A duração de cada passo é a da fala mais as pausas; as falas sintetizadas ficam em cache em `<tmp>/voz/`. `--cenas a,b` restringe a geração a algumas cenas (útil com `--previa`).
