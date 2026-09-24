---
name: hitzz
description: Processa o trabalho pendente do HitzzDash no modo gratuito (sem API da Anthropic) — analisa os Reels coletados, escreve o resumo semanal e os roteiros pedidos no app. Use quando o usuário disser "processe os pendentes do Hitzz", "analise os vídeos pendentes", "gere o resumo da semana", "gere os roteiros pendentes", ou pedir um roteiro de Reel da UseHitzz.
---

# HitzzDash · modo Claude Code (econômico)

Tudo roda na raiz do projeto com `npm run -s cc -- <comando>`. O CLI prepara insumos compactos, valida com os mesmos schemas do modo API e grava no banco (Turso). O site na Vercel atualiza sozinho.

**Regras de economia (siga à risca):**
- A sessão principal NUNCA lê insumos de vídeo, imagens ou análises. Ela só orquestra e lê respostas de uma linha.
- A análise de vídeos é feita pelo subagente `hitzz-analista` (Sonnet, 3 ferramentas, ~4 turnos por lote). Se esse tipo não existir na sessão, use `general-purpose` com `model: sonnet` e o mesmo prompt do arquivo `.claude/agents/hitzz-analista.md`.
- Lotes grandes diluem o custo fixo de cada subagente: 24 vídeos por subagente.
- Respostas finais curtas.
- Só o dono dispara este trabalho (Claude Code dele ou a rotina semanal). O site não gasta tokens: a equipe só consulta.

## Passo a passo ("processe os pendentes")

1. `npm run -s cc -- work` (em background se demorar): roda a fila (coletas, download, Whisper, frames) e grava as imagens comprimidas no banco. Funciona no Mac e no ambiente de nuvem da rotina semanal.
2. `npm run -s cc -- status` → N vídeos aguardando.
3. Se N > 0: dispare ceil(N/24) subagentes `hitzz-analista` em paralelo (no máximo 6 por vez), cada um com o prompt "Analise um lote." (o subagente usa `pack --n 24`, que reserva os vídeos sozinho; nunca passe IDs). Repita até `status` dar 0.
4. Se houve análise nova: resumo semanal.
   - `npm run -s cc -- digest`, depois leia `data/claude-code/RESUMO.md` e o `input.json` indicado (tabelas + vídeos com apelidos v1…).
   - Escreva o JSON e rode `npm run -s cc -- save-digest <arquivo>`. Cite só apelidos; o CLI converte para IDs reais e descarta os inválidos.
   - Seja honesto com a evidência (a coluna `evidência` já vem calculada).
5. Roteiros pedidos no app:
   - `npm run -s cc -- scripts`, depois leia `ROTEIRO.md` uma vez e o `input.json` de cada pedido.
   - Escreva `{plan, script}` e rode `npm run -s cc -- save-script <pedido> <arquivo>`.
   - Se a originalidade passar de ~60%, reescreva o hook.
6. Termine com 2–4 linhas: vídeos analisados, se o resumo foi atualizado, roteiros gravados (título + link `https://hitzz-dash.vercel.app/scripts?id=<id>`), erros.

## Execução semanal (rotina de segunda-feira)

Quando o pedido for a atualização semanal ("rode a atualização semanal do Hitzz"):

1. `npm ci` se `node_modules` não existir (se falhar, `npm install`).
2. Passos 1–4 acima, mas com `npm run -s cc -- work --refresh --minutes 120` no passo 1 (coleta todas as contas agora). Se `ffmpeg` não estiver no PATH, `apt-get install -y ffmpeg` antes. A coleta só traz posts dos últimos 14 dias (a semana nova + métricas da anterior), e só os publicados nos últimos 7 dias são analisados; os mais antigos ficam só com métricas.
3. `npm run -s cc -- weekly-scripts` cria o lote de 10 roteiros base da semana a partir das tendências e padrões (não duplica se já existir).
4. Passo 5 para todos os pedidos pendentes. Com mais de 4 pedidos, divida entre até 3 subagentes `general-purpose` (`model: sonnet`), cada um com uma lista de números de pedido e a instrução de ler `ROTEIRO.md`, escrever `{plan, script}` para cada pedido e gravar com `save-script`. Cada roteiro do lote precisa de ângulo, hook e estrutura diferentes.
5. Resumo final como no passo 6, com a contagem de roteiros do lote.

## Roteiro pedido direto no chat

`npm run -s cc -- new-script --category promotion --tone natural --notes "frete grátis até domingo"` (ou `--theme "texto livre"`; sem nenhum dos dois, os dados decidem). Depois siga o passo 5.

Categorias: launch, promotion, promo_trip, seasonal, brand_daily, styling, social_proof. Tons: natural, energetic, premium, funny, direct.
