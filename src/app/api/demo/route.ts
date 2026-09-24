import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { removeDemoVideos } from "@/server/boot";
import { seedDemo } from "@/server/seed";
import { bump } from "@/server/events";

/** Remove ou restaura os dados de demonstração. Nunca mexe em vídeos reais. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { action?: "remove" | "restore" };
  if (b.action === "remove") {
    const n = await removeDemoVideos();
    // contas que só tinham demo continuam cadastradas (são handles reais), mas deixam de ser "só demo"
    await db.update(schema.accounts).set({ isDemo: false }).where(eq(schema.accounts.isDemo, true)).run();
    await db.delete(schema.digests).where(eq(schema.digests.generator, "demo")).run();
    await bump("accounts");
    return Response.json({ ok: true, removed: n });
  }
  if (b.action === "restore") {
    await removeDemoVideos();
    // só recebem demo contas sem nenhum vídeo real
    const accs = await db.select().from(schema.accounts).all();
    const withReal = new Set((await db.select({ a: schema.videos.accountId }).from(schema.videos).all()).map((r) => r.a));
    for (const a of accs) if (!withReal.has(a.id)) await db.update(schema.accounts).set({ isDemo: true }).where(eq(schema.accounts.id, a.id)).run();
    await seedDemo();
    await bump("videos");
    await bump("accounts");
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Ação inválida" }, { status: 400 });
}
