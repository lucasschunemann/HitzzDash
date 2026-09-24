import { normalizeHook } from "./patterns";

type ScriptText = { onScreenHook: string; spokenHook: string; scenes: { onScreenText: string; speech: string }[] };

/** Similaridade (trigramas de palavras) entre o hook gerado e hooks existentes: garante originalidade. */
export function originality(script: ScriptText, rows: { id: string; hookText: string | null }[]) {
  // Trigramas de palavras, ignorando os que são só estrutura de preço/número ("de r$ X por r$ X"),
  // que coincidem em qualquer promoção sem indicar cópia.
  const STRUCT = new Set(["X", "N", "r$", "X%", "de", "por", "e", "a", "o", "no", "na", "com", "pra", "para"]);
  const tri = (t: string) => {
    const w = normalizeHook(t).split(" ").filter(Boolean);
    const s = new Set<string>();
    for (let i = 0; i + 2 < w.length; i++) {
      const g = w.slice(i, i + 3);
      if (g.filter((x) => !STRUCT.has(x)).length < 2) continue;
      s.add(g.join(" "));
    }
    return s;
  };
  const mine = tri([script.onScreenHook, script.spokenHook, ...script.scenes.map((s) => `${s.onScreenText} ${s.speech}`)].join(" "));
  let max = 0;
  let closest: string | null = null;
  for (const r of rows) {
    if (!r.hookText) continue;
    const other = tri(r.hookText);
    if (other.size < 2 || !mine.size) continue;
    const inter = [...other].filter((x) => mine.has(x)).length;
    const sim = inter / other.size;
    if (sim > max) {
      max = sim;
      closest = r.id;
    }
  }
  return { maxSimilarity: max, closestId: closest, ok: max < 0.6 };
}
