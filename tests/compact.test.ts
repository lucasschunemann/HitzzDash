import { describe, it, expect } from "vitest";
import { CompactSchema, expandCompact } from "@/lib/analysis-compact";
import { AnalysisSchema } from "@/lib/analysis-schema";

const sample = {
  id: "123",
  h: ["De R$ 249 por R$ 199", "", "tênis em close girando", "price_promo", "urgency_scarcity", "strong"],
  tema: "promotion_sale",
  assunto: "Promoção do Tênis Nuvem",
  angulo: "Preço e prazo na abertura",
  formato: "product_broll",
  beats: [
    [0, 3, "hook", "preço na tela", "De R$ 249 por R$ 199", ""],
    [3, 8, "product_reveal", "giro do tênis", "", ""],
    [8, 12, "cta", "chamada final", "Link na bio", ""],
  ],
  valor: "Tênis com desconto",
  cta: ["link_bio", "Link na bio", "end"],
  moda: [["Tênis Nuvem"], "tênis", null, "R$ 199", "mid", "price_drop", "de 249 por 199", "soft", null, null],
  audio: ["music_only", "trilha"],
  prod: ["mid", "hands_only", "fast"],
  perf: ["Cedo para dizer", [], [], "após o preço"],
  conf: ["medium", "sem fala, texto legível"],
};

describe("formato compacto", () => {
  it("valida, usa padrões para listas omitidas e expande para o schema completo", () => {
    const c = CompactSchema.parse(sample);
    expect(c.gap).toEqual([]);
    const full = expandCompact(c);
    expect(AnalysisSchema.safeParse(full).success).toBe(true);
    expect(full.hook.type).toBe("price_promo");
    expect(full.onScreenText).toEqual([
      { t: 0, text: "De R$ 249 por R$ 199" },
      { t: 8, text: "Link na bio" },
    ]);
    expect(full.scenes).toHaveLength(3);
    expect(full.structureSummary).toBe("Hook → Revelação do produto → CTA");
    expect(full.fashion.offerType).toBe("price_drop");
  });
  it("rejeita enum inválido com caminho do erro", () => {
    const r = CompactSchema.safeParse({ ...sample, formato: "vlog" });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path).toEqual(["formato"]);
  });
});
