/**
 * Gerador de roteiros. Fluxo em duas etapas:
 *   1. Estratégia: lê o dataset (padrões agregados + vídeos citáveis), lista oportunidades e escolhe
 *      tema, hook, ângulo, formato e estrutura, justificando cada decisão com IDs de vídeos.
 *   2. Roteiro: escreve o Reel cena a cena a partir do plano.
 * Toda evidência citada é validada contra o banco; IDs inexistentes são removidos e registrados.
 */
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Analysis } from "@/lib/analysis-schema";
import { BEAT_ROLES } from "@/lib/analysis-schema";
import {
  THEME_KEYS,
  HOOK_TYPE_KEYS,
  FORMAT_KEYS,
  CTA_KEYS,
  OFFER_KEYS,
  SCRIPT_CATEGORIES,
  TONES,
  HOOK_TYPES,
  THEMES,
  FORMATS,
  type ScriptCategory,
  type Tone,
  hookLabel,
  themeLabel,
  formatLabel,
  ctaLabel,
  offerLabel,
} from "@/lib/taxonomy";
import { structureSignature } from "@/lib/patterns";
import { originality } from "@/lib/originality";
export { originality };
import { getInsights, labelFor, type Insights } from "./insights";
import { loadVideos, type VideoRow } from "./data";
import { compactInsights } from "./digest";
import { structured } from "./llm";
import { hasKey, analyzerMode } from "./env";
import { bump } from "./events";
import { getSettings } from "./settings";

const BEAT_KEYS = Object.keys(BEAT_ROLES) as [keyof typeof BEAT_ROLES, ...(keyof typeof BEAT_ROLES)[]];

export const PlanSchema = z.object({
  datasetReading: z.string().describe("O que os dados dizem agora, em 2-3 frases com números."),
  opportunities: z.array(z.object({ title: z.string(), rationale: z.string(), evidenceIds: z.array(z.string()) })),
  chosen: z.object({
    theme: z.enum(THEME_KEYS),
    topic: z.string(),
    hookType: z.enum(HOOK_TYPE_KEYS),
    hookIdea: z.string(),
    angle: z.string(),
    format: z.enum(FORMAT_KEYS),
    structure: z.array(z.enum(BEAT_KEYS)),
    offerType: z.enum(OFFER_KEYS),
    ctaType: z.enum(CTA_KEYS),
    durationSec: z.number(),
  }),
  decisions: z.array(
    z.object({
      decision: z.enum(["tema", "hook", "ângulo", "formato", "estrutura", "oferta", "cta", "duração", "áudio"]),
      choice: z.string(),
      why: z.string(),
      stats: z.string().describe("Números do dataset que sustentam a escolha."),
      evidenceIds: z.array(z.string()),
    }),
  ),
  expected: z.object({
    rationale: z.string(),
    confidence: z.enum(["baixa", "média", "alta"]),
    risks: z.array(z.string()),
  }),
});
export type Plan = z.infer<typeof PlanSchema>;

export const ScriptSchema = z.object({
  title: z.string(),
  onScreenHook: z.string().describe("Texto na tela nos 3 primeiros segundos."),
  spokenHook: z.string().describe("Primeira fala. Vazio se o vídeo não tiver fala."),
  totalDurationSec: z.number(),
  audio: z.object({
    type: z.enum(["speech", "voiceover", "music", "trend_format", "speech_plus_music"]),
    direction: z.string().describe("Tipo de áudio sugerido, sem afirmar que um áudio específico está em alta."),
  }),
  scenes: z.array(
    z.object({
      durationSec: z.number(),
      role: z.enum(BEAT_KEYS),
      shot: z.string().describe("Plano de imagem sugerido."),
      onScreenText: z.string(),
      speech: z.string(),
      notes: z.string(),
    }),
  ),
  cta: z.object({ type: z.enum(CTA_KEYS), text: z.string() }),
  caption: z.string(),
  hashtags: z.array(z.string()),
  altHooks: z.array(z.string()),
  productionNotes: z.array(z.string()),
});
export type Script = z.infer<typeof ScriptSchema>;

export type ScriptInput = {
  mode: "auto" | "theme" | "category";
  theme?: string;
  category?: ScriptCategory;
  tone: Tone;
  notes?: string;
  durationSec?: number | null;
  /** Ponto de partida vindo de uma oportunidade/padrão clicado. */
  seedTheme?: string;
  seedHook?: string;
  avoid?: { theme?: string; hookType?: string; topic?: string }[];
};

export type EvidenceItem = { videoId: string; handle: string; ratio: number | null; score: number | null; views: number | null; hookText: string | null; used: string[] };

const CATEGORY_HINT: Record<ScriptCategory, string> = {
  auto: "Escolha a melhor oportunidade que os dados indicam.",
  launch: "Lançamento de produto ou linha nova (tema product_launch/new_collection).",
  promotion: "Promoção (tema promotion_sale). Deixe clara a oferta.",
  promo_trip: "Viagem ou evento promocional (tema promo_trip_event).",
  seasonal: "Coleção sazonal ou data comemorativa (tema seasonal).",
  brand_daily: "Dia a dia da marca, bastidores (tema brand_daily).",
  styling: "Como usar/combinar os calçados (tema style_trends, hook styling_howto).",
  social_proof: "Prova social, clientes (tema customer_community).",
};

const CATEGORY_SEED: Record<ScriptCategory, { theme?: string; hookType?: string }> = {
  auto: {},
  launch: { theme: "product_launch", hookType: "launch_reveal" },
  promotion: { theme: "promotion_sale", hookType: "price_promo" },
  promo_trip: { theme: "promo_trip_event", hookType: "promo_trip_event" },
  seasonal: { theme: "seasonal" },
  brand_daily: { theme: "brand_daily", hookType: "behind_scenes" },
  styling: { theme: "style_trends", hookType: "styling_howto" },
  social_proof: { theme: "customer_community", hookType: "social_proof" },
};

export function citable(v: VideoRow, an?: Analysis) {
  return {
    id: v.id,
    conta: `@${v.handle}`,
    grupo: v.group,
    publicado: new Date(v.publishedAt).toISOString().slice(0, 10),
    duracao_s: v.durationSec,
    views: v.views,
    razao_vs_mediana: v.score?.ratio ? Number(v.score.ratio.toFixed(2)) : null,
    score: v.score?.score != null ? Number(v.score.score.toFixed(2)) : null,
    faixa: v.score?.band,
    hook_tipo: v.hookType,
    hook_texto: v.hookText,
    tema: v.theme,
    assunto: v.topic,
    formato: v.format,
    oferta: v.offerType,
    oferta_detalhe: an?.fashion.offerDetails ?? null,
    cta: an ? `${an.cta.type}: ${an.cta.text}` : v.ctaType,
    estrutura: v.beatRoles.length ? structureSignature(v.beatRoles) : null,
    audio: an?.audio.kind ?? null,
    replicavel: an?.replicable?.slice(0, 3) ?? [],
    confianca: v.confidence,
  };
}

export function pickVideos(rows: VideoRow[], input: ScriptInput) {
  const analyzed = rows.filter((r) => r.hookType && r.score?.score != null && !r.isPinned);
  const market = analyzed.filter((r) => r.group !== "own");
  const byScore = [...market].sort((a, b) => (b.score!.score as number) - (a.score!.score as number));
  const seed = { ...(input.category ? CATEGORY_SEED[input.category] : {}), ...(input.seedTheme ? { theme: input.seedTheme } : {}), ...(input.seedHook ? { hookType: input.seedHook } : {}) };
  const relevant = byScore.filter((r) => (seed.theme && r.theme === seed.theme) || (seed.hookType && r.hookType === seed.hookType));
  const own = analyzed.filter((r) => r.group === "own").sort((a, b) => (b.score!.score as number) - (a.score!.score as number));
  const picked = new Map<string, VideoRow>();
  for (const r of [...byScore.slice(0, 30), ...relevant.slice(0, 15), ...own.slice(0, 5), ...byScore.slice(-6), ...own.slice(-3)]) picked.set(r.id, r);
  return [...picked.values()];
}

export async function analysesFor(ids: string[]) {
  const m = new Map<string, Analysis>();
  for (const id of ids) {
    const a = await db.select().from(schema.analyses).where(eq(schema.analyses.videoId, id)).get();
    if (a) m.set(id, a.data as Analysis);
  }
  return m;
}

export async function requestText(input: ScriptInput) {
  const s = await getSettings();
  return [
    `Marca: UseHitzz (@${s.ownHandle}), calçados, Blumenau/SC.`,
    input.mode === "theme" && input.theme ? `Tema pedido pela equipe: "${input.theme}".` : "",
    input.mode === "category" && input.category ? `Categoria pedida: ${SCRIPT_CATEGORIES[input.category]}. ${CATEGORY_HINT[input.category]}` : "",
    input.mode === "auto" ? CATEGORY_HINT.auto : "",
    `Tom: ${TONES[input.tone]}.`,
    input.durationSec ? `Duração desejada: ~${input.durationSec}s.` : "",
    input.notes ? `Informações do produto/campanha (use exatamente, não invente preços): ${input.notes}` : "Não há preço ou produto definido: use marcadores como [MODELO] e [PREÇO] em vez de inventar.",
    input.seedTheme || input.seedHook
      ? `Ponto de partida sugerido pela equipe (valide com os dados; pode ajustar se a evidência for fraca): ${[input.seedTheme && `tema ${input.seedTheme} (${themeLabel(input.seedTheme)})`, input.seedHook && `hook ${input.seedHook} (${hookLabel(input.seedHook)})`].filter(Boolean).join(", ")}.`
      : "",
    input.avoid?.length ? `Já geramos alternativas com: ${input.avoid.map((a) => [a.theme, a.hookType, a.topic].filter(Boolean).join(" / ")).join("; ")}. Escolha um caminho DIFERENTE.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const PLAN_SYSTEM = `Você é o estrategista de conteúdo da UseHitzz, marca de calçados de Blumenau (SC).
Sua tarefa agora é SÓ a estratégia de um Reel: ler os dados de concorrentes e referências, listar as melhores oportunidades
atuais e escolher tema, hook, ângulo, formato, estrutura, oferta, CTA e duração com a maior chance de performar.

Regras:
- Baseie cada decisão em números do dataset (score normalizado, razão vs mediana da conta, n de vídeos, contas, evidência).
- Cite apenas IDs de vídeos presentes em "Vídeos citáveis". Nunca invente IDs.
- Respeite a força da evidência: se é anedótica, diga isso e reduza a confiança.
- Nunca proponha refazer um vídeo específico: extraia princípios de vários vídeos e crie algo original para a UseHitzz.
- A estrutura é uma sequência de papéis de beat (hook, product_reveal, offer, cta...).
- Reels de calçado funcionam bem visualmente; fala é opcional. Escolha o que os dados sustentam.
- Português do Brasil.

Hooks possíveis: ${Object.entries(HOOK_TYPES).map(([k, v]) => `${k} (${v.label})`).join(", ")}
Temas: ${Object.entries(THEMES).map(([k, v]) => `${k} (${v})`).join(", ")}
Formatos: ${Object.entries(FORMATS).map(([k, v]) => `${k} (${v})`).join(", ")}`;

export const SCRIPT_SYSTEM = `Você é roteirista de Reels para a UseHitzz, marca de calçados de Blumenau (SC).
Escreva um roteiro original a partir do plano estratégico recebido.

Regras:
- Cena a cena: duração, papel do beat, plano de imagem (enquadramento, movimento, o que aparece), texto na tela e fala.
- Fala curta, natural, como um criador brasileiro diria de verdade. Se o formato não pede fala, deixe "speech" vazio e trabalhe texto na tela.
- Hook forte nos 3 primeiros segundos, em texto na tela (e na fala, se houver).
- Texto na tela curto (até ~8 palavras por cartela).
- Otimize retenção: nada de introdução, corte rápido, payoff antes do CTA.
- Áudio: sugira o TIPO (fala, narração, trilha, formato de trend). Nunca afirme que uma música específica está em alta.
- Não invente preço, desconto, prazo ou produto: use o que foi informado ou marcadores [PREÇO], [MODELO].
- Não copie hooks ou falas dos vídeos de referência; eles servem só como princípios.
- Legenda pronta para postar (com quebra de linha e CTA) e 5 a 10 hashtags relevantes em português.
- A soma das durações das cenas deve bater com a duração total.`;

function validateIds(ids: string[], byId: Map<string, VideoRow>) {
  const ok = ids.filter((id) => byId.has(id));
  return { ok: [...new Set(ok)], removed: ids.filter((id) => !byId.has(id)) };
}


function buildEvidence(plan: Plan, byId: Map<string, VideoRow>): { items: EvidenceItem[]; removed: string[] } {
  const used = new Map<string, Set<string>>();
  const removed: string[] = [];
  for (const d of plan.decisions) {
    const v = validateIds(d.evidenceIds, byId);
    removed.push(...v.removed);
    d.evidenceIds = v.ok;
    for (const id of v.ok) (used.get(id) ?? used.set(id, new Set()).get(id)!).add(d.decision);
  }
  for (const o of plan.opportunities) {
    const v = validateIds(o.evidenceIds, byId);
    removed.push(...v.removed);
    o.evidenceIds = v.ok;
    for (const id of v.ok) (used.get(id) ?? used.set(id, new Set()).get(id)!).add("oportunidade");
  }
  const items = [...used.entries()].map(([id, u]) => {
    const r = byId.get(id)!;
    return { videoId: id, handle: r.handle, ratio: r.score?.ratio ?? null, score: r.score?.score ?? null, views: r.views, hookText: r.hookText, used: [...u] };
  });
  items.sort((a, b) => (b.score ?? -9) - (a.score ?? -9));
  return { items, removed: [...new Set(removed)] };
}

/** Plano heurístico (sem IA): escolhe o que os números apontam, com as mesmas evidências. */
function heuristicPlan(ins: Insights, input: ScriptInput, rows: VideoRow[]): Plan {
  const seed = { ...(input.category ? CATEGORY_SEED[input.category] : {}), ...(input.seedTheme ? { theme: input.seedTheme } : {}), ...(input.seedHook ? { hookType: input.seedHook } : {}) };
  const avoidThemes = new Set((input.avoid ?? []).map((a) => a.theme));
  const avoidHooks = new Set((input.avoid ?? []).map((a) => a.hookType));
  const pick = <T extends { key: string; medianScore: number | null; n: number }>(list: T[], forced?: string, avoid?: Set<string | undefined>) =>
    (forced && list.find((x) => x.key === forced)) || list.find((x) => x.n >= 3 && !avoid?.has(x.key) && x.key !== "other") || list[0];
  const accel = ins.themeTrends.find((t) => (t.status === "acelerando" || t.status === "ganhando tração") && !avoidThemes.has(t.key));
  const theme = pick(ins.themes, seed.theme ?? accel?.key, avoidThemes);
  const hook = pick(ins.hooks, seed.hookType, avoidHooks);
  const format = pick(ins.formats);
  const offer = pick(ins.offers.filter((o) => o.key !== "none"), input.category === "promotion" ? undefined : "launch");
  const cta = pick(ins.ctas.filter((c) => c.key !== "none"));
  const struct = ins.structures[0];
  const structure = (struct?.key.split(" → ") ?? ["hook", "product_reveal", "detail", "offer", "cta"]) as Plan["chosen"]["structure"];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const durs = (hook?.topIds ?? []).map((id) => byId.get(id)?.durationSec).filter((x): x is number => !!x);
  const duration = input.durationSec ?? (durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 15);
  const stat = (s?: { n: number; nAccounts: number; medianScore: number | null; evidence: string }) =>
    s ? `${s.n} vídeos, ${s.nAccounts} contas, score mediano ${s.medianScore?.toFixed(2) ?? "—"} (evidência ${s.evidence})` : "sem dados suficientes";
  const topicText = input.mode === "theme" && input.theme ? input.theme : `${themeLabel(theme?.key)} da UseHitzz`;
  return {
    datasetReading: `Entre ${ins.totals.analyzed} vídeos analisados, o hook "${hookLabel(hook?.key)}" e o tema "${themeLabel(theme?.key)}" estão entre os de melhor score mediano.${accel ? ` O tema ${themeLabel(accel.key).toLowerCase()} está ${accel.status}.` : ""}`,
    opportunities: ins.opportunities.slice(0, 3).map((o) => ({ title: o.title, rationale: o.why, evidenceIds: o.ids.slice(0, 3) })),
    chosen: {
      theme: (theme?.key ?? "new_collection") as Plan["chosen"]["theme"],
      topic: topicText,
      hookType: (hook?.key ?? "launch_reveal") as Plan["chosen"]["hookType"],
      hookIdea: `Abrir com ${hookLabel(hook?.key).toLowerCase()} em texto na tela.`,
      angle: `${themeLabel(theme?.key)} mostrado pelo produto em uso, com ${offerLabel(offer?.key).toLowerCase()}.`,
      format: (format?.key ?? "product_broll") as Plan["chosen"]["format"],
      structure,
      offerType: (offer?.key ?? "none") as Plan["chosen"]["offerType"],
      ctaType: (cta?.key ?? "link_bio") as Plan["chosen"]["ctaType"],
      durationSec: duration,
    },
    decisions: [
      { decision: "tema", choice: themeLabel(theme?.key), why: accel?.key === theme?.key ? "Tema em aceleração na janela recente." : "Melhor score mediano entre os temas com amostra.", stats: stat(theme), evidenceIds: theme?.topIds.slice(0, 3) ?? [] },
      { decision: "hook", choice: hookLabel(hook?.key), why: "Tipo de hook com melhor desempenho relativo.", stats: stat(hook), evidenceIds: hook?.topIds.slice(0, 3) ?? [] },
      { decision: "formato", choice: formatLabel(format?.key), why: "Formato com melhor score mediano.", stats: stat(format), evidenceIds: format?.topIds.slice(0, 2) ?? [] },
      { decision: "estrutura", choice: labelFor("structure", structure.join(" → ")), why: "Estrutura recorrente entre os vídeos de melhor desempenho.", stats: stat(struct), evidenceIds: struct?.topIds.slice(0, 2) ?? [] },
      { decision: "oferta", choice: offerLabel(offer?.key), why: "Tipo de oferta com melhor resposta.", stats: stat(offer), evidenceIds: offer?.topIds.slice(0, 2) ?? [] },
      { decision: "cta", choice: ctaLabel(cta?.key), why: `CTA com melhor score (engajamento mediano ${cta?.medianEngagement ? (cta.medianEngagement * 100).toFixed(1) + "%" : "—"}).`, stats: stat(cta), evidenceIds: cta?.topIds.slice(0, 2) ?? [] },
    ],
    expected: {
      rationale: "Combinação das categorias com maior score mediano no dataset atual. Gerado sem IA (modo heurístico): o texto é um esqueleto para a equipe ajustar.",
      confidence: [theme, hook].every((s) => s?.evidence === "forte" || s?.evidence === "moderada") ? "média" : "baixa",
      risks: ["Roteiro heurístico: revise a fala e os textos antes de gravar.", "Correlação não garante causa: acompanhe o resultado do post."],
    },
  };
}

const HOOK_TEMPLATES: Partial<Record<string, string>> = {
  launch_reveal: "Chegou: [MODELO]",
  price_promo: "De [PREÇO] por [PREÇO PROMO]?",
  urgency_scarcity: "Últimos pares do [MODELO]",
  promo_trip_event: "Levamos a [COLEÇÃO] para [LUGAR]",
  styling_howto: "[N] jeitos de usar o [MODELO]",
  lookbook_tour: "Todos os modelos da [COLEÇÃO]",
  unboxing: "Abrindo o pedido de uma cliente",
  behind_scenes: "Como nasce um [MODELO] em Blumenau",
  social_proof: "O que as clientes estão falando do [MODELO]",
  comparison: "[MODELO] vs [OUTRO MODELO]: qual você leva?",
  pov: "POV: você achou o [CALÇADO] perfeito",
  trend_audio: "Quando o [MODELO] chega em casa",
  provocative_question: "Existe [CALÇADO] bonito e confortável?",
  before_after: "Mesmo look, outro calçado",
  product_demo: "Testei o [MODELO] por 12 horas",
  brand_story: "Por que começamos em Blumenau",
  store_tour: "Vem conhecer a loja",
};

const SCENE_TEMPLATES: Record<string, (p: Plan, input: ScriptInput) => Omit<Script["scenes"][number], "durationSec" | "role">> = {
  hook: (p) => ({ shot: "Close no calçado entrando em quadro, movimento rápido", onScreenText: HOOK_TEMPLATES[p.chosen.hookType] ?? "[MODELO] chegou", speech: "", notes: "Primeiros 3s: movimento + texto grande." }),
  context: (p) => ({ shot: "Plano médio da loja/estúdio", onScreenText: p.chosen.topic.slice(0, 50), speech: "", notes: "" }),
  product_reveal: () => ({ shot: "Giro 360° do [MODELO] em fundo neutro", onScreenText: "[MODELO] · [COLEÇÃO]", speech: "", notes: "Luz lateral para mostrar textura." }),
  detail: () => ({ shot: "Macro no solado, costura e palmilha", onScreenText: "Conforto de verdade", speech: "", notes: "3 cortes rápidos." }),
  demo: () => ({ shot: "Pés caminhando na rua de Blumenau", onScreenText: "O dia todo no pé", speech: "", notes: "" }),
  styling: () => ({ shot: "3 looks em transição (jeans, vestido, alfaiataria)", onScreenText: "3 jeitos de usar", speech: "", notes: "Corte no beat da trilha." }),
  offer: (p, i) => ({ shot: "Calçado + cartela de preço", onScreenText: i.notes ? "[OFERTA]" : p.chosen.offerType === "free_shipping" ? "Frete grátis" : p.chosen.offerType === "installments" ? "Em até [N]x sem juros" : "[PREÇO]", speech: "", notes: "Oferta clara e legível por 2s." }),
  urgency: () => ({ shot: "Prateleira esvaziando / contador", onScreenText: "Só até [DATA]", speech: "", notes: "" }),
  social_proof: () => ({ shot: "Print de comentário ou cliente usando", onScreenText: "Quem comprou, voltou", speech: "", notes: "" }),
  story: () => ({ shot: "Bastidor da equipe", onScreenText: "Feito em Blumenau", speech: "", notes: "" }),
  transition: () => ({ shot: "Transição no movimento do pé", onScreenText: "", speech: "", notes: "" }),
  payoff: () => ({ shot: "Look completo, plano aberto", onScreenText: "Resultado", speech: "", notes: "" }),
  cta: (p) => ({ shot: "Calçado na mão, câmera se aproxima", onScreenText: p.chosen.ctaType === "whatsapp" ? "Chama no WhatsApp" : p.chosen.ctaType === "visit_store" ? "Vem na loja" : "Link na bio", speech: "", notes: "" }),
  other: () => ({ shot: "Plano livre", onScreenText: "", speech: "", notes: "" }),
};

async function heuristicScript(plan: Plan, input: ScriptInput): Promise<Script> {
  const roles = plan.chosen.structure.length ? plan.chosen.structure : (["hook", "product_reveal", "offer", "cta"] as Plan["chosen"]["structure"]);
  const total = Math.max(7, Math.round(plan.chosen.durationSec));
  const base = Math.max(1.5, total / roles.length);
  const scenes = roles.map((role, i) => ({
    durationSec: i === 0 ? 3 : Math.round(base * 10) / 10,
    role,
    ...(SCENE_TEMPLATES[role] ?? SCENE_TEMPLATES.other)(plan, input),
  }));
  const s = await getSettings();
  return {
    title: `${themeLabel(plan.chosen.theme)}: ${hookLabel(plan.chosen.hookType)}`,
    onScreenHook: scenes[0].onScreenText,
    spokenHook: "",
    totalDurationSec: Math.round(scenes.reduce((a, b) => a + b.durationSec, 0)),
    audio: { type: "music", direction: "Trilha instrumental com batida marcada para sincronizar os cortes; sem fala, tudo em texto na tela." },
    scenes,
    cta: { type: plan.chosen.ctaType, text: SCENE_TEMPLATES.cta(plan, input).onScreenText },
    caption: `${scenes[0].onScreenText}\n\n${plan.chosen.topic}.\n\n${SCENE_TEMPLATES.cta(plan, input).onScreenText} 👟`,
    hashtags: ["calcados", "sapatos", "tenis", "modafeminina", "blumenau", s.ownHandle.replace(/[^a-z0-9]/gi, "")],
    altHooks: [],
    productionNotes: ["Roteiro gerado sem IA (modo heurístico): configure ANTHROPIC_API_KEY para roteiros completos com fala e justificativa."],
  };
}

export async function generateScript(input: ScriptInput, opts: { parentId?: number | null; reusePlan?: Plan | null; progress?: (m: string) => void; heuristic?: boolean } = {}) {
  const progress = opts.progress ?? (() => {});
  const { rows, byId } = await loadVideos();
  const ins = await getInsights();
  if (ins.totals.analyzed < 3) throw Object.assign(new Error("Ainda não há vídeos analisados suficientes para gerar um roteiro com base em dados."), { retryable: false });
  const useAi = !opts.heuristic && analyzerMode() === "api" && hasKey("anthropic");
  let plan: Plan;
  let script: Script;
  let model: string | null = null;

  if (useAi) {
    if (opts.reusePlan) {
      plan = opts.reusePlan;
    } else {
      progress("Lendo o dataset e escolhendo a oportunidade");
      const vids = pickVideos(rows, input);
      const ans = await analysesFor(vids.map((v) => v.id));
      const res = await structured({
        system: PLAN_SYSTEM,
        content: `Pedido:\n${await requestText(input)}\n\nEstatísticas do dataset (score = log2(views/mediana da conta)/σ; >0 é acima da mediana):\n${JSON.stringify(
          compactInsights(ins),
        )}\n\nVídeos citáveis:\n${JSON.stringify(vids.map((v) => citable(v, ans.get(v.id))))}`,
        schema: PlanSchema,
        effort: "high",
        maxTokens: 32000,
      });
      plan = res.data;
      model = res.model;
    }
    progress("Escrevendo o roteiro cena a cena");
    const refs = plan.decisions.flatMap((d) => d.evidenceIds).filter((id) => byId.has(id)).slice(0, 6);
    const ans = await analysesFor(refs);
    const refText = refs
      .map((id) => {
        const a = ans.get(id);
        return a ? `- ${id}: estrutura ${a.beats.map((b) => `${b.role}(${(b.end - b.start).toFixed(1)}s)`).join(" → ")}; princípios: ${a.replicable.slice(0, 2).join("; ")}` : null;
      })
      .filter(Boolean)
      .join("\n");
    const res2 = await structured({
      system: SCRIPT_SYSTEM,
      content: `Pedido:\n${await requestText(input)}\n\nPlano estratégico:\n${JSON.stringify(plan.chosen, null, 2)}\nÂngulo e porquês:\n${plan.decisions
        .map((d) => `- ${d.decision}: ${d.choice} (${d.why})`)
        .join("\n")}\n\nReferências de ritmo (NÃO copiar):\n${refText || "—"}`,
      schema: ScriptSchema,
      effort: "high",
      maxTokens: 24000,
    });
    script = res2.data;
    model = model ?? res2.model;
  } else {
    plan = opts.reusePlan ?? heuristicPlan(ins, input, rows);
    script = await heuristicScript(plan, input);
  }

  progress("Validando evidências citadas");
  return await saveScript(input, plan, script, { parentId: opts.parentId ?? null, generator: useAi ? "ai" : "heuristic", model });
}

/**
 * Grava um roteiro: valida os IDs citados contra o banco (inválidos são removidos e contados)
 * e mede a originalidade contra os hooks existentes. Usado pela API e pelo modo Claude Code.
 */
export async function saveScript(input: ScriptInput, plan: Plan, script: Script, opts: { parentId: number | null; generator: string; model: string | null }) {
  const { rows, byId } = await loadVideos();
  const ins = await getInsights();
  const { items, removed } = buildEvidence(plan, byId);
  const orig = originality(script, rows);
  const evidence = { items, removedIds: removed, originality: orig, basedOn: { analyzed: ins.totals.analyzed, demo: ins.totals.demo } };
  const row = await db
    .insert(schema.scripts)
    .values({
      parentId: opts.parentId,
      mode: input.mode,
      input: input as unknown as Record<string, unknown>,
      plan,
      output: script,
      evidence,
      title: script.title,
      generator: opts.generator,
      model: opts.model,
      createdAt: Date.now(),
    })
    .returning()
    .get();
  await bump("scripts");
  return row;
}

export async function listScripts() {
  return await db.select().from(schema.scripts).orderBy(desc(schema.scripts.createdAt)).all();
}

export async function getScript(id: number) {
  return await db.select().from(schema.scripts).where(eq(schema.scripts.id, id)).get();
}
