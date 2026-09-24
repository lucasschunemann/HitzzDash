import { and, eq, gte, inArray, ne, desc } from "drizzle-orm";
import { db, schema, migrateDb } from "@/db";
import { registerHandler, startWorker, enqueue, setJobResult, requeueStale } from "./queue";
import { generateScript, getScript, type ScriptInput, type Plan } from "./scriptgen";
import { collectAccount } from "./collect";
import { processVideo, cleanupVideos } from "./pipeline";
import { generateDigest } from "./digest";
import { getSettings, setSettings } from "./settings";
import { hasKey, transcriberMode, analyzerMode } from "./env";
import { hasWhisper } from "./whisper";
import { seedIfEmpty } from "./seed";
import { bump } from "./events";

const g = globalThis as unknown as { __hitzzBooted?: boolean; __hitzzScheduler?: NodeJS.Timeout };

/** Enfileira o processamento de vídeos com etapas pendentes (ou que falharam). */
export async function enqueuePendingProcessing(opts: { accountId?: number; batchId?: string; includeFailed?: boolean } = {}) {
  const rows = await db.select().from(schema.processing).all();
  const vids = new Map((await db.select({ id: schema.videos.id, accountId: schema.videos.accountId, isDemo: schema.videos.isDemo }).from(schema.videos).all()).map((v) => [v.id, v]));
  const statuses = new Set(["pending", "blocked", "external", ...(opts.includeFailed ? ["failed"] : [])]);
  const canTranscribe = transcriberMode() === "elevenlabs" ? hasKey("elevenlabs") : await hasWhisper();
  const canAnalyze = analyzerMode() === "api" && hasKey("anthropic");
  let n = 0;
  for (const p of rows) {
    const v = vids.get(p.videoId);
    if (!v || v.isDemo) continue;
    if (opts.accountId && v.accountId !== opts.accountId) continue;
    const stages = { media: p.media, transcript: p.transcript, frames: p.frames, analysis: p.analysis };
    const actionable = Object.entries(stages).filter(([k, st]) => {
      if (!statuses.has(st)) return false;
      if (st === "external") return canAnalyze;
      if (st !== "blocked") return true;
      if (k === "transcript") return canTranscribe;
      if (k === "analysis") return canAnalyze;
      return true;
    });
    if (!actionable.length) continue;
    await enqueue("process_video", `process:${p.videoId}`, { videoId: p.videoId }, { batchId: opts.batchId });
    n++;
  }
  return n;
}

export async function scrapeAccount(accountId: number, batchId?: string) {
  return await enqueue("scrape_account", `scrape:${accountId}`, { accountId }, { batchId: batchId ?? `acc-${accountId}-${Date.now()}` });
}

export async function refreshAll(reason = "manual") {
  const batchId = `${reason}-${Date.now()}`;
  const accs = await db.select().from(schema.accounts).where(eq(schema.accounts.active, true)).all();
  for (const a of accs) await scrapeAccount(a.id, batchId);
  return { batchId, accounts: accs.length };
}

export function registerHandlers() {
  registerHandler("scrape_account", async (payload, progress, job) => {
    const accountId = Number(payload.accountId);
    const res = await collectAccount(accountId, progress);
    // primeira coleta real: sai o conteúdo de demonstração desta conta
    const acc = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).get();
    if (acc?.isDemo) {
      await removeDemoVideos(accountId);
      await db.update(schema.accounts).set({ isDemo: false }).where(eq(schema.accounts.id, accountId)).run();
    }
    for (const id of res.fresh) await enqueue("process_video", `process:${id}`, { videoId: id }, { batchId: job.batchId ?? undefined });
    await enqueuePendingProcessing({ accountId, batchId: job.batchId ?? undefined });
    progress(`${res.total} Reels: ${res.fresh.length} novos, ${res.updated} atualizados`);
  });
  registerHandler("process_video", async (payload, progress) => {
    await processVideo(String(payload.videoId), progress, { forceAnalysis: Boolean(payload.forceAnalysis) });
  });
  registerHandler("generate_script", async (payload, progress, job) => {
    const input = payload.input as ScriptInput;
    const parentId = (payload.parentId as number | undefined) ?? null;
    const reuse = payload.reusePlanOf ? ((await getScript(Number(payload.reusePlanOf)))?.plan as Plan | undefined) : undefined;
    const row = await generateScript(input, { parentId, reusePlan: reuse ?? null, progress, heuristic: Boolean(payload.heuristic) });
    await setJobResult(job.id, { scriptId: row.id });
  });
  registerHandler("weekly_digest", async (_p, progress) => {
    progress("Gerando resumo semanal");
    await generateDigest();
  });
}

export async function removeDemoVideos(accountId?: number) {
  const where = accountId ? and(eq(schema.videos.isDemo, true), eq(schema.videos.accountId, accountId)) : eq(schema.videos.isDemo, true);
  const ids = (await db.select({ id: schema.videos.id }).from(schema.videos).where(where).all()).map((r) => r.id);
  if (!ids.length) return 0;
  await db.transaction(async (tx) => {
    for (const t of [schema.analyses, schema.transcripts, schema.frames, schema.processing] as const) await tx.delete(t).where(inArray(t.videoId, ids)).run();
    await tx.delete(schema.videoSnapshots).where(inArray(schema.videoSnapshots.videoId, ids)).run();
    await tx.delete(schema.notifications).where(inArray(schema.notifications.videoId, ids)).run();
    await tx.delete(schema.videos).where(inArray(schema.videos.id, ids)).run();
  });
  await bump("videos");
  return ids.length;
}

export async function schedulerTick() {
  const s = await getSettings();
  const now = Date.now();
  await setSettings({ workerLastSeenAt: now });
  await requeueStale();
  if (s.scheduleEnabled && hasKey("apify")) {
    const due = now - s.lastScheduledRunAt >= s.scheduleIntervalHours * 3_600_000 - 60_000;
    const hourOk = s.scheduleIntervalHours < 24 || new Date().getHours() >= s.scheduleHour;
    if (due && hourOk) {
      await setSettings({ lastScheduledRunAt: now });
      await refreshAll("agendado");
      console.log("[agenda] coleta automática iniciada");
    }
  }
  // limpeza de vídeos temporários
  await cleanupVideos(s.keepVideoDays);
  // resumo semanal: um por semana, quando houver análises reais
  const last = await db.select().from(schema.digests).orderBy(desc(schema.digests.createdAt)).limit(1).get();
  const hasReal = await db
    .select({ id: schema.analyses.videoId })
    .from(schema.analyses)
    .innerJoin(schema.videos, eq(schema.videos.id, schema.analyses.videoId))
    .where(and(eq(schema.videos.isDemo, false), gte(schema.analyses.createdAt, 0)))
    .limit(1)
    .get();
  if ((!last || now - last.createdAt > 7 * 86_400_000 || (last.generator === "demo" && hasReal)) && hasReal) {
    const pending = await db.select().from(schema.jobs).where(and(eq(schema.jobs.type, "weekly_digest"), ne(schema.jobs.status, "done"), ne(schema.jobs.status, "failed"))).get();
    if (!pending) await enqueue("weekly_digest", `digest:${new Date().toISOString().slice(0, 10)}`);
  }
}

export async function boot() {
  registerHandlers();
  if (g.__hitzzBooted) return;
  g.__hitzzBooted = true;
  await migrateDb();
  await seedIfEmpty();
  await startWorker();
  clearInterval(g.__hitzzScheduler);
  g.__hitzzScheduler = setInterval(async () => {
    try {
      await schedulerTick();
    } catch (e) {
      console.error("[agenda] erro", e);
    }
  }, 60_000);
  setTimeout(async () => {
    try {
      await schedulerTick();
    } catch (e) {
      console.error("[agenda] erro", e);
    }
  }, 5_000);
  console.log("[hitzz] fila e agenda iniciadas");
}
