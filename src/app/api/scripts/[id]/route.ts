import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { bump } from "@/server/events";
import { ownerOnly } from "@/server/role";

export async function PATCH(req: Request, ctx: RouteContext<"/api/scripts/[id]">) {
  const id = Number((await ctx.params).id);
  const b = (await req.json().catch(() => ({}))) as { favorite?: boolean; title?: string };
  const patch: { favorite?: boolean; title?: string } = {};
  if (typeof b.favorite === "boolean") patch.favorite = b.favorite;
  if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim().slice(0, 140);
  const r = await db.update(schema.scripts).set(patch).where(eq(schema.scripts.id, id)).run();
  if (!r.rowsAffected) return Response.json({ error: "Roteiro não encontrado" }, { status: 404 });
  await bump("scripts");
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/scripts/[id]">) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  await db.delete(schema.scripts).where(eq(schema.scripts.id, id)).run();
  await bump("scripts");
  return Response.json({ ok: true });
}
