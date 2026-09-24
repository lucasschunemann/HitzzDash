import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { enqueue } from "@/server/queue";
import { getScript, generateScript, type Plan, type ScriptInput } from "@/server/scriptgen";
import { TONES } from "@/lib/taxonomy";
import { analyzerMode } from "@/server/env";
import { createScriptRequest } from "@/server/claude-code";
import { ownerOnly } from "@/server/role";

/**
 * Variações de um roteiro:
 *  - regenerate: mesmo pedido, nova estratégia e novo texto
 *  - alternative: outro caminho (evita tema/hook já usados nesta família de roteiros)
 *  - tone: mantém a estratégia e reescreve só o texto com outro tom
 */
export async function POST(req: Request, ctx: RouteContext<"/api/scripts/[id]/variant">) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const b = (await req.json().catch(() => ({}))) as { kind?: "regenerate" | "alternative" | "tone"; tone?: string };
  const base = await getScript(id);
  if (!base) return Response.json({ error: "Roteiro não encontrado" }, { status: 404 });
  const input = { ...(base.input as ScriptInput) };
  const rootId = base.parentId ?? base.id;
  let reusePlanOf: number | undefined;
  if (b.kind === "alternative") {
    const family = (await db.select().from(schema.scripts).all()).filter((s) => s.id === rootId || s.parentId === rootId);
    input.avoid = family.map((s) => {
      const p = s.plan as Plan | null;
      return { theme: p?.chosen.theme, hookType: p?.chosen.hookType, topic: p?.chosen.topic };
    });
  } else if (b.kind === "tone") {
    if (!b.tone || !(b.tone in TONES)) return Response.json({ error: "Tom inválido" }, { status: 400 });
    input.tone = b.tone as ScriptInput["tone"];
    reusePlanOf = base.id;
  }
  void eq;
  if (analyzerMode() === "claude_code" && base.generator !== "heuristic") {
    const r = await createScriptRequest(input, { kind: b.kind ?? "regenerate", parentId: rootId, reusePlanOf: reusePlanOf ?? null });
    return Response.json({ ok: true, requestId: r.id });
  }
  if (base.generator === "heuristic") {
    const reuse = reusePlanOf ? ((await getScript(reusePlanOf))?.plan as Plan | undefined) : undefined;
    const row = await generateScript(input, { parentId: rootId, reusePlan: reuse ?? null, heuristic: true });
    return Response.json({ ok: true, scriptId: row.id });
  }
  const job = await enqueue("generate_script", `script:${id}:${b.kind}:${Date.now()}`, { input, parentId: rootId, reusePlanOf, heuristic: base.generator === "heuristic" }, { maxAttempts: 2 });
  return Response.json({ ok: true, jobId: job.id });
}
