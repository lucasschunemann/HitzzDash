import { desc, eq, gte, inArray, and, sql, isNotNull, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { latestChange } from "@/server/events";
import { getSettings } from "@/server/settings";
import { isWorkerHost } from "@/server/host";

export const dynamic = "force-dynamic";

export async function GET() {
  const running = await db.select().from(schema.jobs).where(eq(schema.jobs.status, "running")).all();
  const queued = (await db.select({ n: sql<number>`count(*)` }).from(schema.jobs).where(eq(schema.jobs.status, "queued")).get())?.n ?? 0;
  const failed24h =
    (await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.status, "failed"), gte(schema.jobs.finishedAt, Date.now() - 86_400_000)))
      .get())?.n ?? 0;
  const accounts = new Map((await db.select({ id: schema.accounts.id, handle: schema.accounts.handle }).from(schema.accounts).all()).map((a) => [a.id, a.handle]));
  const lastScrape = (await db.select({ t: max(schema.accounts.lastScrapedAt) }).from(schema.accounts).where(isNotNull(schema.accounts.lastScrapedAt)).get())?.t ?? null;
  const notifications = await db.select().from(schema.notifications).orderBy(desc(schema.notifications.id)).limit(20).all();
  const unread = notifications.filter((n) => !n.read).length;
  const label = (j: (typeof running)[number]) => {
    const p = j.payload ?? {};
    if (j.type === "scrape_account") return `Coletando @${accounts.get(Number(p.accountId)) ?? "?"}`;
    if (j.type === "process_video") return `Processando vídeo`;
    return "Resumo semanal";
  };
  void inArray;
  return Response.json({
    running: running.map((j) => ({ id: j.id, type: j.type, key: j.key, progress: j.progress, label: label(j) })),
    queued,
    failed24h,
    lastScrape,
    unread,
    notifications,
    version: (await latestChange())?.id ?? 0,
    workerHost: isWorkerHost(),
    workerLastSeenAt: (await getSettings()).workerLastSeenAt || null,
  });
}
