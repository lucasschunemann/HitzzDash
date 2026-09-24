import { describe, it, expect } from "vitest";
import { groupStats, trends, evidenceLevel, bootstrapCI, openingPhrases, structureSignature, normalizeHook, gaps, type PatternRow } from "@/lib/patterns";

const D = 86_400_000;
const NOW = Date.UTC(2026, 8, 20);
let seq = 0;
function row(p: Partial<PatternRow>): PatternRow {
  seq++;
  return {
    id: `v${seq}`, accountId: 1, handle: "a", group: "competitor", publishedAt: NOW - 5 * D,
    score: 0, band: "normal", ratio: 1, views: 1000, engagementRate: 0.05, commentsPerView: 0.001,
    hookType: "pov", format: "try_on", theme: "new_collection", ctaType: "link_bio", offerType: "none",
    hookText: "", beatRoles: [], ...p,
  };
}

describe("evidência", () => {
  it("amostra pequena é anedótica", () => {
    expect(evidenceLevel(3, 3, 0.5, 1)).toBe("anedótica");
    expect(evidenceLevel(10, 1, 0.5, 1)).toBe("anedótica");
  });
  it("forte exige n, contas e IC acima de zero", () => {
    expect(evidenceLevel(15, 4, 0.3, 1)).toBe("forte");
    expect(evidenceLevel(15, 2, 0.3, 1)).toBe("moderada");
    expect(evidenceLevel(8, 3, -0.6, 0.1)).toBe("fraca");
  });
  it("bootstrap é determinístico", () => {
    const xs = [1, 2, 3, 4, 5, 6];
    expect(bootstrapCI(xs)).toEqual(bootstrapCI(xs));
    const [lo, hi] = bootstrapCI(xs)!;
    expect(lo).toBeLessThan(3.5);
    expect(hi).toBeGreaterThan(3.5);
  });
});

describe("groupStats", () => {
  it("ranqueia categorias pela mediana e calcula lift", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => row({ hookType: "price_promo", score: 1.5 + (i % 3) * 0.1, band: "above", accountId: (i % 3) + 1 })),
      ...Array.from({ length: 8 }, (_, i) => row({ hookType: "pov", score: -0.5 + (i % 2) * 0.1, band: "normal", accountId: (i % 2) + 1 })),
    ];
    const g = groupStats(rows, (r) => r.hookType);
    expect(g[0].key).toBe("price_promo");
    expect(g[0].lift!).toBeGreaterThan(0);
    expect(g[0].hitRate).toBe(1);
    expect(g[0].nAccounts).toBe(3);
    expect(g[1].lift!).toBeLessThan(0);
  });
});

describe("trends", () => {
  it("detecta tema acelerando", () => {
    const rows = [
      ...Array.from({ length: 4 }, () => row({ theme: "promo_trip_event", publishedAt: NOW - 30 * D, score: -0.2 })),
      ...Array.from({ length: 8 }, () => row({ theme: "new_collection", publishedAt: NOW - 30 * D, score: 0 })),
      ...Array.from({ length: 6 }, () => row({ theme: "promo_trip_event", publishedAt: NOW - 5 * D, score: 1.2 })),
      ...Array.from({ length: 4 }, () => row({ theme: "new_collection", publishedAt: NOW - 5 * D, score: 0 })),
    ];
    const t = trends(rows, (r) => r.theme, NOW);
    const trip = t.find((x) => x.key === "promo_trip_event")!;
    expect(trip.status).toBe("acelerando");
    expect(t[0].key).toBe("promo_trip_event");
    expect(t.find((x) => x.key === "new_collection")!.status).toBe("esfriando");
  });
});

describe("texto e estrutura", () => {
  it("normaliza preços e números no hook", () => {
    expect(normalizeHook("De R$ 299 por R$199!!")).toBe("de r$ X por r$ X");
    expect(normalizeHook("Só HOJE 30% off")).toBe("so hoje X% off");
  });
  it("frases de abertura recorrentes em vídeos de sucesso", () => {
    const rows = [
      row({ hookText: "Últimas unidades do tênis X", band: "breakout" }),
      row({ hookText: "Últimas unidades da bota", band: "above" }),
      row({ hookText: "Últimas unidades e acabou", band: "normal" }),
      row({ hookText: "Olha esse lançamento", band: "above" }),
    ];
    const p = openingPhrases(rows);
    expect(p[0].phrase).toBe("ultimas unidades");
    expect(p[0].hits).toBe(2);
    expect(p[0].total).toBe(3);
  });
  it("assinatura de estrutura remove repetição consecutiva", () => {
    expect(structureSignature(["hook", "product_reveal", "product_reveal", "offer", "cta"])).toBe("hook → product_reveal → offer → cta");
  });
});

describe("lacunas", () => {
  it("encontra o que funciona no mercado e a conta própria não faz", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => row({ theme: "comfort_quality", score: 1.5, accountId: i % 3 })),
      ...Array.from({ length: 20 }, () => row({ theme: "new_collection", score: 0 })),
      ...Array.from({ length: 6 }, () => row({ theme: "new_collection", group: "own", accountId: 9 })),
    ];
    const g = gaps(rows, { theme: ["comfort_quality", "new_collection", "brand_values"], format: [], hookType: [] });
    expect(g[0].key).toBe("comfort_quality");
    expect(g[0].kind).toMatch(/UseHitzz não/);
    expect(g.find((x) => x.key === "brand_values")?.kind).toBe("mercado pouco explora");
  });
});

import { originality } from "@/lib/originality";

describe("originalidade do roteiro", () => {
  const rows = [
    { id: "a", hookText: "Últimas unidades do Bota Serra" },
    { id: "b", hookText: "De R$ 249 por R$ 192" },
  ];
  const script = (hook: string) => ({ onScreenHook: hook, spokenHook: "", scenes: [{ onScreenText: "Chama no WhatsApp", speech: "" }] });
  it("estrutura de preço igual não conta como cópia", () => {
    expect(originality(script("De R$ 249 por R$ 199 até domingo"), rows).ok).toBe(true);
  });
  it("hook copiado é detectado", () => {
    const r = originality(script("Últimas unidades do Bota Serra, corre"), rows);
    expect(r.ok).toBe(false);
    expect(r.closestId).toBe("a");
  });
});
