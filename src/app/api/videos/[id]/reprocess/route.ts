import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { enqueue } from "@/server/queue";
import { ensureProcessingRow } from "@/server/pipeline";
import { hasKey } from "@/server/env";
import { ownerOnly } from "@/server/role";

/** Reprocessa um vídeo: retoma etapas pendentes/falhas; com {analysis: true} força nova análise. */
export async function POST(req: Request, ctx: RouteContext<"/api/videos/[id]/reprocess">) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const { id: raw } = await ctx.params;
  const id = decodeURIComponent(raw);
  const body = (await req.json().catch(() => ({}))) as { analysis?: boolean };
  const v = await db.select().from(schema.videos).where(eq(schema.videos.id, id)).get();
  if (!v) return Response.json({ error: "Vídeo não encontrado" }, { status: 404 });
  if (v.isDemo) return Response.json({ error: "Vídeos de demonstração não têm mídia real para processar." }, { status: 400 });
  if (body.analysis && !hasKey("anthropic")) return Response.json({ error: "Configure ANTHROPIC_API_KEY para reanalisar." }, { status: 400 });
  await ensureProcessingRow(id);
  // etapas com falha voltam para pendente
  const p = (await db.select().from(schema.processing).where(eq(schema.processing.videoId, id)).get())!;
  const reset = Object.fromEntries((["media", "transcript", "frames", "analysis"] as const).filter((k) => p[k] === "failed" || p[k] === "blocked").map((k) => [k, "pending"]));
  if (Object.keys(reset).length) await db.update(schema.processing).set(reset).where(eq(schema.processing.videoId, id)).run();
  const job = await enqueue("process_video", `process:${id}`, { videoId: id, forceAnalysis: Boolean(body.analysis) });
  return Response.json({ ok: true, jobId: job.id });
}
