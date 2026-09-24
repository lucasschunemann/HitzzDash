import fs from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { AnalysisSchema, type Analysis } from "@/lib/analysis-schema";
import { HOOK_TYPES, FORMATS, THEMES, CTA_TYPES, OFFER_TYPES } from "@/lib/taxonomy";
import { mediaAbs } from "@/lib/paths";
import type { FrameRef, TranscriptWord, MusicInfo } from "@/db/schema";
import { structured } from "./llm";

const list = (o: Record<string, string | { label: string; hint: string }>) =>
  Object.entries(o)
    .map(([k, v]) => (typeof v === "string" ? `- ${k}: ${v}` : `- ${k}: ${v.label} (${v.hint})`))
    .join("\n");

export const ANALYSIS_SYSTEM = `Você é analista sênior de conteúdo para Instagram Reels no mercado de calçados e moda brasileiro.
Trabalha para a UseHitzz, marca de calçados de Blumenau (SC), estudando concorrentes e referências para descobrir o que funciona.

Você recebe, para UM Reel: metadados (legenda, hashtags, áudio, duração, métricas e o score de outlier já calculado),
a transcrição com tempos (quando houver fala) e frames-chave com o tempo de cada um.

Regras:
- Reels de calçado muitas vezes NÃO têm fala. Isso é normal. Quando não houver fala, analise pelo texto na tela
  (leia o que está escrito nos frames), pela sequência de cenas e pela legenda. Nunca invente fala.
- Letra de música transcrita não é fala do criador; trate como trilha.
- O hook são os primeiros ~3 segundos: copie o texto exato (falado e/ou na tela) e descreva o visual.
- Beats: marque início e fim em segundos, coerentes com a duração e com os tempos dos frames. Use papéis do enum.
- Seja específico ao nicho: produto, linha/coleção, preço, tipo de oferta (desconto, frete grátis, parcelamento, prazo),
  urgência/escassez e sazonalidade. Só registre preço/oferta que aparecem de fato (fala, tela ou legenda).
- "performance" deve ser coerente com o score informado: explique por que provavelmente foi bem ou mal, sem exagero.
  Se o vídeo ainda está maturando ou a linha de base é pequena, diga isso.
- "replicable": princípios que a UseHitzz pode aplicar sem copiar (estrutura, ritmo, tipo de promessa), nunca "refazer este vídeo".
- confidence: "low" quando faltar fala E houver poucos frames ou texto; "low" também quando só houver legenda e capa.
  "high" só com fala/texto claros e frames suficientes.
- Escreva tudo em português do Brasil, frases curtas.

Taxonomia de hook (escolha o que melhor descreve a ABERTURA):
${list(HOOK_TYPES)}

Formatos:
${list(FORMATS)}

Temas:
${list(THEMES)}

CTA:
${list(CTA_TYPES)}

Tipos de oferta:
${list(OFFER_TYPES)}`;

export type AnalysisInput = {
  handle: string;
  caption: string | null;
  hashtags: string[];
  durationSec: number | null;
  publishedAt: number;
  music: MusicInfo | null;
  metrics: { views: number | null; likes: number | null; comments: number | null; shares: number | null; followers: number | null };
  score: { band: string | null; ratio: number | null; score: number | null; maturing: boolean; basis: string; baselineN: number } | null;
  transcript: { text: string; words: TranscriptWord[] | null; speechKind: string } | null;
  frames: FrameRef[];
  thumbnailPath: string | null;
};

function segments(words: TranscriptWord[]) {
  const out: string[] = [];
  let cur: TranscriptWord[] = [];
  for (const w of words.filter((w) => w.type === "word")) {
    cur.push(w);
    if (/[.!?]$/.test(w.text) || cur.length >= 12) {
      out.push(`[${cur[0].start.toFixed(1)}s] ${cur.map((x) => x.text).join(" ")}`);
      cur = [];
    }
  }
  if (cur.length) out.push(`[${cur[0].start.toFixed(1)}s] ${cur.map((x) => x.text).join(" ")}`);
  return out.join("\n");
}

function img(rel: string): Anthropic.Beta.Messages.BetaImageBlockParam | null {
  try {
    const data = fs.readFileSync(mediaAbs(rel)).toString("base64");
    const media_type = rel.endsWith(".png") ? "image/png" : rel.endsWith(".svg") ? null : "image/jpeg";
    if (!media_type) return null;
    return { type: "image", source: { type: "base64", media_type, data } };
  } catch {
    return null;
  }
}

export function inputModeOf(i: AnalysisInput): "speech" | "visual" | "caption_only" {
  if (i.transcript?.speechKind === "speech") return "speech";
  if (i.frames.length) return "visual";
  return "caption_only";
}

export async function analyzeVideo(i: AnalysisInput): Promise<{ data: Analysis; model: string; inputMode: string }> {
  const mode = inputModeOf(i);
  const meta = {
    conta: `@${i.handle}`,
    publicado_em: new Date(i.publishedAt).toISOString(),
    duracao_s: i.durationSec,
    legenda: i.caption ?? "",
    hashtags: i.hashtags,
    audio: i.music
      ? { musica: i.music.song ?? null, artista: i.music.artist ?? null, audio_original: i.music.usesOriginalAudio ?? null }
      : null,
    metricas: i.metrics,
    score_outlier: i.score
      ? {
          faixa: i.score.band,
          razao_vs_mediana: i.score.ratio ? Number(i.score.ratio.toFixed(2)) : null,
          score_normalizado: i.score.score ? Number(i.score.score.toFixed(2)) : null,
          ainda_maturando: i.score.maturing,
          base: i.score.basis,
          tamanho_linha_de_base: i.score.baselineN,
        }
      : null,
    modo_de_entrada:
      mode === "speech"
        ? "fala transcrita + frames + legenda"
        : mode === "visual"
          ? "SEM FALA: use texto na tela, sequência de cenas e legenda"
          : "SEM VÍDEO: só legenda e capa (confiança baixa)",
  };

  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    { type: "text", text: `Metadados do Reel:\n${JSON.stringify(meta, null, 2)}` },
  ];
  if (i.transcript) {
    const t =
      i.transcript.speechKind === "speech"
        ? `Transcrição (ElevenLabs Scribe), com tempo de início de cada trecho:\n${i.transcript.words ? segments(i.transcript.words) : i.transcript.text}`
        : i.transcript.speechKind === "lyrics"
          ? `O áudio parece ser música com letra (não é fala do criador). Letra detectada: "${i.transcript.text.slice(0, 400)}"`
          : "Transcrição: sem fala detectada (só trilha/efeitos).";
    content.push({ type: "text", text: t });
  } else {
    content.push({ type: "text", text: "Transcrição indisponível para este vídeo." });
  }
  const frames = i.frames.length ? i.frames : i.thumbnailPath ? [{ path: i.thumbnailPath, t: 0 }] : [];
  for (const f of frames) {
    const b = img(f.path);
    if (!b) continue;
    content.push({ type: "text", text: i.frames.length ? `Frame em t=${f.t.toFixed(1)}s:` : "Capa do Reel:" });
    content.push(b);
  }
  content.push({ type: "text", text: "Analise este Reel e responda no schema." });

  const res = await structured({ system: ANALYSIS_SYSTEM, content, schema: AnalysisSchema, effort: "medium", maxTokens: 24000 });
  const data = res.data;
  if (mode === "caption_only") data.confidence = "low";
  return { data, model: res.model, inputMode: mode };
}
