/**
 * Score de outlier por vídeo.
 *
 * Ideia: comparar cada vídeo com a MEDIANA das últimas N publicações maduras da própria conta
 * (mediana para que um viral não distorça a base), em escala logarítmica, e normalizar pela
 * dispersão típica da conta (MAD dos logs) para que contas "estáveis" e "voláteis" fiquem
 * na mesma régua.
 *
 *   ratio  = métrica ajustada / mediana da conta
 *   z      = log2(ratio) / σ_conta        (σ = 1,4826 × MAD de log2, limitado a [0,5; 1,5])
 *
 * Faixas: z < -0,75 abaixo · < 0,75 normal · < 1,75 acima · ≥ 1,75 breakout
 * (breakout também exige ratio ≥ 2×; "acima" exige ratio ≥ 1,3×).
 */

export const DEFAULTS = {
  baselineN: 30,
  matureHours: 48,
  /** Constante de tempo (h) da curva de maturação: fração esperada = 1 − e^(−idade/τ). */
  tauHours: 24,
  minBaseline: 5,
  sigmaMin: 0.5,
  sigmaMax: 1.5,
};

export type ScoreInput = {
  id: string;
  accountId: number;
  publishedAt: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  followers?: number | null;
  isPinned?: boolean;
  isSponsored?: boolean;
};

export type Band = "below" | "normal" | "above" | "breakout" | "maturing";
export type Basis = "views" | "engagement";

export const BAND_LABEL: Record<Band, string> = {
  below: "Abaixo do normal",
  normal: "Normal",
  above: "Acima",
  breakout: "Breakout",
  maturing: "Ainda maturando",
};

export type ScoreResult = {
  id: string;
  basis: Basis;
  metric: number | null;
  adjustedMetric: number | null;
  baselineMedian: number | null;
  baselineN: number;
  ratio: number | null;
  log2Ratio: number | null;
  sigma: number | null;
  score: number | null;
  band: Band | null;
  maturing: boolean;
  ageHours: number;
  maturity: number;
  flags: string[];
  secondary: {
    engagementRate: number | null;
    commentsPerLike: number | null;
    viewsPerFollower: number | null;
  };
  explanation: string[];
};

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mad(xs: number[]): number | null {
  const m = median(xs);
  if (m === null) return null;
  return median(xs.map((x) => Math.abs(x - m)));
}

export function maturityFraction(ageHours: number, tauHours = DEFAULTS.tauHours) {
  if (ageHours <= 0) return 0.05;
  return Math.max(0.05, 1 - Math.exp(-ageHours / tauHours));
}

export function viewsHidden(v: Pick<ScoreInput, "views" | "likes">) {
  return v.views === null || v.views === undefined || (v.views === 0 && (v.likes ?? 0) > 0);
}

function engagement(v: ScoreInput) {
  return (v.likes ?? 0) + (v.comments ?? 0);
}

function metricFor(v: ScoreInput, basis: Basis): number | null {
  if (basis === "views") return viewsHidden(v) ? null : (v.views as number);
  const e = engagement(v);
  return e > 0 || v.likes !== null ? e : null;
}

export function bandFor(score: number, ratio: number): Exclude<Band, "maturing"> {
  if (score >= 1.75 && ratio >= 2) return "breakout";
  if (score >= 0.75 && ratio >= 1.3) return "above";
  if (score < -0.75) return "below";
  return "normal";
}

const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: n < 10 ? 2 : 0 }).format(n);

/** Calcula o score de todos os vídeos de uma vez (agrupa por conta internamente). */
export function scoreVideos(
  videos: ScoreInput[],
  opts: Partial<typeof DEFAULTS> & { now?: number } = {},
): Map<string, ScoreResult> {
  const o = { ...DEFAULTS, ...opts };
  const now = opts.now ?? Date.now();
  const out = new Map<string, ScoreResult>();

  const byAccount = new Map<number, ScoreInput[]>();
  for (const v of videos) {
    const arr = byAccount.get(v.accountId) ?? [];
    arr.push(v);
    byAccount.set(v.accountId, arr);
  }

  for (const list of byAccount.values()) {
    const ageH = (v: ScoreInput) => (now - v.publishedAt) / 3_600_000;
    // Pool da linha de base: posts maduros, não fixados, não patrocinados, mais recentes primeiro.
    const pool = list
      .filter((v) => !v.isPinned && !v.isSponsored && ageH(v) >= o.matureHours)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, o.baselineN);

    const poolViews = pool.filter((v) => !viewsHidden(v));
    // Base em views quando a conta tem views visíveis suficientes; senão, engajamento.
    const accountBasis: Basis = poolViews.length >= Math.min(3, pool.length) && poolViews.length > 0 ? "views" : "engagement";

    for (const v of list) {
      const flags: string[] = [];
      const explanation: string[] = [];
      let basis: Basis = accountBasis;
      if (basis === "views" && viewsHidden(v)) {
        basis = "engagement";
        flags.push("views_hidden");
      } else if (accountBasis === "engagement") {
        flags.push("views_hidden");
      }
      if (v.isPinned) flags.push("pinned");
      if (v.isSponsored) flags.push("sponsored");

      // Leave-one-out: o próprio vídeo nunca entra na sua linha de base.
      const base = pool.filter((p) => p.id !== v.id);
      const baseMetrics = base.map((p) => metricFor(p, basis)).filter((x): x is number => x !== null && x > 0);
      const baselineMedian = median(baseMetrics);
      const logs = baseMetrics.map((x) => Math.log2(x));
      const rawSigma = logs.length >= 3 ? 1.4826 * (mad(logs) as number) : null;
      const sigma = rawSigma === null ? 1 : Math.min(o.sigmaMax, Math.max(o.sigmaMin, rawSigma));

      const age = ageH(v);
      const maturing = age < o.matureHours;
      const maturity = maturing ? maturityFraction(age, o.tauHours) : 1;
      const metric = metricFor(v, basis);
      const adjusted = metric === null ? null : metric / maturity;

      const views = viewsHidden(v) ? null : (v.views as number);
      const secondary = {
        engagementRate: views ? engagement(v) / views : null,
        commentsPerLike: v.likes ? (v.comments ?? 0) / v.likes : null,
        viewsPerFollower: views && v.followers ? views / v.followers : null,
      };

      if (baseMetrics.length < o.minBaseline) flags.push("small_baseline");

      let ratio: number | null = null;
      let log2Ratio: number | null = null;
      let score: number | null = null;
      let band: Band | null = null;

      const metricName = basis === "views" ? "views" : "engajamento (curtidas + comentários)";
      if (basis === "engagement") explanation.push("O Instagram ocultou as views; usamos engajamento como métrica substituta.");

      if (adjusted !== null && baselineMedian && baselineMedian > 0) {
        ratio = Math.max(adjusted, 1) / baselineMedian;
        log2Ratio = Math.log2(ratio);
        score = log2Ratio / sigma;
        const b = bandFor(score, ratio);
        // Vídeo jovem não é penalizado: se a projeção está abaixo/na média, fica "maturando".
        // Nas primeiras 12h a projeção é ruidosa: só sinalizamos se já for breakout.
        const tooEarly = age < 12 && b !== "breakout";
        band = maturing && (b === "below" || b === "normal" || tooEarly) ? "maturing" : b;
        if (maturing) flags.push("projected");

        explanation.push(
          `Linha de base: mediana de ${metricName} das últimas ${baseMetrics.length} publicações maduras da conta (sem fixados/patrocinados e sem este vídeo) = ${fmt(baselineMedian)}.`,
        );
        if (maturing) {
          explanation.push(
            `Publicado há ${fmt(age)}h (< ${o.matureHours}h). Pela curva de maturação, deveria ter ~${Math.round(maturity * 100)}% do alcance final; ${fmt(metric as number)} projeta ${fmt(adjusted)}.`,
          );
        } else {
          explanation.push(`${metricName[0].toUpperCase() + metricName.slice(1)} do vídeo: ${fmt(metric as number)}.`);
        }
        explanation.push(`Razão = ${fmt(adjusted)} ÷ ${fmt(baselineMedian)} = ${fmt(ratio)}× (log₂ = ${log2Ratio.toFixed(2)}).`);
        explanation.push(
          rawSigma === null
            ? `Dispersão da conta indisponível (poucos posts); usamos σ = 1.`
            : `Dispersão típica da conta σ = 1,4826 × MAD(log₂) = ${rawSigma.toFixed(2)}${rawSigma !== sigma ? ` (limitada a ${sigma.toFixed(2)})` : ""}.`,
        );
        explanation.push(`Score = log₂(razão) ÷ σ = ${score.toFixed(2)} → ${BAND_LABEL[band]}.`);
      } else {
        explanation.push(
          baselineMedian ? "Sem métrica disponível para este vídeo." : "A conta ainda não tem publicações maduras suficientes para formar uma linha de base.",
        );
        if (maturing) band = "maturing";
      }
      if (flags.includes("small_baseline")) explanation.push(`Atenção: linha de base com só ${baseMetrics.length} vídeos; trate o score como indicativo.`);
      if (v.isPinned) explanation.push("Post fixado: fica fora da linha de base (fixar infla views).");
      if (v.isSponsored) explanation.push("Parceria paga: fica fora da linha de base (alcance pode ser impulsionado).");

      out.set(v.id, {
        id: v.id,
        basis,
        metric,
        adjustedMetric: adjusted,
        baselineMedian,
        baselineN: baseMetrics.length,
        ratio,
        log2Ratio,
        sigma: baselineMedian ? sigma : null,
        score,
        band,
        maturing,
        ageHours: age,
        maturity,
        flags,
        secondary,
        explanation,
      });
    }
  }
  return out;
}

/** Score usado para agregações: ignora vídeos sem score e trata "maturando" pelo valor projetado. */
export function usableScore(r: ScoreResult | undefined) {
  if (!r || r.score === null) return null;
  return r.score;
}
