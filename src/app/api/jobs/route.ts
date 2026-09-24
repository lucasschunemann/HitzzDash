import { queueSummary } from "@/server/queue";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await queueSummary();
  const accounts = new Map((await db.select({ id: schema.accounts.id, handle: schema.accounts.handle }).from(schema.accounts).all()).map((a) => [a.id, a.handle]));
  const label = (j: (typeof s.active)[number]) => {
    const p = j.payload ?? {};
    if (j.type === "scrape_account") return `Coletar @${accounts.get(Number(p.accountId)) ?? "conta removida"}`;
    if (j.type === "process_video") return `Processar vídeo ${String(p.videoId).slice(-8)}`;
    if (j.type === "generate_script") return "Gerar roteiro";
    return "Resumo semanal";
  };
  const map = (j: (typeof s.active)[number]) => ({ id: j.id, type: j.type, label: label(j), status: j.status, progress: j.progress, error: j.error, attempts: j.attempts, maxAttempts: j.maxAttempts, runAfter: j.runAfter, finishedAt: j.finishedAt, videoId: j.type === "process_video" ? String(j.payload?.videoId ?? "") : null });
  return Response.json({ active: s.active.map(map), recent: s.recent.map(map), counts: s.counts });
}
