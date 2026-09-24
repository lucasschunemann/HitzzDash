/**
 * Descoberta de padrões a partir dos vídeos analisados e pontuados.
 * Tudo aqui é função pura para poder ser testado e reutilizado (dashboard, resumo semanal,
 * gerador de roteiros).
 */
import { median } from "./scoring";

export type PatternRow = {
  id: string;
  accountId: number;
  handle: string;
  group: "competitor" | "reference" | "own";
  publishedAt: number;
  score: number | null;
  band: string | null;
  ratio: number | null;
  views: number | null;
  engagementRate: number | null;
  commentsPerView: number | null;
  hookType: string;
  format: string;
  theme: string;
  ctaType: string;
  offerType: string;
  hookText: string;
  beatRoles: string[];
};

export type Evidence = "forte" | "moderada" | "fraca" | "anedótica";

export type GroupStat = {
  key: string;
  n: number;
  nAccounts: number;
  meanScore: number | null;
  medianScore: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  hitRate: number;
  lift: number | null;
  evidence: Evidence;
  medianEngagement: number | null;
  topIds: string[];
};

/** RNG determinístico (mulberry32) para o bootstrap dar sempre o mesmo resultado. */
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

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Intervalo de 90% da média por bootstrap. */
export function bootstrapCI(xs: number[], iters = 800, seed = 42): [number, number] | null {
  if (xs.length < 3) return null;
  const r = rng(seed + xs.length);
  const means: number[] = [];
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let j = 0; j < xs.length; j++) s += xs[Math.floor(r() * xs.length)];
    means.push(s / xs.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(iters * 0.05)], means[Math.floor(iters * 0.95)]];
}

export function evidenceLevel(n: number, nAccounts: number, ciLow: number | null, meanScore: number | null): Evidence {
  if (n < 5 || nAccounts < 2 || ciLow === null || meanScore === null) return "anedótica";
  if (ciLow > 0 && n >= 12 && nAccounts >= 3) return "forte";
  if (ciLow > -0.15 && n >= 6) return "moderada";
  return "fraca";
}

export const EVIDENCE_HINT: Record<Evidence, string> = {
  forte: "Amostra razoável, várias contas e intervalo de confiança acima de zero.",
  moderada: "Sinal consistente, mas amostra ou número de contas ainda limitados.",
  fraca: "Diferença pequena ou instável; pode ser ruído.",
  anedótica: "Poucos vídeos ou uma conta só; use como inspiração, não como regra.",
};

const isHit = (band: string | null) => band === "above" || band === "breakout";

export function groupStats(rows: PatternRow[], keyOf: (r: PatternRow) => string | null): GroupStat[] {
  const scored = rows.filter((r) => r.score !== null);
  const overall = median(scored.map((r) => r.score as number));
  const groups = new Map<string, PatternRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }
  const out: GroupStat[] = [];
  for (const [key, list] of groups) {
    const scores = list.filter((r) => r.score !== null).map((r) => r.score as number);
    const m = mean(scores);
    const med = median(scores);
    const ci = bootstrapCI(scores);
    const nAccounts = new Set(list.map((r) => r.accountId)).size;
    const engs = list.map((r) => r.engagementRate).filter((x): x is number => x !== null);
    out.push({
      key,
      n: list.length,
      nAccounts,
      meanScore: m,
      medianScore: med,
      ciLow: ci?.[0] ?? null,
      ciHigh: ci?.[1] ?? null,
      hitRate: list.length ? list.filter((r) => isHit(r.band)).length / list.length : 0,
      lift: med !== null && overall !== null ? med - overall : null,
      evidence: evidenceLevel(scores.length, nAccounts, ci?.[0] ?? null, m),
      medianEngagement: median(engs),
      topIds: [...list]
        .filter((r) => r.score !== null)
        .sort((a, b) => (b.score as number) - (a.score as number))
        .slice(0, 5)
        .map((r) => r.id),
    });
  }
  return out.sort((a, b) => (b.medianScore ?? -99) - (a.medianScore ?? -99));
}

export type TrendStat = {
  key: string;
  recentN: number;
  prevN: number;
  recentShare: number;
  prevShare: number;
  shareDelta: number;
  recentScore: number | null;
  prevScore: number | null;
  status: "acelerando" | "ganhando tração" | "esfriando" | "estável" | "novo";
  ids: string[];
};

/** Compara a janela recente com a anterior (mesmo tamanho). */
export function trends(rows: PatternRow[], keyOf: (r: PatternRow) => string, now: number, windowDays = 21): TrendStat[] {
  const w = windowDays * 86_400_000;
  const recent = rows.filter((r) => r.publishedAt > now - w);
  const prev = rows.filter((r) => r.publishedAt <= now - w && r.publishedAt > now - 2 * w);
  const keys = new Set([...recent, ...prev].map(keyOf));
  const out: TrendStat[] = [];
  for (const key of keys) {
    const rN = recent.filter((r) => keyOf(r) === key);
    const pN = prev.filter((r) => keyOf(r) === key);
    const rs = mean(rN.filter((r) => r.score !== null).map((r) => r.score as number));
    const ps = mean(pN.filter((r) => r.score !== null).map((r) => r.score as number));
    const recentShare = recent.length ? rN.length / recent.length : 0;
    const prevShare = prev.length ? pN.length / prev.length : 0;
    const shareDelta = recentShare - prevShare;
    let status: TrendStat["status"] = "estável";
    if (pN.length === 0 && rN.length >= 2) status = "novo";
    else if (rN.length >= 3 && rs !== null && ps !== null && rs - ps > 0.4 && shareDelta > 0) status = "acelerando";
    else if (rN.length >= 3 && (shareDelta > 0.05 || (rs !== null && ps !== null && rs - ps > 0.4))) status = "ganhando tração";
    else if (pN.length >= 3 && (shareDelta < -0.05 || (rs !== null && ps !== null && ps - rs > 0.5))) status = "esfriando";
    out.push({
      key,
      recentN: rN.length,
      prevN: pN.length,
      recentShare,
      prevShare,
      shareDelta,
      recentScore: rs,
      prevScore: ps,
      status,
      ids: rN.filter((r) => r.score !== null).sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 4).map((r) => r.id),
    });
  }
  const order = { acelerando: 0, "ganhando tração": 1, novo: 2, estável: 3, esfriando: 4 };
  return out.sort((a, b) => order[a.status] - order[b.status] || b.recentN - a.recentN);
}

/** Mapa de calor: contagem e score médio por categoria × semana. */
export function heatmap(rows: PatternRow[], keyOf: (r: PatternRow) => string, now: number, weeks = 8) {
  const weekMs = 7 * 86_400_000;
  const start = now - weeks * weekMs;
  const cells = new Map<string, { n: number; scores: number[] }>();
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.publishedAt < start) continue;
    const w = Math.min(weeks - 1, Math.floor((r.publishedAt - start) / weekMs));
    const k = keyOf(r);
    keys.add(k);
    const id = `${k}|${w}`;
    const c = cells.get(id) ?? { n: 0, scores: [] };
    c.n++;
    if (r.score !== null) c.scores.push(r.score);
    cells.set(id, c);
  }
  return {
    weeks: Array.from({ length: weeks }, (_, i) => start + i * weekMs),
    rows: [...keys].map((k) => ({
      key: k,
      cells: Array.from({ length: weeks }, (_, w) => {
        const c = cells.get(`${k}|${w}`);
        return { n: c?.n ?? 0, score: c ? mean(c.scores) : null };
      }),
    })),
  };
}

const STOP = new Set(["a", "o", "e", "de", "da", "do", "que", "pra", "para", "com", "um", "uma", "no", "na", "em", "os", "as"]);

export function normalizeHook(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/r\$\s?\d+[.,]?\d*/g, "r$ X")
    .replace(/\d+[.,]?\d*\s?%/g, "X%")
    .replace(/\d+/g, "N")
    .replace(/[^\p{L}\p{N}$%\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Frases de abertura (n-gramas iniciais) que se repetem nos vídeos de sucesso. */
export function openingPhrases(rows: PatternRow[], minHits = 2) {
  const count = (list: PatternRow[]) => {
    const m = new Map<string, Set<string>>();
    for (const r of list) {
      const words = normalizeHook(r.hookText).split(" ").filter(Boolean);
      const seen = new Set<string>();
      for (const n of [2, 3]) {
        for (let i = 0; i + n <= Math.min(words.length, 6); i++) {
          const g = words.slice(i, i + n);
          if (g.every((w) => STOP.has(w))) continue;
          const key = g.join(" ");
          if (seen.has(key)) continue;
          seen.add(key);
          const s = m.get(key) ?? new Set<string>();
          s.add(r.id);
          m.set(key, s);
        }
      }
    }
    return m;
  };
  const hits = rows.filter((r) => isHit(r.band));
  const all = count(rows);
  const good = count(hits);
  const out: { phrase: string; hits: number; total: number; hitRate: number; ids: string[] }[] = [];
  for (const [phrase, ids] of good) {
    if (ids.size < minHits) continue;
    const total = all.get(phrase)?.size ?? ids.size;
    out.push({ phrase, hits: ids.size, total, hitRate: ids.size / total, ids: [...ids].slice(0, 5) });
  }
  // n-gramas com exatamente os mesmos vídeos são a mesma frase: fica a mais longa
  const byIds = new Map<string, (typeof out)[number]>();
  for (const o of out) {
    const k = [...(good.get(o.phrase) ?? [])].sort().join(",");
    const cur = byIds.get(k);
    if (!cur || o.phrase.length > cur.phrase.length) byIds.set(k, o);
  }
  const filtered = [...byIds.values()];
  return filtered.sort((a, b) => b.hits - a.hits || b.hitRate - a.hitRate).slice(0, 12);
}

/** Assinatura de estrutura: sequência de papéis dos beats sem repetições consecutivas. */
export function structureSignature(roles: string[]) {
  const seq: string[] = [];
  for (const r of roles) if (seq[seq.length - 1] !== r) seq.push(r);
  return seq.slice(0, 6).join(" → ");
}

export type Gap = {
  dimension: "theme" | "format" | "hookType";
  key: string;
  marketShare: number;
  ownShare: number;
  marketN: number;
  ownN: number;
  medianScore: number | null;
  kind: "mercado pouco explora" | "concorrentes fazem e funciona, UseHitzz não";
  ids: string[];
};

export function gaps(rows: PatternRow[], allKeys: Record<Gap["dimension"], string[]>): Gap[] {
  const market = rows.filter((r) => r.group !== "own");
  const own = rows.filter((r) => r.group === "own");
  const overall = median(market.filter((r) => r.score !== null).map((r) => r.score as number)) ?? 0;
  const out: Gap[] = [];
  for (const dim of ["theme", "format", "hookType"] as const) {
    for (const key of allKeys[dim]) {
      if (key === "other" || key === "none") continue;
      const m = market.filter((r) => r[dim] === key);
      const o = own.filter((r) => r[dim] === key);
      const marketShare = market.length ? m.length / market.length : 0;
      const ownShare = own.length ? o.length / own.length : 0;
      const scores = m.filter((r) => r.score !== null).map((r) => r.score as number);
      const med = median(scores);
      const ids = m.filter((r) => r.score !== null).sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 3).map((r) => r.id);
      if (m.length >= 4 && med !== null && med > overall + 0.2 && ownShare < marketShare / 2) {
        out.push({ dimension: dim, key, marketShare, ownShare, marketN: m.length, ownN: o.length, medianScore: med, kind: "concorrentes fazem e funciona, UseHitzz não", ids });
      } else if (marketShare < 0.04 && (m.length === 0 || (med !== null && med >= overall))) {
        out.push({ dimension: dim, key, marketShare, ownShare, marketN: m.length, ownN: o.length, medianScore: med, kind: "mercado pouco explora", ids });
      }
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? (b.medianScore ?? -9) - (a.medianScore ?? -9) : a.kind.startsWith("concorrentes") ? -1 : 1));
}
