import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getVideoDetail } from "@/server/detail";
import { HOOK_TYPES } from "@/lib/taxonomy";
import { bump } from "@/server/events";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/videos/[id]">) {
  const { id } = await ctx.params;
  const d = await getVideoDetail(decodeURIComponent(id));
  if (!d) return Response.json({ error: "Vídeo não encontrado" }, { status: 404 });
  return Response.json(d);
}

/** Reclassificação manual do tipo de hook (null volta para a classificação automática). */
export async function PATCH(req: Request, ctx: RouteContext<"/api/videos/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { hookType?: string | null };
  const hook = body.hookType ?? null;
  if (hook !== null && !(hook in HOOK_TYPES)) return Response.json({ error: "Tipo de hook inválido" }, { status: 400 });
  const res = await db.update(schema.analyses).set({ hookTypeManual: hook }).where(eq(schema.analyses.videoId, decodeURIComponent(id))).run();
  if (!res.rowsAffected) return Response.json({ error: "Vídeo ainda não analisado" }, { status: 409 });
  await bump("videos");
  return Response.json({ ok: true });
}
