/**
 * Fila de jobs persistida no SQLite, executada dentro do processo do Next.js.
 * - Deduplica por `key` (não enfileira duas vezes o mesmo trabalho pendente).
 * - Retry com backoff exponencial para erros temporários; erro definitivo vira "failed".
 * - Na inicialização, jobs "running" (processo caiu no meio) voltam para a fila.
 */
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { JobType } from "@/db/schema";
import { bump } from "./events";

type Handler = (payload: Record<string, unknown>, progress: (m: string) => void, job: typeof schema.jobs.$inferSelect) => Promise<unknown>;

const CONCURRENCY: Record<JobType, number> = { scrape_account: 1, process_video: 2, weekly_digest: 1, generate_script: 2 };
type WorkerState = { timer?: NodeJS.Timeout; running: Map<number, JobType>; started: boolean };
const g = globalThis as unknown as { __hitzzWorker?: WorkerState; __hitzzHandlers?: Map<JobType, Handler> };
const handlers: Map<JobType, Handler> = (g.__hitzzHandlers ??= new Map());
const state: WorkerState = (g.__hitzzWorker ??= { running: new Map(), started: false });

export function registerHandler(type: JobType, h: Handler) {
  handlers.set(type, h);
}

export async function enqueue(type: JobType, key: string, payload: Record<string, unknown> = {}, opts: { batchId?: string; delayMs?: number; maxAttempts?: number } = {}) {
  const existing = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.key, key), inArray(schema.jobs.status, ["queued", "running"])))
    .get();
  if (existing) return existing;
  const now = Date.now();
  const job = await db
    .insert(schema.jobs)
    .values({ type, key, payload, status: "queued", runAfter: now + (opts.delayMs ?? 0), createdAt: now, batchId: opts.batchId ?? null, maxAttempts: opts.maxAttempts ?? 4 })
    .returning()
    .get();
  await bump("jobs");
  kick();
  return job;
}

function backoffMs(attempt: number) {
  const base = 20_000 * 4 ** (attempt - 1); // 20s, 80s, 5min, 21min
  return Math.min(base, 30 * 60_000) * (0.8 + Math.random() * 0.4);
}

async function setProgress(id: number, progress: string) {
  await db.update(schema.jobs).set({ progress }).where(eq(schema.jobs.id, id)).run();
  await bump("jobs");
}

async function runJob(job: typeof schema.jobs.$inferSelect) {
  let h = handlers.get(job.type);
  if (!h) {
    // em desenvolvimento o hot reload pode recriar módulos depois do boot: registra de novo
    await (await import("./boot")).registerHandlers();
    h = handlers.get(job.type);
  }
  const attempt = job.attempts + 1;
  if (!h) {
    await db.update(schema.jobs).set({ status: "failed", error: `sem handler para ${job.type}` }).where(eq(schema.jobs.id, job.id)).run();
    return;
  }
  try {
    await h(job.payload ?? {}, (m) => void setProgress(job.id, m), job);
    await db.update(schema.jobs).set({ status: "done", progress: null, error: null, attempts: attempt, finishedAt: Date.now() }).where(eq(schema.jobs.id, job.id)).run();
  } catch (e) {
    const err = e as Error & { retryable?: boolean };
    const retryable = err.retryable !== false;
    const willRetry = retryable && attempt < job.maxAttempts;
    await db.update(schema.jobs)
      .set({
        status: willRetry ? "queued" : "failed",
        attempts: attempt,
        error: err.message?.slice(0, 1000) ?? String(e),
        progress: willRetry ? `Nova tentativa em breve (${attempt}/${job.maxAttempts})` : null,
        runAfter: willRetry ? Date.now() + backoffMs(attempt) : job.runAfter,
        finishedAt: willRetry ? null : Date.now(),
      })
      .where(eq(schema.jobs.id, job.id))
      .run();
    console.warn(`[fila] ${job.type} ${job.key} falhou (tentativa ${attempt}): ${err.message}`);
  } finally {
    state.running.delete(job.id);
    await bump("jobs");
    kick();
  }
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await tickInner();
  } finally {
    ticking = false;
  }
}

async function tickInner() {
  const now = Date.now();
  for (const type of Object.keys(CONCURRENCY) as JobType[]) {
    const busy = [...state.running.values()].filter((t) => t === type).length;
    const free = CONCURRENCY[type] - busy;
    if (free <= 0) continue;
    const candidates = await db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.type, type), eq(schema.jobs.status, "queued"), lte(schema.jobs.runAfter, now)))
      .orderBy(schema.jobs.runAfter)
      .limit(free)
      .all();
    for (const job of candidates) {
      const claimed = await db
        .update(schema.jobs)
        .set({ status: "running", startedAt: now })
        .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.status, "queued")))
        .run();
      if (!claimed.rowsAffected) continue;
      state.running.set(job.id, type);
      void runJob({ ...job, status: "running" });
    }
  }
}

let kickPending = false;
export function kick() {
  if (!state.started || kickPending) return;
  kickPending = true;
  setTimeout(async () => {
    kickPending = false;
    try {
      await tick();
    } catch (e) {
      console.error("[fila] erro no tick", e);
    }
  }, 50);
}

export async function startWorker() {
  if (state.started) return;
  state.started = true;
  // retomada: jobs de um worker que parou no meio (sem terminar há muito tempo) voltam para a fila
  await requeueStale();
  state.timer = setInterval(async () => {
    try {
      await tick();
    } catch (e) {
      console.error("[fila] erro no tick", e);
    }
  }, 2000);
  kick();
}

/**
 * Mais de um worker pode consumir a fila (servidor local e `cc -- work`). Se um deles parar no meio,
 * seus jobs ficariam "running" para sempre: depois de STALE_MS sem terminar, voltam para a fila.
 * Nenhum job do app leva perto disso (download + Whisper + frames de um Reel: segundos a poucos minutos).
 */
const STALE_MS = 20 * 60_000;
export async function requeueStale() {
  const cutoff = Date.now() - STALE_MS;
  const res = await db
    .update(schema.jobs)
    .set({ status: "queued", progress: "Retomado: o worker anterior parou no meio", runAfter: Date.now() })
    .where(and(eq(schema.jobs.status, "running"), lte(schema.jobs.startedAt, cutoff)))
    .run();
  if (res.rowsAffected) await bump("jobs");
  return res.rowsAffected;
}

/** Grava dados de resultado no payload do job (ex.: id do roteiro gerado). */
export async function setJobResult(id: number, result: Record<string, unknown>) {
  const job = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
  await db.update(schema.jobs).set({ payload: { ...(job?.payload ?? {}), ...result } }).where(eq(schema.jobs.id, id)).run();
}

export async function retryJob(id: number) {
  await db.update(schema.jobs)
    .set({ status: "queued", runAfter: Date.now(), attempts: 0, error: null, finishedAt: null })
    .where(and(eq(schema.jobs.id, id), inArray(schema.jobs.status, ["failed", "cancelled"])))
    .run();
  await bump("jobs");
  kick();
}

export async function cancelQueued(id: number) {
  await db.update(schema.jobs).set({ status: "cancelled", finishedAt: Date.now() }).where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, "queued"))).run();
  await bump("jobs");
}

export async function queueSummary() {
  const counts = await db
    .select({ type: schema.jobs.type, status: schema.jobs.status, n: sql<number>`count(*)` })
    .from(schema.jobs)
    .groupBy(schema.jobs.type, schema.jobs.status)
    .all();
  const active = await db
    .select()
    .from(schema.jobs)
    .where(inArray(schema.jobs.status, ["queued", "running"]))
    .orderBy(desc(schema.jobs.status), schema.jobs.runAfter)
    .limit(50)
    .all();
  const recent = await db
    .select()
    .from(schema.jobs)
    .where(inArray(schema.jobs.status, ["done", "failed", "cancelled"]))
    .orderBy(desc(schema.jobs.finishedAt))
    .limit(30)
    .all();
  return { counts, active, recent, workerRunning: state.started };
}

/**
 * Executa a fila até esvaziar (usado pelo Mac via `npm run cc -- work`). Jobs com nova tentativa
 * agendada para depois ficam para a próxima execução.
 */
export async function drainQueue(log: (m: string) => void, opts: { maxMinutes?: number } = {}) {
  const started = Date.now();
  state.started = true;
  const revived = await requeueStale();
  if (revived) log(`${revived} job(s) de um worker interrompido voltaram para a fila`);
  const deadline = started + (opts.maxMinutes ?? 60) * 60_000;
  let lastReport = "";
  while (Date.now() < deadline) {
    await tickInner();
    const ready = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.status, "queued"), lte(schema.jobs.runAfter, Date.now())))
      .get();
    const running = state.running.size;
    const report = `${running} rodando, ${ready?.n ?? 0} na fila`;
    if (report !== lastReport) {
      log(report);
      lastReport = report;
    }
    if (!running && !(ready?.n ?? 0)) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  const finished = await db.select().from(schema.jobs).where(and(inArray(schema.jobs.status, ["done", "failed"]), sql`${schema.jobs.finishedAt} >= ${started}`)).all();
  const later = await db.select({ n: sql<number>`count(*)` }).from(schema.jobs).where(eq(schema.jobs.status, "queued")).get();
  return {
    done: finished.filter((j) => j.status === "done").length,
    failed: finished.filter((j) => j.status === "failed").map((j) => ({ type: j.type, key: j.key, error: j.error })),
    retryLater: later?.n ?? 0,
  };
}
