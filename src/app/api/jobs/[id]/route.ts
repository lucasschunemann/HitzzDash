import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { retryJob, cancelQueued } from "@/server/queue";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const id = Number((await ctx.params).id);
  const job = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
  if (!job) return Response.json({ error: "Job não encontrado" }, { status: 404 });
  return Response.json(job);
}

export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const id = Number((await ctx.params).id);
  const b = (await req.json().catch(() => ({}))) as { action?: "retry" | "cancel" };
  if (b.action === "cancel") await cancelQueued(id);
  else await retryJob(id);
  return Response.json({ ok: true });
}
