import {
  groupStats,
  trends,
  heatmap,
  openingPhrases,
  structureSignature,
  gaps,
  EVIDENCE_HINT,
  type GroupStat,
  type PatternRow,
  type Evidence,
} from "@/lib/patterns";
import { HOOK_TYPE_KEYS, FORMAT_KEYS, THEME_KEYS, hookLabel, formatLabel, themeLabel, ctaLabel, offerLabel } from "@/lib/taxonomy";
import { BEAT_ROLES } from "@/lib/analysis-schema";
import { loadVideos, patternRows, type VideoRow } from "./data";
import { latestChange } from "./events";

export type Dimension = "hookType" | "format" | "theme" | "ctaType" | "offerType" | "structure";

export const DIM_LABEL: Record<Dimension, string> = {
  hookType: "Hook",
  format: "Formato",
  theme: "Tema",
  ctaType: "CTA",
  offerType: "Oferta",
  structure: "Estrutura",
};

export function labelFor(dim: Dimension, key: string) {
  switch (dim) {
    case "hookType":
      return hookLabel(key);
    case "format":
      return formatLabel(key);
    case "theme":
      return themeLabel(key);
    case "ctaType":
      return ctaLabel(key);
    case "offerType":
      return offerLabel(key);
    case "structure":
      return key
        .split(" → ")
        .map((r) => BEAT_ROLES[r as keyof typeof BEAT_ROLES] ?? r)
        .join(" → ");
  }
}

export type Pattern = {
  id: string;
  dimension: Dimension;
  key: string;
  label: string;
  statement: string;
  action: string;
  lift: number;
  medianScore: number | null;
  hitRate: number;
  n: number;
  nAccounts: number;
  evidence: Evidence;
  evidenceHint: string;
  ids: string[];
  members: string[];
  /** Mesmo grupo de vídeos visto por outra dimensão (ex.: o hook "viagem" também é o tema "viagem"). */
  alsoAs: string[];
};

const EVIDENCE_WEIGHT: Record<Evidence, number> = { forte: 1, moderada: 0.75, fraca: 0.35, anedótica: 0.2 };

function actionFor(dim: Dimension, label: string) {
  switch (dim) {
    case "hookType":
      return `Abra os próximos Reels com um hook de "${label}" nos 3 primeiros segundos, em texto na tela.`;
    case "format":
      return `Grave pelo menos um Reel nesta semana no formato "${label}".`;
    case "theme":
      return `Priorize o tema "${label}" na pauta da semana.`;
    case "ctaType":
      return `Feche os vídeos com CTA de "${label}", falado e em texto.`;
    case "offerType":
      return `Quando houver promoção, comunique como "${label}" logo no início.`;
    case "structure":
      return `Use a sequência ${label} como esqueleto de edição.`;
  }
}

function toPatterns(dim: Dimension, stats: GroupStat[]): Pattern[] {
  return stats
    .filter((s) => s.lift !== null && s.medianScore !== null && s.n >= 3)
    .map((s) => {
      const label = labelFor(dim, s.key);
      return {
        id: `${dim}:${s.key}`,
        dimension: dim,
        key: s.key,
        label,
        statement:
          s.lift! >= 0
            ? `${DIM_LABEL[dim]} "${label}" tem score mediano ${s.lift!.toFixed(2)} acima do geral (${s.n} vídeos, ${s.nAccounts} contas; ${Math.round(s.hitRate * 100)}% acima do normal).`
            : `${DIM_LABEL[dim]} "${label}" fica abaixo do geral (${s.lift!.toFixed(2)}; ${s.n} vídeos).`,
        action: actionFor(dim, label),
        lift: s.lift!,
        medianScore: s.medianScore,
        hitRate: s.hitRate,
        n: s.n,
        nAccounts: s.nAccounts,
        evidence: s.evidence,
        evidenceHint: EVIDENCE_HINT[s.evidence],
        ids: s.topIds,
        members: [],
        alsoAs: [],
      } as Pattern;
    });
}

export type Opportunity = {
  id: string;
  title: string;
  why: string;
  action: string;
  evidence: Evidence;
  ids: string[];
  seed: { theme?: string; hookType?: string; format?: string; offerType?: string };
};

export type Insights = ReturnType<typeof buildInsights>;

export function buildInsights(all: VideoRow[], now = Date.now()) {
  const rowsAll = patternRows(all);
  const market = rowsAll.filter((r) => r.group !== "own");
  const own = rowsAll.filter((r) => r.group === "own");

  const hooks = groupStats(market, (r) => r.hookType);
  const formats = groupStats(market, (r) => r.format);
  const themes = groupStats(market, (r) => r.theme);
  const ctas = groupStats(market, (r) => r.ctaType);
  const offers = groupStats(market, (r) => r.offerType);
  const structures = groupStats(market, (r) => (r.beatRoles.length >= 3 ? structureSignature(r.beatRoles) : null)).filter((s) => s.n >= 3);
  const openings = openingPhrases(market);
  const themeTrends = trends(market, (r) => r.theme, now);
  const hookTrends = trends(market, (r) => r.hookType, now);
  const formatTrends = trends(market, (r) => r.format, now);
  const heat = heatmap(market, (r) => r.theme, now, 8);
  const gapList = gaps(rowsAll, { theme: [...THEME_KEYS], format: [...FORMAT_KEYS], hookType: [...HOOK_TYPE_KEYS] });

  // Padrões que importam: lift positivo ponderado por evidência e tamanho de amostra.
  const candidates = [
    ...toPatterns("hookType", hooks),
    ...toPatterns("format", formats),
    ...toPatterns("theme", themes),
    ...toPatterns("offerType", offers.filter((o) => o.key !== "none")),
    ...toPatterns("ctaType", ctas.filter((c) => c.key !== "none")),
    ...toPatterns("structure", structures),
  ];
  const memberKey: Record<Dimension, (r: PatternRow) => string | null> = {
    hookType: (r) => r.hookType,
    format: (r) => r.format,
    theme: (r) => r.theme,
    offerType: (r) => r.offerType,
    ctaType: (r) => r.ctaType,
    structure: (r) => (r.beatRoles.length >= 3 ? structureSignature(r.beatRoles) : null),
  };
  for (const c of candidates) c.members = market.filter((r) => memberKey[c.dimension](r) === c.key).map((r) => r.id);
  const ranked = candidates
    .filter((p) => p.lift > 0.15)
    .map((p) => ({ p, rank: p.lift * Math.sqrt(Math.min(p.n, 30)) * EVIDENCE_WEIGHT[p.evidence] }))
    .sort((a, b) => b.rank - a.rank)
    .map((x) => x.p);
  // Dedup: padrões com quase os mesmos vídeos (Jaccard ≥ 0,7) contam como um só.
  const topPatterns: Pattern[] = [];
  for (const p of ranked) {
    const set = new Set(p.members);
    const dup = topPatterns.find((q) => {
      const inter = q.members.filter((id) => set.has(id)).length;
      return inter / (q.members.length + set.size - inter) >= 0.7;
    });
    if (dup) dup.alsoAs.push(`${DIM_LABEL[p.dimension].toLowerCase()} "${p.label}"`);
    else topPatterns.push(p);
    if (topPatterns.length >= 8) break;
  }
  const weakPatterns = candidates.filter((p) => p.lift < -0.3 && p.n >= 5).sort((a, b) => a.lift - b.lift).slice(0, 4);

  const weekAgo = now - 7 * 86_400_000;
  const scored = all.filter((r) => r.score?.score !== null && r.score?.score !== undefined && !r.isPinned);
  const outliersWeek = scored
    .filter((r) => r.publishedAt >= weekAgo && r.group !== "own" && (r.score?.band === "breakout" || r.score?.band === "above"))
    .sort((a, b) => (b.score!.score as number) - (a.score!.score as number))
    .slice(0, 8);
  const outliersRecent = scored
    .filter((r) => r.publishedAt >= now - 30 * 86_400_000 && r.group !== "own" && r.score?.band === "breakout")
    .sort((a, b) => (b.score!.score as number) - (a.score!.score as number))
    .slice(0, 12);

  // Oportunidades: cruzam padrão forte + tema acelerando + lacuna da conta própria.
  const opportunities: Opportunity[] = [];
  const bestHook = topPatterns.find((p) => p.dimension === "hookType");
  const bestFormat = topPatterns.find((p) => p.dimension === "format");
  const accel = themeTrends.filter((t) => t.status === "acelerando" || t.status === "ganhando tração").slice(0, 2);
  for (const t of accel) {
    const ts = themes.find((x) => x.key === t.key);
    opportunities.push({
      id: `trend:${t.key}`,
      title: `${themeLabel(t.key)} está ${t.status}`,
      why: `Nas últimas 3 semanas, ${t.recentN} vídeos do mercado (${Math.round(t.recentShare * 100)}% do total, antes ${Math.round(t.prevShare * 100)}%)${
        t.recentScore !== null ? ` com score médio ${t.recentScore.toFixed(2)}${t.prevScore !== null ? ` (antes ${t.prevScore.toFixed(2)})` : ""}` : ""
      }.`,
      action: bestHook
        ? `Produza um Reel de ${themeLabel(t.key).toLowerCase()} abrindo com hook de "${bestHook.label}".`
        : `Produza um Reel sobre ${themeLabel(t.key).toLowerCase()} nesta semana.`,
      evidence: ts?.evidence ?? "anedótica",
      ids: t.ids,
      seed: { theme: t.key, hookType: bestHook?.key },
    });
  }
  for (const gp of gapList.filter((x) => x.kind.startsWith("concorrentes")).slice(0, 2)) {
    const dimMap = { theme: "theme", format: "format", hookType: "hookType" } as const;
    const label = labelFor(dimMap[gp.dimension], gp.key);
    opportunities.push({
      id: `gap:${gp.dimension}:${gp.key}`,
      title: `Lacuna: ${label}`,
      why: `Concorrentes publicaram ${gp.marketN} vídeos com ${DIM_LABEL[dimMap[gp.dimension]].toLowerCase()} "${label}" (score mediano ${gp.medianScore?.toFixed(2)}), e a conta própria quase não usa (${gp.ownN} vídeos).`,
      action: `Teste ${label.toLowerCase()} na UseHitzz: é território validado que vocês ainda não ocupam.`,
      evidence: gp.marketN >= 8 ? "moderada" : "fraca",
      ids: gp.ids,
      seed: { [gp.dimension]: gp.key },
    });
  }
  for (const p of topPatterns.filter((p) => p.evidence === "forte" || p.evidence === "moderada").slice(0, 3)) {
    if (opportunities.length >= 5) break;
    if (opportunities.some((o) => o.seed[p.dimension as "theme"] === p.key)) continue;
    opportunities.push({
      id: `pattern:${p.id}`,
      title: `${DIM_LABEL[p.dimension]} que performa: ${p.label}`,
      why: p.statement,
      action: p.action,
      evidence: p.evidence,
      ids: p.ids,
      seed: p.dimension === "structure" || p.dimension === "ctaType" ? {} : { [p.dimension]: p.key },
    });
  }
  if (bestFormat && opportunities.length < 5 && !opportunities.some((o) => o.seed.format === bestFormat.key)) {
    opportunities.push({
      id: `format:${bestFormat.key}`,
      title: `Formato em alta: ${bestFormat.label}`,
      why: bestFormat.statement,
      action: bestFormat.action,
      evidence: bestFormat.evidence,
      ids: bestFormat.ids,
      seed: { format: bestFormat.key },
    });
  }

  const analyzed = all.filter((r) => r.hookType).length;
  return {
    generatedAt: now,
    totals: {
      videos: all.length,
      analyzed,
      market: market.length,
      own: own.length,
      accounts: new Set(all.map((r) => r.accountId)).size,
      demo: all.filter((r) => r.isDemo).length,
    },
    hooks,
    formats,
    themes,
    ctas,
    offers,
    structures,
    openings,
    themeTrends,
    hookTrends,
    formatTrends,
    heat,
    gaps: gapList,
    topPatterns,
    weakPatterns,
    outliersWeek,
    outliersRecent,
    opportunities: opportunities.slice(0, 5),
  };
}

const g = globalThis as unknown as { __hitzzInsights?: { key: string; value: Insights } };
export async function getInsights(): Promise<Insights> {
  const key = `${(await latestChange())?.id ?? 0}:${Math.floor(Date.now() / 600_000)}`;
  if (g.__hitzzInsights?.key === key) return g.__hitzzInsights.value;
  const value = await buildInsights((await loadVideos()).rows);
  g.__hitzzInsights = { key, value };
  return value;
}

export type { PatternRow };
