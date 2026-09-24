import { describe, it, expect } from "vitest";
import { scoreVideos, median, mad, maturityFraction, bandFor, type ScoreInput } from "@/lib/scoring";

const H = 3_600_000;
const NOW = Date.UTC(2026, 8, 20, 12);

function acct(accountId: number, viewsList: number[], opts: Partial<ScoreInput> = {}): ScoreInput[] {
  // um post a cada 3 dias, começando 3 dias atrás (todos maduros)
  return viewsList.map((views, i) => ({
    id: `${accountId}-${i}`,
    accountId,
    publishedAt: NOW - (i + 1) * 72 * H,
    views,
    likes: Math.round(views * 0.05),
    comments: Math.round(views * 0.002),
    followers: 50_000,
    ...opts,
  }));
}

describe("estatística básica", () => {
  it("mediana e MAD", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
  });
  it("curva de maturação é crescente e satura em 1", () => {
    expect(maturityFraction(1)).toBeLessThan(maturityFraction(12));
    expect(maturityFraction(12)).toBeLessThan(maturityFraction(48));
    expect(maturityFraction(24 * 30)).toBeCloseTo(1, 5);
  });
  it("faixas exigem razão mínima", () => {
    expect(bandFor(3, 1.5)).toBe("above"); // z alto, mas razão < 2× não vira breakout
    expect(bandFor(3, 4)).toBe("breakout");
    expect(bandFor(-1, 0.5)).toBe("below");
    expect(bandFor(0.2, 1.1)).toBe("normal");
  });
});

describe("scoreVideos", () => {
  it("usa mediana (um viral não distorce a base)", () => {
    const vids = acct(1, [10_000, 11_000, 9_000, 10_500, 9_500, 500_000, 10_200]);
    const r = scoreVideos(vids, { now: NOW });
    const normal = r.get("1-0")!;
    // sem o viral a mediana é ~10k; com média seria ~80k e tudo pareceria "abaixo"
    expect(normal.baselineMedian).toBeGreaterThan(9_000);
    expect(normal.baselineMedian).toBeLessThan(11_000);
    expect(normal.band).toBe("normal");
    const viral = r.get("1-5")!;
    expect(viral.band).toBe("breakout");
    expect(viral.ratio!).toBeGreaterThan(40);
  });

  it("leave-one-out: o vídeo não entra na própria base", () => {
    const vids = acct(1, [1000, 1000, 1000, 1000, 1000, 1000]);
    const r = scoreVideos(vids, { now: NOW });
    expect(r.get("1-0")!.baselineN).toBe(5);
  });

  it("normaliza entre contas pelo tamanho relativo, não absoluto", () => {
    const small = acct(1, [1_000, 1_100, 900, 1_050, 950, 3_000]);
    const big = acct(2, [100_000, 110_000, 90_000, 105_000, 95_000, 300_000]);
    const r = scoreVideos([...small, ...big], { now: NOW });
    expect(r.get("1-5")!.score!).toBeCloseTo(r.get("2-5")!.score!, 5);
  });

  it("vídeo com menos de 48h não é penalizado", () => {
    const vids = acct(1, [10_000, 10_000, 10_000, 10_000, 10_000, 10_000]);
    vids.push({ id: "young", accountId: 1, publishedAt: NOW - 6 * H, views: 3_000, likes: 150, comments: 5, followers: 50_000 });
    const r = scoreVideos(vids, { now: NOW });
    const y = r.get("young")!;
    expect(y.maturing).toBe(true);
    expect(y.band).toBe("maturing");
    expect(y.adjustedMetric!).toBeGreaterThan(3_000);
    expect(y.explanation.join(" ")).toMatch(/projeta/);
  });

  it("vídeo jovem já acima da média é marcado como outlier projetado", () => {
    const vids = acct(1, [10_000, 10_000, 10_000, 10_000, 10_000, 10_000]);
    vids.push({ id: "young", accountId: 1, publishedAt: NOW - 12 * H, views: 40_000, likes: 2000, comments: 50 });
    const r = scoreVideos(vids, { now: NOW });
    expect(r.get("young")!.band).toBe("breakout");
    expect(r.get("young")!.maturing).toBe(true);
  });

  it("fixados e patrocinados ficam fora da linha de base e são sinalizados", () => {
    const vids = acct(1, [10_000, 10_000, 10_000, 10_000, 10_000]);
    vids.push({ id: "pin", accountId: 1, publishedAt: NOW - 400 * H, views: 2_000_000, likes: 1, comments: 1, isPinned: true });
    vids.push({ id: "ad", accountId: 1, publishedAt: NOW - 500 * H, views: 900_000, likes: 1, comments: 1, isSponsored: true });
    const r = scoreVideos(vids, { now: NOW });
    expect(r.get("1-0")!.baselineMedian).toBe(10_000);
    expect(r.get("pin")!.flags).toContain("pinned");
    expect(r.get("ad")!.flags).toContain("sponsored");
  });

  it("usa engajamento quando o Instagram oculta as views", () => {
    const vids: ScoreInput[] = [0, 1, 2, 3, 4, 5].map((i) => ({
      id: `h${i}`,
      accountId: 7,
      publishedAt: NOW - (i + 3) * 24 * H,
      views: null,
      likes: i === 0 ? 5_000 : 1_000,
      comments: 20,
    }));
    const r = scoreVideos(vids, { now: NOW });
    const top = r.get("h0")!;
    expect(top.basis).toBe("engagement");
    expect(top.flags).toContain("views_hidden");
    expect(top.band === "above" || top.band === "breakout").toBe(true);
  });

  it("vídeo individual com views ocultas cai para engajamento", () => {
    const vids = acct(1, [10_000, 10_000, 10_000, 10_000, 10_000, 10_000]);
    vids[0] = { ...vids[0], views: 0, likes: 500 };
    const r = scoreVideos(vids, { now: NOW });
    expect(r.get("1-0")!.basis).toBe("engagement");
  });

  it("sinaliza linha de base pequena", () => {
    const r = scoreVideos(acct(1, [1000, 2000, 3000]), { now: NOW });
    expect(r.get("1-0")!.flags).toContain("small_baseline");
  });

  it("conta sem base madura: sem score, sem quebrar", () => {
    const r = scoreVideos([{ id: "x", accountId: 1, publishedAt: NOW - H, views: 100, likes: 1, comments: 0 }], { now: NOW });
    expect(r.get("x")!.score).toBeNull();
    expect(r.get("x")!.band).toBe("maturing");
  });

  it("métricas secundárias", () => {
    const r = scoreVideos(acct(1, [10_000, 10_000, 10_000, 10_000, 10_000, 10_000]), { now: NOW });
    const s = r.get("1-0")!.secondary;
    expect(s.engagementRate).toBeCloseTo(0.052, 3);
    expect(s.viewsPerFollower).toBeCloseTo(0.2, 3);
    expect(s.commentsPerLike).toBeCloseTo(0.04, 3);
  });

  it("respeita o N da linha de base", () => {
    const old = acct(1, Array.from({ length: 40 }, (_, i) => (i < 10 ? 1_000 : 100_000)));
    const r = scoreVideos(old, { now: NOW, baselineN: 10 });
    // só as 10 mais recentes (1k) formam a base
    expect(r.get("1-0")!.baselineMedian).toBe(1_000);
  });
});
