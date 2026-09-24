/**
 * Formato COMPACTO da análise, usado no modo Claude Code para gastar poucos tokens de saída.
 * O modelo escreve só o essencial (tuplas, chaves curtas); o que é derivável — cenas, textos na tela,
 * resumo da estrutura — é gerado aqui a partir dos beats. `expandCompact` devolve o formato completo
 * (`Analysis`) que o dashboard e as estatísticas usam, validado pelo mesmo schema do modo API.
 */
import { z } from "zod";
import { AnalysisSchema, BEAT_ROLES, type Analysis, type BeatRole } from "./analysis-schema";
import { HOOK_TYPE_KEYS, FORMAT_KEYS, THEME_KEYS, CTA_KEYS, OFFER_KEYS } from "./taxonomy";

const BEAT_KEYS = Object.keys(BEAT_ROLES) as [BeatRole, ...BeatRole[]];
const str = z.string();
const strs = z.array(z.string()).default([]);

export const CompactSchema = z.object({
  id: str,
  /** hook: [texto na tela, fala, visual dos 3 s, tipo, tipo secundário|null, força] */
  h: z.tuple([str, str, str, z.enum(HOOK_TYPE_KEYS), z.enum(HOOK_TYPE_KEYS).nullable(), z.enum(["weak", "ok", "strong"])]),
  tema: z.enum(THEME_KEYS),
  assunto: str,
  angulo: str,
  formato: z.enum(FORMAT_KEYS),
  /** beats: [início s, fim s, papel, descrição curta, texto na tela, fala] */
  beats: z.array(z.tuple([z.number(), z.number(), z.enum(BEAT_KEYS), str, str, str])).min(1),
  /** mecânicas: curiosity gaps, open loops, pattern interrupts */
  gap: strs,
  loop: strs,
  quebra: strs,
  valor: str,
  gatilhos: strs,
  /** cta: [tipo, texto, posição] */
  cta: z.tuple([z.enum(CTA_KEYS), str, z.enum(["start", "middle", "end", "caption_only", "none"])]),
  /** moda: [produtos, categoria, linha|null, preço citado|null, faixa, oferta, detalhe da oferta|null, urgência, detalhe|null, sazonalidade|null] */
  moda: z.tuple([
    z.array(str),
    str,
    str.nullable(),
    str.nullable(),
    z.enum(["budget", "mid", "premium", "unknown"]),
    z.enum(OFFER_KEYS),
    str.nullable(),
    z.enum(["none", "soft", "strong"]),
    str.nullable(),
    str.nullable(),
  ]),
  /** áudio: [tipo, descrição curta] */
  audio: z.tuple([z.enum(["speech", "voiceover", "music_only", "trend_audio", "lyrics", "mixed", "silent"]), str]),
  /** produção: [nível, pessoas, ritmo] */
  prod: z.tuple([z.enum(["lofi", "mid", "high"]), z.enum(["none", "hands_only", "model", "founder_team", "customer", "influencer"]), z.enum(["slow", "medium", "fast"])]),
  /** performance: [veredito, ajudou[], atrapalhou[], risco de retenção] */
  perf: z.tuple([str, z.array(str), z.array(str), str]),
  rep: strs,
  /** confiança: [nível, motivo curto] */
  conf: z.tuple([z.enum(["low", "medium", "high"]), str]),
});
export type CompactAnalysis = z.infer<typeof CompactSchema>;

export function expandCompact(c: CompactAnalysis): Analysis {
  const beats = c.beats.map(([start, end, role, description, onScreenText, spoken]) => ({ start, end, role, description, onScreenText, spoken }));
  const [produtos, cat, linha, preco, faixa, oferta, ofertaTxt, urg, urgTxt, saz] = c.moda;
  const full: Analysis = {
    hook: { onScreenText: c.h[0], spokenText: c.h[1], visual: c.h[2], type: c.h[3], secondaryType: c.h[4], rationale: "", strength: c.h[5] },
    theme: c.tema,
    topic: c.assunto,
    angle: c.angulo,
    format: c.formato,
    // derivados dos beats (antes o modelo repetia essas informações)
    onScreenText: beats.filter((b) => b.onScreenText).map((b) => ({ t: b.start, text: b.onScreenText })),
    scenes: beats.map((b) => ({ t: b.start, description: b.description })),
    beats,
    structureSummary: beats.map((b) => BEAT_ROLES[b.role]).filter((r, i, a) => a[i - 1] !== r).join(" → "),
    curiosityGaps: c.gap,
    openLoops: c.loop,
    patternInterrupts: c.quebra,
    valueProposition: c.valor,
    emotionalTriggers: c.gatilhos,
    cta: { type: c.cta[0], text: c.cta[1], placement: c.cta[2] },
    fashion: {
      featuredProducts: produtos,
      productCategory: cat,
      lineOrCollection: linha,
      priceMentioned: preco,
      priceRange: faixa,
      offerType: oferta,
      offerDetails: ofertaTxt,
      urgency: urg,
      urgencyDetails: urgTxt,
      seasonality: saz,
    },
    audio: { kind: c.audio[0], description: c.audio[1] },
    production: { level: c.prod[0], people: c.prod[1], pacing: c.prod[2] },
    performance: { verdict: c.perf[0], drivers: c.perf[1], detractors: c.perf[2], retentionRisk: c.perf[3] },
    replicable: c.rep,
    avoidCopying: [],
    keywords: [],
    confidence: c.conf[0],
    confidenceReason: c.conf[1],
  };
  return AnalysisSchema.parse(full);
}

/** Guia curto (o que o analista precisa saber), impresso uma única vez por lote. */
export const COMPACT_GUIDE = `FORMATO: um objeto JSON por linha (JSONL), sem comentários, nesta ordem de campos:
{"id":"<id>","h":["texto tela 0-3s exato","fala 0-3s exata ou \\"\\"","visual 0-3s","<hook>",<hook2|null>,"weak|ok|strong"],"tema":"<tema>","assunto":"frase curta","angulo":"frase curta","formato":"<formato>","beats":[[0,3,"hook","o que acontece","texto tela","fala"],...],"gap":[],"loop":[],"quebra":[],"valor":"proposta de valor","gatilhos":["..."],"cta":["<cta>","texto","start|middle|end|caption_only|none"],"moda":[["produto"],"categoria",linha|null,preço|null,"budget|mid|premium|unknown","<oferta>",detalhe|null,"none|soft|strong",detalhe|null,sazonal|null],"audio":["speech|voiceover|music_only|trend_audio|lyrics|mixed|silent","curto"],"prod":["lofi|mid|high","none|hands_only|model|founder_team|customer|influencer","slow|medium|fast"],"perf":["veredito 1 frase",["ajudou"],["atrapalhou"],"risco de retenção"],"rep":["princípio replicável"],"conf":["low|medium|high","motivo curto"]}

REGRAS: frases curtas (≤15 palavras). 3-6 beats. Listas com 0-2 itens. Sem fala é normal: use texto na tela/cenas/legenda, nunca invente fala. Letra de música não é fala. Preço/oferta/prazo só se aparecem. perf coerente com o score: se "maturing" ou base<5, diga que é cedo e não invente causa. conf "low" se não há fala nem texto legível.

hook: launch_reveal(novidade) price_promo(preço/de-por) urgency_scarcity(últimas/prazo) promo_trip_event(viagem/evento) styling_howto(como usar) lookbook_tour(vários modelos) unboxing behind_scenes social_proof(cliente/vendas) comparison pov trend_audio provocative_question before_after product_demo(teste/conforto) brand_story giveaway humor_skit store_tour other
tema: new_collection product_launch promotion_sale promo_trip_event seasonal brand_daily comfort_quality style_trends customer_community physical_store brand_values entertainment other
formato: product_broll try_on talking_head lookbook_montage tutorial skit ugc_testimonial event_vlog text_slideshow trend_transition unboxing store_walkthrough other
beat: hook context product_reveal detail demo styling offer urgency social_proof story transition payoff cta other
cta: whatsapp link_bio visit_store site_coupon comment dm follow save_share tag_friend none other
oferta: discount_percent price_drop free_shipping installments bundle coupon launch giveaway none`;
