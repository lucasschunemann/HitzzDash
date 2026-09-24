import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { scrapeAccount } from "@/server/boot";
import { hasKey } from "@/server/env";
import { isWorkerHost } from "@/server/host";
import { ownerOnly } from "@/server/role";

export async function POST(_req: Request, ctx: RouteContext<"/api/accounts/[id]/scrape">) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const acc = await db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get();
  if (!acc) return Response.json({ error: "Conta não encontrada" }, { status: 404 });
  if (isWorkerHost() && !hasKey("apify")) return Response.json({ error: "Configure APIFY_TOKEN no .env para coletar dados reais." }, { status: 400 });
  const job = await scrapeAccount(id);
  return Response.json({ ok: true, jobId: job.id, handle: acc.handle, message: isWorkerHost() ? `Coleta de @${acc.handle} na fila` : `Coleta de @${acc.handle} na fila: roda na próxima vez que o Mac processar` });
}
