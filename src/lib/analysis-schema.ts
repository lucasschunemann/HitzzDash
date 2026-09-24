import { z } from "zod";
import { HOOK_TYPE_KEYS, FORMAT_KEYS, THEME_KEYS, CTA_KEYS, OFFER_KEYS } from "./taxonomy";

export const BEAT_ROLES = {
  hook: "Hook",
  context: "Contexto",
  product_reveal: "Revelação do produto",
  detail: "Detalhe do produto",
  demo: "Demonstração",
  styling: "Look / combinação",
  offer: "Oferta",
  urgency: "Urgência",
  social_proof: "Prova social",
  story: "História",
  transition: "Transição",
  payoff: "Payoff / virada",
  cta: "CTA",
  other: "Outro",
} as const;
export type BeatRole = keyof typeof BEAT_ROLES;
const BEAT_KEYS = Object.keys(BEAT_ROLES) as [BeatRole, ...BeatRole[]];

export const AnalysisSchema = z.object({
  hook: z.object({
    spokenText: z.string().describe("Fala exata dos primeiros ~3s. Vazio se não houver fala."),
    onScreenText: z.string().describe("Texto exato na tela nos primeiros ~3s. Vazio se não houver."),
    visual: z.string().describe("O que aparece visualmente nos primeiros 3 segundos."),
    type: z.enum(HOOK_TYPE_KEYS),
    secondaryType: z.enum(HOOK_TYPE_KEYS).nullable(),
    rationale: z.string().describe("Por que esse tipo de hook."),
    strength: z.enum(["weak", "ok", "strong"]),
  }),
  theme: z.enum(THEME_KEYS),
  topic: z.string().describe("Tema central em uma frase curta."),
  angle: z.string().describe("Ângulo principal: o recorte que torna o tema interessante."),
  format: z.enum(FORMAT_KEYS),
  onScreenText: z.array(z.object({ t: z.number(), text: z.string() })).describe("Textos na tela identificados nos frames, com tempo aproximado."),
  scenes: z.array(z.object({ t: z.number(), description: z.string() })).describe("Sequência de cenas/planos."),
  beats: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      role: z.enum(BEAT_KEYS),
      description: z.string(),
      spoken: z.string(),
      onScreenText: z.string(),
    }),
  ),
  structureSummary: z.string(),
  curiosityGaps: z.array(z.string()),
  openLoops: z.array(z.string()),
  patternInterrupts: z.array(z.string()),
  valueProposition: z.string(),
  emotionalTriggers: z.array(z.string()),
  cta: z.object({
    type: z.enum(CTA_KEYS),
    text: z.string(),
    placement: z.enum(["start", "middle", "end", "caption_only", "none"]),
  }),
  fashion: z.object({
    featuredProducts: z.array(z.string()),
    productCategory: z.string().describe("tênis, bota, sandália, rasteira, scarpin, mule, mocassim, acessório..."),
    lineOrCollection: z.string().nullable(),
    priceMentioned: z.string().nullable(),
    priceRange: z.enum(["budget", "mid", "premium", "unknown"]).describe("budget < R$150, mid R$150-350, premium > R$350"),
    offerType: z.enum(OFFER_KEYS),
    offerDetails: z.string().nullable(),
    urgency: z.enum(["none", "soft", "strong"]),
    urgencyDetails: z.string().nullable(),
    seasonality: z.string().nullable().describe("Estação, data comemorativa ou evento sazonal, se houver."),
  }),
  audio: z.object({
    kind: z.enum(["speech", "voiceover", "music_only", "trend_audio", "lyrics", "mixed", "silent"]),
    description: z.string(),
  }),
  production: z.object({
    level: z.enum(["lofi", "mid", "high"]),
    people: z.enum(["none", "hands_only", "model", "founder_team", "customer", "influencer"]),
    pacing: z.enum(["slow", "medium", "fast"]),
  }),
  performance: z.object({
    verdict: z.string().describe("Uma frase: por que provavelmente performou como performou."),
    drivers: z.array(z.string()),
    detractors: z.array(z.string()),
    retentionRisk: z.string().describe("Onde o vídeo provavelmente perde gente."),
  }),
  replicable: z.array(z.string()).describe("Princípios replicáveis sem copiar o criador."),
  avoidCopying: z.array(z.string()).describe("Elementos autorais que NÃO devem ser copiados."),
  keywords: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  confidenceReason: z.string(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export const AUDIO_KIND_LABEL: Record<Analysis["audio"]["kind"], string> = {
  speech: "Fala",
  voiceover: "Narração",
  music_only: "Só trilha",
  trend_audio: "Áudio de trend",
  lyrics: "Música com letra",
  mixed: "Fala + trilha",
  silent: "Sem áudio",
};
