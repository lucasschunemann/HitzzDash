# UseHitzz · Inteligência de conteúdo

Plataforma local que coleta os Reels mais recentes dos concorrentes e referências da UseHitzz (calçados, Blumenau/SC), transcreve, analisa estrutura e desempenho com IA, encontra os padrões que importam e gera roteiros originais com base nesses dados.

A pergunta que ela responde toda semana: **o que produzir a seguir, e por quê.**

---

## Rodar

Requisitos: **Node 20+**, **ffmpeg** (`brew install ffmpeg`) e, para o modo gratuito, o **Claude Code**.

```bash
cp .env.example .env      # só o APIFY_TOKEN é obrigatório
npm install
npm run setup:whisper     # transcrição local gratuita (~550 MB)
npm run dev               # http://localhost:3000
```

## Modo gratuito (padrão) × modo API

O app escolhe sozinho, pelas chaves presentes no `.env`:

| Etapa | Modo gratuito (sem chave) | Modo API (com chave) |
|---|---|---|
| Coleta | Apify, plano gratuito (crédito mensal) | Apify |
| Transcrição | **Whisper local** (whisper.cpp `large-v3-turbo` + detecção de voz Silero) | ElevenLabs Scribe (`ELEVENLABS_API_KEY`) |
| Análise, resumo, roteiros | **Claude Code** com a sua assinatura do Claude, via skill `hitzz` | API da Anthropic, automático (`ANTHROPIC_API_KEY`) |

No modo gratuito, a coleta e a transcrição continuam automáticas. Os vídeos chegam até "aguardando Claude Code". Aí você abre o Claude Code na pasta do projeto e diz:

> **processe os pendentes do Hitzz**

A skill (`.claude/skills/hitzz/SKILL.md`) usa o CLI `npm run cc -- …`, que:
- prepara cada vídeo em `data/claude-code/videos/<id>/`: uma **folha de contato** (os frames-chave numa única imagem, numerados com o tempo, para gastar pouco do plano) e um `input.json` com métricas, score e transcrição;
- valida a análise, o resumo e os roteiros escritos pelo Claude Code com **os mesmos schemas Zod do modo API**, rejeitando com a lista de campos errados;
- nos roteiros, aplica as mesmas regras do modo API: valida os IDs citados contra o banco e mede a originalidade.

Roteiros pedidos na tela **Roteiros** viram pedidos "aguardando o Claude Code". O botão **Esqueleto rápido (sem IA)** gera na hora uma versão pelos números. A tela Hoje mostra quanto trabalho está aguardando e a frase para copiar.

Para forçar um modo: `TRANSCRIBER=local|elevenlabs` e `ANALYZER=claude_code|api`.

É um comando só depois da instalação: o banco SQLite é criado e migrado no primeiro acesso, os dados de demonstração são carregados se o banco estiver vazio, e a fila de processamento e a agenda sobem junto com o servidor (via `instrumentation.ts`).

Produção local: `npm run build && npm start`.

### Variáveis de ambiente (`.env`)

| Variável | Para quê | Sem ela |
|---|---|---|
| `APIFY_TOKEN` | Coleta de Reels e perfis (Apify) | Coleta desativada; o app usa os dados demo |
| `ELEVENLABS_API_KEY` (opcional) | Transcrição pela API (Scribe) | Usa o Whisper local |
| `ANTHROPIC_API_KEY` (opcional) | Análise, resumo e roteiros automáticos pela API | Usa o Claude Code (modo gratuito) |
| `ANTHROPIC_MODEL` (opcional) | Modelo do Claude | Padrão `claude-opus-5` |
| `DATA_DIR` (opcional) | Pasta do banco e da mídia | Padrão `./data` |

`.env` está no `.gitignore`. As chaves nunca são exibidas na interface, nos logs ou nas respostas da API: a tela **Configurações** só mostra se cada uma existe e tem um botão **Testar** que faz uma chamada barata (Apify `users/me`, ElevenLabs `models`, Anthropic `models.retrieve`). Um aviso aparece no topo de todas as telas quando falta alguma variável.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | App + fila + agenda |
| `npm test` | Testes (score de outlier, padrões, normalização do Apify, detecção de fala) |
| `npm run smoke` | Teste de ponta a ponta do pipeline de mídia sem APIs pagas (ver abaixo) |
| `npm run setup:whisper` | Instala o whisper.cpp e baixa os modelos em `models/` |
| `npm run cc -- work` | Worker do Mac: roda a fila (coletas, Whisper, frames) e envia imagens ao Blob |
| `npm run cc -- status` | CLI do modo Claude Code (usado pela skill `hitzz`) |
| `npm run db:setup` | Migra o banco (local ou Turso) e carrega a demo se estiver vazio |
| `npm run db:copy-to-cloud` | Copia o banco local do Mac para o Turso |
| `npm run typecheck` | Tipos (gera os tipos de rota do Next antes) |
| `npm run lint` | ESLint |
| `npm run db:generate` | Gera migração após mudar `src/db/schema.ts` |

---

## Consumo de tokens no modo Claude Code

A análise é feita por subagentes (`.claude/agents/hitzz-analista.md`: Sonnet, só Read/Write/Bash), com lotes de 24 vídeos e ~4 turnos por lote.

| Otimização | Efeito |
|---|---|
| `cc pack` reserva o lote de forma atômica e imprime guia + insumos num único texto | O orquestrador não distribui IDs nem lê insumos; nenhum subagente pega o mesmo vídeo |
| Guia curto (2,3 mil caracteres) no lugar de guia + JSON Schema + exemplo (22,5 mil) | −90% de custo fixo por subagente |
| Formato de saída compacto (tuplas; cenas, textos na tela e estrutura derivados dos beats pelo código) | −51% na saída com o mesmo conteúdo, mais o pedido de frases curtas |
| Folha de frames enxuta: 8 quadros 180×320 | ~630 tokens de imagem por vídeo, contra ~1.100 |
| Transcrição resumida (começo + fim, ~700 caracteres) | Corta falas longas sem perder hook e CTA |
| Imagens lidas em paralelo, lote gravado de uma vez (`cc save-batch`) | ~4 turnos por lote, contra ~45 |
| Resumo e roteiros: estatísticas em tabelas, IDs trocados por apelidos (v1, v2…) | Insumo do resumo −79% (43 mil → 9 mil caracteres) |

Medido: **~4,5 mil tokens por vídeo** em lotes de 24, contra ~12,5 mil no fluxo anterior (−64%). O custo que sobra é quase todo fixo por subagente, então lotes grandes rendem mais.

## Publicar para a equipe (Vercel)

O dashboard roda na **Vercel (plano Hobby)** e o trabalho pesado fica no **Mac**. Os dois usam o mesmo banco na nuvem.

```
Equipe ──(senha)──▶ Vercel: dashboard, padrões, roteiros, pedidos
                          │   lê e grava
                          ▼
                    Turso (SQLite na nuvem) ◀── Mac: coleta (Apify), Whisper, frames,
                    Vercel Blob (imagens)   ◀──      análise no Claude Code
```

- Na Vercel não há disco nem processo contínuo. "Coletar", "Atualizar agora" e "Reprocessar" apenas **enfileiram** o trabalho no banco. O Mac executa com `npm run cc -- work`, ou dizendo "processe os pendentes do Hitzz" no Claude Code. A barra lateral mostra quando o Mac processou pela última vez.
- O que roda na hora, mesmo na Vercel: navegar pelos dados, reclassificar hooks, gerenciar contas, pedir roteiros, gerar o esqueleto sem IA e recalcular o resumo pelos números.
- **Login**: senha única da equipe em `DASHBOARD_PASSWORD`. Sem ela, a Vercel não serve nada.
- **Atualização da tela**: a cada 20 s na Vercel (funções serverless não mantêm SSE); em tempo real no Mac.

### Passo a passo

1. `npx vercel login`, depois `npx vercel` na pasta do projeto (cria o projeto e faz o primeiro deploy).
2. No painel da Vercel, em **Storage**: crie um banco **Turso** (Marketplace, plano grátis) e um **Blob store**, e conecte os dois ao projeto. A Vercel cria `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` e `BLOB_READ_WRITE_TOKEN`.
3. Em **Settings → Environment Variables**, adicione `DASHBOARD_PASSWORD`.
4. No Mac: `npx vercel env pull .env.vercel` e copie essas quatro variáveis para o `.env` (o Mac precisa escrever no mesmo banco e no mesmo Blob).
5. `npm run db:setup` (cria as tabelas no Turso), e `npm run db:copy-to-cloud` se já houver dados locais.
6. `npm run cc -- work` (envia as imagens ao Blob) e `npx vercel --prod`.

Dica: crie o banco Turso na mesma região das funções da Vercel, para as páginas carregarem mais rápido.

Os limites do plano Hobby (banda, execuções, armazenamento do Blob) cobrem com folga o uso de uma equipe pequena. Os termos da Vercel descrevem o Hobby como uso pessoal/não comercial; se a empresa quiser formalizar, é só trocar para o Pro, sem mudar código.

## Decisões de arquitetura

| Decisão | Por quê |
|---|---|
| **Next.js 16 (App Router) + TypeScript + Tailwind 4** | Um processo só serve UI, API e worker. Server Components leem o SQLite direto, sem camada extra. |
| **SQLite via libSQL + Drizzle** | Arquivo local em `data/` no Mac, ou **Turso** (SQLite na nuvem) quando `DATABASE_URL`/`TURSO_DATABASE_URL` está definida. O mesmo código atende o Mac e a Vercel. Migrações versionadas em `drizzle/`. |
| **Fila persistida no próprio SQLite, worker dentro do processo** | Sem Redis. Jobs têm `status`, tentativas, `runAfter` (backoff) e deduplicação por chave. Ao reiniciar, jobs que estavam rodando voltam para a fila. |
| **SSE (`/api/events`) + `router.refresh()`** | Toda escrita registra um evento em `change_log`; o navegador recebe e re-renderiza a página sem recarregar. |
| **Radix + Motion + cmdk + sonner** | Primitivas acessíveis (teclado, foco, ARIA), animações com spring, menu Cmd+K e toasts. |
| **Gráficos em SVG próprio** | Controle total do visual Apple (marcas finas, desenho na entrada, tooltip), sem biblioteca pesada. |
| **Zod + structured outputs** | Toda saída do Claude é JSON validado por schema (`output_config.format`) e revalidado no servidor. |

### Modelo de dados (`src/db/schema.ts`)

- `accounts`: handle, grupo (`competitor` · `reference` · `own`), seguidores, avatar, ativa, status da última coleta. `account_snapshots` guarda seguidores ao longo do tempo.
- `videos`: ID do Instagram como chave (deduplicação), métricas (views/plays, curtidas, comentários, compartilhamentos), data, legenda, hashtags, duração, música/áudio, fixado, parceria paga, seguidores no momento da coleta, caminhos da capa (permanente) e do vídeo (temporário). `video_snapshots` guarda métricas por coleta.
- `processing`: status de cada etapa por vídeo (`media`, `transcript`, `frames`, `analysis`): pendente, rodando, ok, falhou, pulada, aguardando chave; último erro e tentativas.
- `transcripts` (fala, palavras com tempo, tipo: fala / letra de música / sem fala / sem áudio), `frames` (frames-chave com tempo), `analyses` (JSON completo + colunas para agregação + reclassificação manual do hook).
- `jobs`, `scripts` (pedido, plano, roteiro, evidências, favorito, família de variações), `digests` (resumo semanal), `notifications`, `settings`, `change_log`.

---

## Pipeline

1. **Coleta (Apify)**: `apify/instagram-profile-scraper` (`usernames`) para seguidores e avatar, e `apify/instagram-reel-scraper` (`username`, `resultsLimit`, `skipPinnedPosts: false`, `includeSharesCount` opcional) para os Reels. Os schemas de entrada e do dataset foram conferidos nos builds atuais dos actors. Views = `videoPlayCount` → `igPlayCount` → `videoViewCount`. Vídeos já conhecidos só têm métricas atualizadas (com snapshot); só os novos entram no processamento.
2. **Mídia**: capa baixada logo após a coleta (permanente, em `data/media/thumbs`) e vídeo em `data/media/videos` (temporário, apagado depois de `N` dias quando transcrição e frames já estão prontos). Se a capa expirar, ela é extraída do vídeo.
3. **Transcrição (ElevenLabs Scribe)**: `POST /v1/speech-to-text`, `model_id=scribe_v2` (o mais recente na documentação), `language_code=pt`, `tag_audio_events`, timestamps por palavra. Antes disso o ffmpeg extrai o áudio (MP3 mono 16 kHz) e mede o volume: vídeo sem trilha ou silencioso **não** vai para a API (economia). Nunca transcreve duas vezes. No modo gratuito, o mesmo passo usa o **Whisper local** (`whisper-cli -l pt --vad`, timestamps por palavra): a detecção de voz faz trilha pura voltar sem texto, em vez do Whisper inventar legenda, e frases típicas de alucinação são descartadas.
4. **Sem fala é o caso principal**: se Scribe devolve pouca fala, ou se a "fala" é letra de música licenciada, o vídeo é marcado como *sem fala* / *só música*. Em todos os casos o ffmpeg extrai **frames-chave** (3 no hook, 0–3 s, mais cortes de cena detectados por `select='gt(scene,0.3)'`, completando com amostragem uniforme; máx. 10) e o Claude lê o texto na tela e a sequência de cenas com visão.
5. **Análise (Claude)**: uma chamada por vídeo com metadados, score já calculado, transcrição com tempos e frames. Saída validada por schema: hook (texto exato na tela/fala + visual dos 3 s + tipo), tema, ângulo, formato, beats com tempo, curiosity gaps, open loops, pattern interrupts, proposta de valor, gatilhos, CTA, moda/calçado (produto, linha, preço, oferta, urgência, sazonalidade), áudio, produção, por que performou, o que replicar, o que não copiar, confiança.
6. **Confiabilidade e custo**: etapas independentes e retomáveis; falha de um vídeo não trava o lote; retry com backoff exponencial (20 s, 80 s, 5 min, 21 min) só para erros temporários (429, 5xx, rede); erros definitivos (chave inválida, perfil privado) falham na hora com mensagem clara. Status de cada etapa aparece na tabela, no detalhe do vídeo e na fila em Configurações.

Modelo do Claude: `claude-opus-5` por padrão, com raciocínio adaptativo e **fallback do lado do servidor habilitado** (`fallbacks: "default"`), que refaz a chamada em outro modelo caso a primeira seja recusada. Esforço `medium` para análise por vídeo e resumo, `high` para roteiros. Troque o modelo com `ANTHROPIC_MODEL`.

---

## Score de outlier (`src/lib/scoring.ts`, testado em `tests/scoring.test.ts`)

- **Linha de base**: mediana das últimas N publicações *maduras* (≥ 48 h) da própria conta, sem fixados, sem parcerias pagas e **sem o próprio vídeo** (leave-one-out). Mediana para que um viral não distorça a base.
- **Score** = `log₂(views ÷ mediana) ÷ σ`, onde σ é a dispersão típica da conta (1,4826 × MAD dos log₂, limitada a [0,5; 1,5]). Assim contas estáveis e voláteis, grandes e pequenas, ficam na mesma régua.
- **Idade**: vídeos com menos de 48 h são projetados pela curva de maturação `1 − e^(−idade/24h)` e nunca caem para "abaixo": ficam "ainda maturando". Nas primeiras 12 h só viram outlier se já forem breakout.
- **Views ocultas**: quando o Instagram não expõe views, usa curtidas + comentários contra a mediana de engajamento da conta, e sinaliza.
- **Faixas**: abaixo (< −0,75), normal, acima (≥ 0,75 e ≥ 1,3×), breakout (≥ 1,75 e ≥ 2×).
- **Sinais secundários**: engajamento por view, comentários por curtida, views por seguidor.
- O detalhe de cada vídeo mostra o cálculo passo a passo com os números.

## Padrões (`src/lib/patterns.ts`, `src/server/insights.ts`)

- Ranking por tipo de hook, formato, tema, CTA (por score e por engajamento), oferta e estrutura de beats, com **n, número de contas, mediana, intervalo de confiança de 90% (bootstrap determinístico)** e nível de evidência: *forte* (n ≥ 12, ≥ 3 contas, IC acima de 0), *moderada*, *fraca*, *anedótica* (n < 5 ou uma conta só).
- Tendências: janela de 3 semanas contra as 3 anteriores (acelerando, ganhando tração, novo, esfriando) e mapa de calor tema × semana.
- Frases de abertura que se repetem nos vídeos de sucesso (n-gramas com preços e números normalizados).
- Lacunas: o que funciona no mercado e a conta própria não faz, e o que quase ninguém explora (marcado como aposta, não como padrão).
- "Padrões que importam": ranqueados por diferença de score × √n × peso da evidência; padrões que descrevem os mesmos vídeos (ex.: hook "viagem" = tema "viagem") são fundidos para não contar a mesma coisa três vezes.
- **Resumo semanal**: gerado pelo Claude a partir das estatísticas agregadas (só pode citar vídeos que existem; IDs são validados), com versão determinística quando não há chave.
- A conta própria entra só nas lacunas e comparações, não na descoberta de padrões do mercado.

## Gerador de roteiros (`src/server/scriptgen.ts`)

Duas etapas, rodando como job na fila com progresso real:

1. **Estratégia**: recebe as estatísticas agregadas e ~40 vídeos citáveis (os melhores, os relevantes para o pedido, os da conta própria e alguns dos piores). Lista oportunidades e escolhe tema, hook, ângulo, formato, estrutura, oferta, CTA e duração, cada decisão com números e IDs de vídeos.
2. **Roteiro**: escreve cena a cena (duração, papel do beat, plano de imagem, texto na tela, fala), hook em texto na tela, áudio sugerido (tipo, nunca "a música X está em alta"), CTA, legenda pronta, hashtags e hooks alternativos. Recebe o ritmo de alguns vídeos de referência só como princípio, nunca como texto a copiar.

Depois: **todos os IDs citados são validados contra o banco** (inválidos são removidos e contados na tela) e um **teste de originalidade** compara trigramas do roteiro com os hooks existentes. Cada evidência abre o vídeo no app.

Controles: dados decidem / por categoria (lançamento, promoção, viagem promocional, sazonal, dia a dia, como usar, prova social) / tema livre; ponto de partida vindo de uma oportunidade ou padrão; tom; duração; produto, preço e oferta; **regenerar**, **gerar alternativa** (evita tema/hook já usados na família), **ajustar tom** (reaproveita a estratégia e reescreve só o texto); histórico com variações agrupadas, favoritos, título editável, copiar roteiro e legenda.

Sem `ANTHROPIC_API_KEY`, o gerador roda em **modo heurístico**: escolhe as mesmas categorias pelos números e monta um esqueleto de cenas com marcadores (`[MODELO]`, `[PREÇO]`), claramente marcado como tal.

---

## Telas

- **Hoje**: KPIs, resumo semanal com padrões ranqueados e "o que fazer", oportunidades com atalho para gerar roteiro, outliers da semana, dispersão de desempenho, status da última coleta por conta.
- **Vídeos**: tabela, galeria e board, com filtros (conta, grupo, faixa, hook, tema, formato, oferta, período, demo), ordenação, busca (`/`) e agrupamento. Clique abre o painel lateral (peek), com transição da capa até o painel; ↑/↓ ou j/k navegam; ⤢ abre a página cheia.
- **Detalhe do vídeo**: propriedades inline (reclassificação do hook), score explicado, hook, linha do tempo de beats, frames, análise completa, transcrição, status do pipeline com "retomar" e "reanalisar", vídeos parecidos.
- **Padrões**: tudo da seção acima, com gráficos e evidências clicáveis.
- **Concorrentes**: conta própria contra a média dos concorrentes, views típicas, frequência, taxa de outliers, mix de formatos, tabela geral e gestão de contas.
- **Roteiros**: gerador e histórico.
- **Configurações**: integrações (com teste), conta própria, agendamento, parâmetros de coleta, contas, fila de processamento (tentar de novo, cancelar, retomar pendentes) e dados de demonstração.

Atalhos: `⌘K` busca e ações, `⌘\` recolhe a barra lateral, `/` busca na tabela, `Esc` fecha o painel. Claro/escuro automáticos; tab bar e sheets no celular; `prefers-reduced-motion` respeitado.

## Automação

- Agenda interna (checa a cada minuto): coleta de todas as contas ativas no intervalo configurado (padrão 24 h, a partir das 7 h), limpeza de vídeos temporários e resumo semanal quando houver análises reais.
- Coleta manual por conta ou geral.
- Notificação no app (e toast) quando surge um breakout novo nos últimos 14 dias.

## Dados de demonstração

Na primeira execução, o banco recebe **158 vídeos sintéticos** distribuídos entre as contas do briefing (@agui.com.br, @notmeshoes, @pinkheelsbr, @somostres.com.br), duas referências (@arezzo, @melissa) e a conta própria (@usehitzz). Os handles são reais; **os vídeos e números são inventados** e aparecem marcados como DEMO em todo lugar. Eles embutem alguns sinais (promoção com preço e urgência funcionam, viagem promocional acelerando, "como usar" pouco explorado pela conta própria) para as telas terem o que mostrar. A primeira coleta real de uma conta apaga os demos dela; em Configurações dá para remover ou restaurar todos.

## Smoke test do pipeline

`npm run smoke` gera um Reel 9:16 com ffmpeg (3 cenas + fala em português com a voz do macOS + trilha), serve por HTTP como se fosse a CDN do Instagram, passa pelo mesmo caminho da coleta (`normalizeReel` → `upsertReels`, incluindo a deduplicação) e roda o job `process_video` pela fila, numa pasta temporária. Confere download, capa, detecção de cortes de cena, frames, transcrição pelo Whisper local, o vídeo terminando "aguardando Claude Code" e o score de outlier. Com `--keep` a pasta fica disponível para testar o `npm run cc`.

---

## Limitações conhecidas

- **Modo gratuito**: a análise depende de você pedir no Claude Code (não roda sozinha na agenda) e consome o limite do seu plano do Claude. A folha de contato reduz isso a uma imagem por vídeo. O Whisper local é um pouco menos preciso que o Scribe em áudio ruidoso.
- **As integrações pagas não foram exercitadas com chaves reais nesta máquina** (não havia `APIFY_TOKEN`, `ELEVENLABS_API_KEY` nem `ANTHROPIC_API_KEY`). Endpoints, parâmetros e schemas foram conferidos na documentação e nos builds atuais dos actors; o código trata erros de autenticação, crédito e limite com mensagens claras. A primeira coleta real é o teste que falta.
- Compartilhamentos só vêm com `includeSharesCount`, recurso pago do actor; está desligado por padrão.
- A curva de maturação é uma aproximação fixa (τ = 24 h). Com snapshots acumulados ao longo de semanas dá para calibrá-la por conta.
- Com 4 concorrentes, muita coisa é estilo de uma marca só. A interface mostra n, contas e intervalo de confiança para não vender correlação fraca como padrão; adicionar referências melhora a base.
- A fila roda dentro do processo do Next: para coleta agendada, o app precisa estar aberto (ou rodando com `npm start` num servidor).
- A detecção de "letra de música" é heurística (áudio licenciado + eventos de música do Scribe); o Claude revisa isso na análise.

## Estrutura

```
src/
  app/            páginas (Hoje, Vídeos, Padrões, Concorrentes, Roteiros, Configurações) e rotas /api
  components/     shell, painel lateral, tabelas, gráficos, gerador de roteiros
  db/             schema Drizzle e conexão (migra no primeiro acesso)
  lib/            score, padrões, taxonomia, schema da análise, formatação (funções puras)
  server/         Apify, ffmpeg, Scribe, Claude, fila, agenda, pipeline, insights, roteiros, seed
drizzle/          migrações SQL
tests/            vitest
scripts/smoke.ts  teste de ponta a ponta do pipeline de mídia
```
