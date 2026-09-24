import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { bump } from "@/server/events";

/** Cancela um pedido de roteiro que ainda não foi atendido pelo Claude Code. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/script-requests/[id]">) {
  const id = Number((await ctx.params).id);
  await db.update(schema.scriptRequests).set({ status: "cancelled" }).where(and(eq(schema.scriptRequests.id, id), eq(schema.scriptRequests.status, "pending"))).run();
  await bump("scripts");
  return Response.json({ ok: true });
}
