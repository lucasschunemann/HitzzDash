import { z } from "zod";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { hookLabel, themeLabel } from "@/lib/taxonomy";
import { getInsights, DIM_LABEL, type Insights } from "./insights";
import { loadVideos, type VideoRow } from "./data";
import { structured } from "./llm";
import { hasKey, analyzerMode } from "./env";
import { bump } from "./events";

export const DigestSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  patterns: z.array(
    z.object({
      title: z.string(),
      insight: z.string(),
      evidence: z.string().describe("Números concretos: n de vídeos, contas, score/razão."),
      strength: z.enum(["forte", "moderada", "fraca", "anedótica"]),
      videoIds: z.array(z.string()),
      action: z.string(),
    }),
  ),
  watchOut: z.array(z.string()),
  nextSteps: z.array(z.string()),
});
export type DigestData = z.infer<typeof DigestSchema>;

const n = (x: number) => new Intl.NumberFormat("pt-BR").format(Math.round(x));

export function compactVideo(r: VideoRow) {
  return {
    id: r.id,
    conta: `@${r.handle}`,
    grupo: r.group,
    publicado: new Date(r.publishedAt).toISOString().slice(0, 10),
    views: r.views,
    razao_vs_mediana: r.score?.ratio ? Number(r.score.ratio.toFixed(2)) : null,
    score: r.score?.score !== null && r.score?.score !== undefined ? Number(r.score.score.toFixed(2)) : null,
    faixa: r.score?.band,
    hook_tipo: r.hookType,
    hook_texto: r.hookText,
    tema: r.theme,
    assunto: r.topic,
    formato: r.format,
    oferta: r.offerType,
    cta: r.ctaType,
  };
}

export function compactInsights(ins: Insights) {
  const stat = (s: Insights["hooks"][number]) => ({
    chave: s.key,
    n: s.n,
    contas: s.nAccounts,
    score_mediano: s.medianScore !== null ? Number(s.medianScore.toFixed(2)) : null,
    lift: s.lift !== null ? Number(s.lift.toFixed(2)) : null,
    ic90: s.ciLow !== null ? [Number(s.ciLow.toFixed(2)), Number(s.ciHigh!.toFixed(2))] : null,
    taxa_acima: Number(s.hitRate.toFixed(2)),
    evidencia: s.evidence,
    exemplos: s.topIds.slice(0, 3),
  });
  return {
    totais: ins.totals,
    hooks: ins.hooks.map(stat),
    formatos: ins.formats.map(stat),
    temas: ins.themes.map(stat),
    ofertas: ins.offers.map(stat),
    ctas: ins.ctas.map((c) => ({ ...stat(c), engajamento_mediano: c.medianEngagement })),
    estruturas: ins.structures.slice(0, 6).map(stat),
    frases_de_abertura: ins.openings.slice(0, 8),
    tendencias_temas: ins.themeTrends.slice(0, 8).map((t) => ({ tema: t.key, status: t.status, recentes: t.recentN, anteriores: t.prevN, score_recente: t.recentScore, score_anterior: t.prevScore, exemplos: t.ids })),
    lacunas: ins.gaps.slice(0, 8).map((g) => ({ dimensao: g.dimension, chave: g.key, tipo: g.kind, n_mercado: g.marketN, n_propria: g.ownN, score_mediano: g.medianScore, exemplos: g.ids })),
    padroes_ranqueados: ins.topPatterns.map((p) => ({ id: p.id, rotulo: p.label, dimensao: p.dimension, lift: Number(p.lift.toFixed(2)), n: p.n, contas: p.nAccounts, evidencia: p.evidence, exemplos: p.ids })),
  };
}

/** Resumo determinístico (usado sem chave da Anthropic ou como fallback). */
export async function heuristicDigest(ins: Insights): Promise<DigestData> {
  const top = ins.topPatterns.slice(0, 5);
  const accel = ins.themeTrends.find((t) => t.status === "acelerando" || t.status === "ganhando tração");
  const best = ins.outliersWeek[0] ?? ins.outliersRecent[0];
  return {
    headline: top[0] ? `${DIM_LABEL[top[0].dimension]} "${top[0].label}" lidera o que funciona agora` : "Ainda há poucos dados para apontar padrões",
    summary: [
      `${ins.totals.analyzed} vídeos analisados de ${ins.totals.accounts} contas.`,
      accel ? `O tema ${themeLabel(accel.key).toLowerCase()} está ${accel.status} nas últimas 3 semanas.` : "",
      best ? `Maior outlier recente: @${best.handle} com ${best.score?.ratio?.toFixed(1)}× a mediana da conta.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    patterns: top.map((p) => ({
      title: `${DIM_LABEL[p.dimension]}: ${p.label}`,
      insight: p.statement,
      evidence: `${p.n} vídeos de ${p.nAccounts} contas · score mediano ${p.medianScore?.toFixed(2)} · ${Math.round(p.hitRate * 100)}% acima do normal`,
      strength: p.evidence,
      videoIds: p.ids.slice(0, 3),
      action: p.action,
    })),
    watchOut: ins.weakPatterns.slice(0, 3).map((p) => `${DIM_LABEL[p.dimension]} "${p.label}" está abaixo do geral (${p.lift.toFixed(2)}; ${p.n} vídeos).`),
    nextSteps: ins.opportunities.slice(0, 3).map((o) => o.action),
  };
}

export const DIGEST_SYSTEM = `Você é o estrategista de conteúdo da UseHitzz (calçados, Blumenau/SC). Escreva o resumo semanal de inteligência
de concorrentes para a equipe decidir o que produzir. Use SOMENTE os dados recebidos.

Regras:
- Ranqueie de 3 a 5 padrões que importam agora, do mais acionável ao menos.
- Cada padrão traz evidência numérica (n de vídeos, contas, score/razão) e IDs de vídeos que existem nos dados.
- Seja honesto com a estatística: com amostra pequena ou uma conta só, diga que é anedótico. Não venda correlação fraca como regra.
- "action" é concreto: o que gravar, como abrir, que oferta comunicar.
- Português do Brasil, direto, sem jargão de marketing vazio.`;

export async function generateDigest() {
  const ins = await getInsights();
  const { byId, rows } = await loadVideos();
  let data: DigestData;
  let generator = "heuristic";
  if (analyzerMode() === "api" && hasKey("anthropic") && ins.totals.analyzed >= 5) {
    const ids = new Set<string>();
    for (const p of ins.topPatterns) p.ids.forEach((i) => ids.add(i));
    for (const o of ins.outliersRecent) ids.add(o.id);
    const vids = [...ids].map((i) => byId.get(i)).filter((x): x is VideoRow => Boolean(x)).map(compactVideo);
    const res = await structured({
      system: DIGEST_SYSTEM,
      content: `Estatísticas agregadas:\n${JSON.stringify(compactInsights(ins))}\n\nVídeos citáveis:\n${JSON.stringify(vids)}`,
      schema: DigestSchema,
      effort: "medium",
      maxTokens: 24000,
    });
    data = res.data;
    generator = res.model;
  } else {
    data = await heuristicDigest(ins);
  }
  // Só ficam IDs que existem no banco.
  for (const p of data.patterns) p.videoIds = p.videoIds.filter((id) => byId.has(id));
  const weekStart = startOfWeek(Date.now());
  await db.insert(schema.digests).values({ weekStart, data, generator, createdAt: Date.now() }).run();
  await bump("patterns");
  void rows;
  return data;
}

export function startOfWeek(t: number) {
  const d = new Date(t);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export async function latestDigest(): Promise<{ data: DigestData; generator: string; createdAt: number; saved: boolean }> {
  const row = await db.select().from(schema.digests).orderBy(desc(schema.digests.createdAt)).limit(1).get();
  if (row) return { data: row.data as DigestData, generator: row.generator, createdAt: row.createdAt, saved: true };
  return { data: await heuristicDigest(await getInsights()), generator: "heuristic", createdAt: Date.now(), saved: false };
}

export { hookLabel, n as fmtInt };
