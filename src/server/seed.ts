/**
 * Dados de demonstração. Contas reais (os handles do briefing), mas vídeos SINTÉTICOS marcados
 * com isDemo = true. Na primeira coleta real de uma conta, os vídeos demo dela são apagados.
 * Os números embutem alguns padrões (promoção com preço e urgência funcionam, viagem promocional
 * acelerando nas últimas semanas, conteúdo de conforto pouco explorado) para o dashboard ter o que mostrar.
 */
import { db, schema } from "@/db";
import type { Analysis, BeatRole } from "@/lib/analysis-schema";
import type { HookType, Theme, Format, CtaType, OfferType } from "@/lib/taxonomy";
import type { AccountGroup } from "@/db/schema";
import { maturityFraction } from "@/lib/scoring";
import { getSettings } from "./settings";
import type { BatchItem } from "drizzle-orm/batch";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type AccountSeed = {
  handle: string;
  group: AccountGroup;
  fullName: string;
  followers: number;
  medianViews: number;
  posts: number;
  hooks: Partial<Record<HookType, number>>;
  hiddenViews?: boolean;
};

const ACCOUNTS: AccountSeed[] = [
  { handle: "agui.com.br", group: "competitor", fullName: "Agui", followers: 182_000, medianViews: 14_000, posts: 26, hooks: { launch_reveal: 4, price_promo: 4, urgency_scarcity: 3, lookbook_tour: 3, styling_howto: 3, promo_trip_event: 2, pov: 2, trend_audio: 2, behind_scenes: 1, social_proof: 2 } },
  { handle: "notmeshoes", group: "competitor", fullName: "Not Me Shoes", followers: 96_000, medianViews: 8_500, posts: 24, hooks: { launch_reveal: 3, styling_howto: 4, pov: 3, trend_audio: 3, lookbook_tour: 2, price_promo: 2, before_after: 2, humor_skit: 2, promo_trip_event: 2, unboxing: 1 } },
  { handle: "pinkheelsbr", group: "competitor", fullName: "Pink Heels", followers: 240_000, medianViews: 19_000, posts: 28, hooks: { price_promo: 5, urgency_scarcity: 4, launch_reveal: 4, lookbook_tour: 3, social_proof: 3, unboxing: 2, promo_trip_event: 3, provocative_question: 2, store_tour: 2 } },
  { handle: "somostres.com.br", group: "competitor", fullName: "Somos Três", followers: 61_000, medianViews: 5_200, posts: 22, hooks: { behind_scenes: 3, brand_story: 3, launch_reveal: 3, styling_howto: 3, lookbook_tour: 3, product_demo: 2, pov: 2, price_promo: 2, comparison: 1 } },
  { handle: "arezzo", group: "reference", fullName: "Arezzo", followers: 3_100_000, medianViews: 95_000, posts: 20, hooks: { launch_reveal: 5, lookbook_tour: 4, styling_howto: 3, trend_audio: 3, promo_trip_event: 2, social_proof: 1, provocative_question: 2 }, hiddenViews: false },
  { handle: "melissa", group: "reference", fullName: "Melissa", followers: 5_600_000, medianViews: 140_000, posts: 18, hooks: { launch_reveal: 4, trend_audio: 3, pov: 3, product_demo: 2, before_after: 2, lookbook_tour: 2, comparison: 2 } },
  { handle: "usehitzz", group: "own", fullName: "UseHitzz", followers: 38_000, medianViews: 3_600, posts: 20, hooks: { lookbook_tour: 5, behind_scenes: 4, launch_reveal: 4, brand_story: 3, price_promo: 2, trend_audio: 2 } },
];

/** Efeito (em log2) de cada escolha no desempenho: é o "sinal" escondido nos dados demo. */
const HOOK_EFFECT: Partial<Record<HookType, number>> = {
  price_promo: 0.7,
  urgency_scarcity: 0.85,
  styling_howto: 0.55,
  promo_trip_event: 0.2,
  before_after: 0.35,
  pov: 0.25,
  launch_reveal: 0.3,
  behind_scenes: -0.45,
  brand_story: -0.55,
  lookbook_tour: -0.2,
  product_demo: 0.6,
  social_proof: 0.3,
  unboxing: 0.1,
  humor_skit: 0.15,
  trend_audio: 0,
  provocative_question: 0.2,
  comparison: 0.3,
  store_tour: -0.1,
};
const FORMAT_EFFECT: Partial<Record<Format, number>> = { try_on: 0.35, product_broll: 0, text_slideshow: -0.35, talking_head: 0.1, event_vlog: 0.2, tutorial: 0.25, lookbook_montage: -0.1 };
const OFFER_EFFECT: Partial<Record<OfferType, number>> = { price_drop: 0.5, discount_percent: 0.3, free_shipping: 0.35, installments: 0.1, launch: 0.1, none: 0, coupon: 0.15 };

const PRODUCTS = [
  { name: "Tênis Nuvem", cat: "tênis", line: "Linha Nuvem", price: 249 },
  { name: "Bota Serra", cat: "bota", line: "Coleção Inverno Serra", price: 389 },
  { name: "Mule Aurora", cat: "mule", line: "Coleção Aurora", price: 199 },
  { name: "Sandália Brisa", cat: "sandália", line: "Verão Brisa", price: 179 },
  { name: "Mocassim Vale", cat: "mocassim", line: "Linha Vale", price: 229 },
  { name: "Rasteira Sol", cat: "rasteira", line: "Verão Brisa", price: 129 },
  { name: "Scarpin Lume", cat: "scarpin", line: "Coleção Lume", price: 279 },
  { name: "Tênis Trilha", cat: "tênis", line: "Linha Urbana", price: 299 },
];

const HOOK_THEME: Record<HookType, Theme[]> = {
  launch_reveal: ["product_launch", "new_collection"],
  price_promo: ["promotion_sale"],
  urgency_scarcity: ["promotion_sale", "product_launch"],
  promo_trip_event: ["promo_trip_event"],
  styling_howto: ["style_trends"],
  lookbook_tour: ["new_collection", "seasonal"],
  unboxing: ["customer_community", "product_launch"],
  behind_scenes: ["brand_daily"],
  social_proof: ["customer_community"],
  comparison: ["comfort_quality", "style_trends"],
  pov: ["brand_daily", "style_trends", "entertainment"],
  trend_audio: ["entertainment", "style_trends"],
  provocative_question: ["style_trends", "comfort_quality"],
  before_after: ["style_trends"],
  product_demo: ["comfort_quality"],
  brand_story: ["brand_values"],
  giveaway: ["customer_community"],
  humor_skit: ["entertainment"],
  store_tour: ["physical_store"],
  other: ["other"],
};

const HOOK_FORMAT: Record<HookType, Format[]> = {
  launch_reveal: ["product_broll", "try_on"],
  price_promo: ["product_broll", "text_slideshow", "try_on"],
  urgency_scarcity: ["product_broll", "talking_head"],
  promo_trip_event: ["event_vlog"],
  styling_howto: ["tutorial", "try_on", "lookbook_montage"],
  lookbook_tour: ["lookbook_montage", "text_slideshow"],
  unboxing: ["unboxing"],
  behind_scenes: ["talking_head", "product_broll"],
  social_proof: ["ugc_testimonial"],
  comparison: ["try_on", "product_broll"],
  pov: ["skit", "try_on"],
  trend_audio: ["trend_transition"],
  provocative_question: ["talking_head", "text_slideshow"],
  before_after: ["trend_transition", "try_on"],
  product_demo: ["try_on", "product_broll"],
  brand_story: ["talking_head", "text_slideshow"],
  giveaway: ["talking_head"],
  humor_skit: ["skit"],
  store_tour: ["store_walkthrough"],
  other: ["other"],
};

function hookText(h: HookType, p: (typeof PRODUCTS)[number], r: () => number): { screen: string; spoken: string } {
  const promo = Math.round(p.price * (0.6 + r() * 0.2));
  const opts: Record<HookType, string[]> = {
    launch_reveal: [`Chegou: ${p.name}`, `A nova ${p.line} está no ar`, `Lançamento que vocês pediram`],
    price_promo: [`De R$ ${p.price} por R$ ${promo}`, `${p.name} por R$ ${promo}?!`, `Só essa semana: ${Math.round((1 - promo / p.price) * 100)}% off`],
    urgency_scarcity: [`Últimas unidades do ${p.name}`, `Só até domingo`, `Últimos pares no 35 e 36`],
    promo_trip_event: [`Levamos a ${p.line} pra Gramado`, `Nossa viagem de lançamento`, `Bastidores do evento em SP`],
    styling_howto: [`3 jeitos de usar ${p.cat}`, `Como combinar ${p.cat} no trabalho`, `Look do dia com ${p.name}`],
    lookbook_tour: [`Tour pela ${p.line}`, `Lookbook ${p.line}`, `Todos os modelos da coleção`],
    unboxing: [`Abrindo o pedido de vocês`, `Unboxing do ${p.name}`],
    behind_scenes: [`Um dia na nossa fábrica`, `Como nasce um ${p.cat}`, `Bastidores da sessão de fotos`],
    social_proof: [`Olha o que a cliente falou`, `Mais de mil pares vendidos`, `Vocês aprovaram`],
    comparison: [`${p.cat} de R$ 100 vs R$ 300`, `Qual você escolhe?`],
    pov: [`POV: achou o ${p.cat} perfeito`, `POV: seu pé depois de 10h de salto`],
    trend_audio: [`Quando o ${p.name} chega`, `Eu vendo o ${p.name} esgotar`],
    provocative_question: [`Salto confortável existe?`, `Você usa o número certo?`],
    before_after: [`Antes e depois do look`, `Mesmo look, outro calçado`],
    product_demo: [`Testei o ${p.name} por 12 horas`, `Andei 10 km com esse ${p.cat}`, `Teste de conforto real`],
    brand_story: [`Por que começamos em Blumenau`, `Nossa história em 30 segundos`],
    giveaway: [`Sorteio de um par`],
    humor_skit: [`Eu tentando escolher um só`],
    store_tour: [`Vem conhecer a loja`, `Tour pela loja nova`],
    other: [`Novidade`],
  };
  const list = opts[h];
  const screen = list[Math.floor(r() * list.length)];
  return { screen, spoken: "" };
}

const STRUCTURES: Partial<Record<HookType, BeatRole[]>> = {
  price_promo: ["hook", "product_reveal", "offer", "urgency", "cta"],
  urgency_scarcity: ["hook", "product_reveal", "detail", "urgency", "cta"],
  launch_reveal: ["hook", "product_reveal", "detail", "styling", "cta"],
  styling_howto: ["hook", "styling", "styling", "payoff", "cta"],
  promo_trip_event: ["hook", "context", "story", "product_reveal", "cta"],
  product_demo: ["hook", "demo", "detail", "payoff", "cta"],
  lookbook_tour: ["hook", "styling", "transition", "styling", "cta"],
  behind_scenes: ["hook", "story", "detail", "cta"],
  brand_story: ["hook", "story", "story", "cta"],
};

function buildAnalysis(h: HookType, theme: Theme, format: Format, offer: OfferType, cta: CtaType, p: (typeof PRODUCTS)[number], dur: number, ht: { screen: string; spoken: string }, speech: boolean, r: () => number, bandHint: number): Analysis {
  const roles = STRUCTURES[h] ?? (["hook", "product_reveal", "detail", "cta"] as BeatRole[]);
  const step = (dur - 3) / (roles.length - 1);
  const beats = roles.map((role, i) => {
    const start = i === 0 ? 0 : 3 + (i - 1) * step;
    const end = i === 0 ? 3 : Math.min(dur, 3 + i * step);
    const desc: Record<string, string> = {
      hook: `Abertura com "${ht.screen}" em texto grande sobre o calçado em movimento.`,
      product_reveal: `${p.name} aparece em close, girando.`,
      detail: "Close no solado e no acabamento.",
      offer: `Cartela com a oferta e o preço.`,
      urgency: "Texto reforçando prazo/estoque.",
      styling: "Troca de looks com o mesmo calçado.",
      payoff: "Look completo revelado.",
      context: "Contexto do lugar/evento.",
      story: "Bastidor com a equipe.",
      demo: "Caminhada longa mostrando conforto.",
      transition: "Transição no movimento do pé.",
      cta: `Chamada final: ${cta === "whatsapp" ? "WhatsApp" : cta === "visit_store" ? "visite a loja" : "link na bio"}.`,
    };
    return { start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10, role, description: desc[role] ?? role, spoken: "", onScreenText: i === 0 ? ht.screen : role === "cta" ? "Link na bio" : "" };
  });
  const good = bandHint > 0.5;
  return {
    hook: { spokenText: ht.spoken, onScreenText: ht.screen, visual: `${p.name} em close com movimento rápido de câmera.`, type: h, secondaryType: null, rationale: "Classificação de demonstração.", strength: good ? "strong" : bandHint < -0.5 ? "weak" : "ok" },
    theme,
    topic: `${p.name} (${p.line})`,
    angle: offer !== "none" ? `Oferta clara logo na abertura (${offer}).` : `Produto como protagonista, sem oferta.`,
    format,
    onScreenText: beats.filter((b) => b.onScreenText).map((b) => ({ t: b.start, text: b.onScreenText })),
    scenes: beats.map((b) => ({ t: b.start, description: b.description })),
    beats,
    structureSummary: roles.join(" → "),
    curiosityGaps: h === "price_promo" || h === "provocative_question" ? ["Preço/resposta só revelado no meio do vídeo"] : [],
    openLoops: h === "product_demo" ? ["Será que aguenta o dia todo?"] : [],
    patternInterrupts: format === "trend_transition" ? ["Transição no beat"] : ["Corte rápido a cada ~2s"],
    valueProposition: offer !== "none" ? "Calçado de qualidade com preço acessível" : "Design e conforto",
    emotionalTriggers: h === "urgency_scarcity" ? ["medo de perder", "exclusividade"] : good ? ["desejo", "identificação"] : ["curiosidade"],
    cta: { type: cta, text: cta === "whatsapp" ? "Chama no WhatsApp" : cta === "visit_store" ? "Vem na loja" : cta === "none" ? "" : "Link na bio", placement: cta === "none" ? "none" : "end" },
    fashion: {
      featuredProducts: [p.name],
      productCategory: p.cat,
      lineOrCollection: p.line,
      priceMentioned: offer === "price_drop" || h === "price_promo" ? `R$ ${p.price}` : null,
      priceRange: p.price < 150 ? "budget" : p.price > 350 ? "premium" : "mid",
      offerType: offer,
      offerDetails: offer === "none" ? null : offer === "free_shipping" ? "Frete grátis para todo o Brasil" : offer === "installments" ? "6x sem juros" : `R$ ${p.price}`,
      urgency: h === "urgency_scarcity" ? "strong" : offer !== "none" ? "soft" : "none",
      urgencyDetails: h === "urgency_scarcity" ? "Últimas unidades" : null,
      seasonality: theme === "seasonal" ? "Inverno" : null,
    },
    audio: { kind: speech ? "mixed" : format === "trend_transition" ? "trend_audio" : "music_only", description: speech ? "Fala + trilha" : "Trilha instrumental" },
    production: { level: r() > 0.6 ? "high" : "mid", people: format === "try_on" ? "model" : format === "talking_head" ? "founder_team" : "hands_only", pacing: good ? "fast" : "medium" },
    performance: {
      verdict: good ? "Hook claro e oferta concreta nos primeiros segundos seguraram a atenção." : bandHint < -0.5 ? "Abertura lenta e sem promessa clara; pouco motivo para ficar." : "Desempenho dentro do esperado para a conta.",
      drivers: good ? ["Hook visual forte", "Oferta explícita"] : [],
      detractors: bandHint < -0.5 ? ["Primeiros 3s sem gancho"] : [],
      retentionRisk: "Transição do hook para o produto.",
    },
    replicable: ["Texto na tela grande nos 3 primeiros segundos", "Produto em movimento desde o primeiro frame", offer !== "none" ? "Oferta visível antes do meio do vídeo" : "Detalhe de acabamento em close"],
    avoidCopying: ["Textos e trilha exatos do criador"],
    keywords: [p.cat, p.line],
    confidence: speech ? "high" : r() > 0.4 ? "medium" : "low",
    confidenceReason: speech ? "Fala transcrita e frames suficientes." : "Sem fala; análise baseada em texto na tela e cenas.",
  };
}

function pickWeighted<T extends string>(w: Partial<Record<T, number>>, r: () => number): T {
  const entries = Object.entries(w) as [T, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let x = r() * total;
  for (const [k, v] of entries) {
    x -= v;
    if (x <= 0) return k;
  }
  return entries[0][0];
}

export async function seedDemo(now = Date.now()) {
  const r = rng(20260923);
  const own = (await getSettings()).ownHandle;
  const H = 3_600_000;
  // Tudo em lotes (db.batch): no Turso cada comando avulso seria uma ida e volta de rede.
  {
    const tx = db;
    for (const a of ACCOUNTS) {
      const handle = a.group === "own" ? own : a.handle;
      const existing = (await tx.select().from(schema.accounts).all()).find((x) => x.handle === handle);
      const acc =
        existing ??
        await tx
          .insert(schema.accounts)
          .values({ handle, group: a.group, fullName: a.fullName, followers: a.followers, isDemo: true, createdAt: now, active: true })
          .returning()
          .get();
      if (existing && !existing.isDemo) continue; // conta já tem dados reais
      const ops: BatchItem<"sqlite">[] = [];
      ops.push(tx.insert(schema.accountSnapshots).values({ accountId: acc.id, followers: a.followers, capturedAt: now }));
      for (let i = 0; i < a.posts; i++) {
        const ageDays = 0.3 + i * (70 / a.posts) + r() * 1.5;
        const publishedAt = Math.round(now - ageDays * 24 * H);
        const hook = pickWeighted(a.hooks, r);
        const recent = ageDays < 21;
        // Viagem promocional acelera nas últimas 3 semanas (tema "novo" no mercado).
        let h: HookType = hook;
        if (recent && a.group !== "own" && r() < 0.18) h = "promo_trip_event";
        const theme = HOOK_THEME[h][Math.floor(r() * HOOK_THEME[h].length)];
        const fmts = HOOK_FORMAT[h];
        const format = fmts[Math.floor(r() * fmts.length)];
        const offer: OfferType =
          h === "price_promo" ? (["price_drop", "discount_percent", "installments"] as const)[Math.floor(r() * 3)] : h === "urgency_scarcity" ? (r() < 0.5 ? "free_shipping" : "price_drop") : h === "launch_reveal" ? (r() < 0.6 ? "launch" : "installments") : r() < 0.15 ? "free_shipping" : "none";
        const cta: CtaType = offer !== "none" ? (r() < 0.55 ? "link_bio" : "whatsapp") : r() < 0.2 ? "comment" : r() < 0.5 ? "none" : r() < 0.7 ? "visit_store" : "link_bio";
        const p = PRODUCTS[Math.floor(r() * PRODUCTS.length)];
        const dur = Math.round((8 + r() * 22) * 10) / 10;
        const effect =
          (HOOK_EFFECT[h] ?? 0) + (FORMAT_EFFECT[format] ?? 0) + (OFFER_EFFECT[offer] ?? 0) + (h === "promo_trip_event" && recent ? 1.1 : 0) + (cta === "whatsapp" ? 0.15 : 0);
        const noise = (r() + r() + r() - 1.5) * 1.6;
        const log2v = Math.log2(a.medianViews) + effect - 0.35 + noise;
        const ageH = ageDays * 24;
        const matured = Math.round(Math.pow(2, log2v));
        const views = Math.max(120, Math.round(matured * (ageH < 48 ? maturityFraction(ageH) : 1)));
        const likes = Math.round(views * (0.03 + r() * 0.04));
        const comments = Math.round(likes * (0.015 + r() * 0.05) * (cta === "comment" ? 2.5 : 1));
        const isPinned = i === a.posts - 3;
        const isSponsored = a.group === "reference" && i === 5;
        const id = `demo_${handle.replace(/\W/g, "")}_${i}`;
        const ht = hookText(h, p, r);
        const speech = format === "talking_head" || format === "ugc_testimonial" || (format === "tutorial" && r() < 0.5);
        if (speech) ht.spoken = ht.screen;
        const bandHint = effect + noise - 0.35;
        const tags = ["calcados", p.cat.replace(/\s/g, ""), "moda", theme === "promotion_sale" ? "promocao" : "lancamento"];
        ops.push(tx.insert(schema.videos)
          .values({
            id,
            shortCode: null,
            accountId: acc.id,
            url: `https://www.instagram.com/${handle}/reels/`,
            caption: `${ht.screen} ✨\n\n${p.name} da ${p.line}. ${offer !== "none" ? "Aproveite enquanto durar." : "Disponível no site e nas lojas."}\n\n${tags.map((t) => "#" + t).join(" ")}`,
            hashtags: tags,
            mentions: [],
            publishedAt,
            durationSec: dur,
            views: isPinned ? views * 6 : a.hiddenViews ? null : views,
            likes,
            comments,
            shares: null,
            followersAtCapture: a.followers,
            isPinned,
            isSponsored,
            music: format === "trend_transition" ? { song: "Áudio em alta (demo)", artist: null, usesOriginalAudio: false } : { song: null, artist: null, usesOriginalAudio: true },
            thumbnailPath: null,
            isDemo: true,
            firstSeenAt: now,
            metricsUpdatedAt: now,
          }));
        ops.push(tx.insert(schema.processing).values({ videoId: id, media: "done", transcript: "done", frames: "done", analysis: "done", updatedAt: now }));
        ops.push(tx.insert(schema.transcripts)
          .values({ videoId: id, text: speech ? `${ht.screen}. Vem ver ${p.name}, da ${p.line}.` : "", hasSpeech: speech, speechKind: speech ? "speech" : "none", model: "demo", createdAt: now }));
        const an = buildAnalysis(h, theme, format, offer, cta, p, dur, ht, speech, r, bandHint);
        ops.push(tx.insert(schema.analyses)
          .values({ videoId: id, data: an, hookType: h, theme, format, ctaType: cta, offerType: offer, confidence: an.confidence, inputMode: speech ? "speech" : "visual", model: "demo", createdAt: now }));
      }
      await db.batch(ops as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
    }
    await tx.insert(schema.notifications)
      .values({ kind: "info", title: "Dados de demonstração carregados", body: "Os vídeos marcados como DEMO são sintéticos. Configure as chaves e colete para ver dados reais.", createdAt: now })
      .run();
  }
}

export async function seedIfEmpty() {
  const any = await db.select({ id: schema.accounts.id }).from(schema.accounts).limit(1).get();
  if (any) return false;
  await seedDemo();
  console.log("[hitzz] banco vazio: dados de demonstração carregados");
  return true;
}
