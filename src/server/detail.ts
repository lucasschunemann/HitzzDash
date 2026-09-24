import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Analysis } from "@/lib/analysis-schema";
import { loadVideos, toClientRow } from "./data";
import { fmtInt } from "@/lib/format";
import fs from "node:fs";
import { mediaAbs } from "@/lib/paths";

const localFileExists = (rel: string) => {
  try {
    return fs.existsSync(mediaAbs(rel));
  } catch {
    return false;
  }
};

export async function getVideoDetail(id: string) {
  const { byId, rows } = await loadVideos();
  const row = byId.get(id);
  if (!row) return null;
  const an = await db.select().from(schema.analyses).where(eq(schema.analyses.videoId, id)).get();
  const tr = await db.select().from(schema.transcripts).where(eq(schema.transcripts.videoId, id)).get();
  const fr = await db.select().from(schema.frames).where(eq(schema.frames.videoId, id)).get();
  const v = (await db.select().from(schema.videos).where(eq(schema.videos.id, id)).get())!;
  const snaps = await db.select().from(schema.videoSnapshots).where(eq(schema.videoSnapshots.videoId, id)).orderBy(asc(schema.videoSnapshots.capturedAt)).all();
  const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.key, `process:${id}`)).all();
  const job = jobs.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  // Vídeos parecidos (mesmo hook ou tema), úteis para comparar
  const similar = rows
    .filter((r) => r.id !== id && r.hookType && (r.hookType === row.hookType || r.theme === row.theme))
    .sort((a, b) => (b.score?.score ?? -9) - (a.score?.score ?? -9))
    .slice(0, 6)
    .map(toClientRow);
  const account = (await db.select().from(schema.accounts).where(eq(schema.accounts.id, row.accountId)).get())!;
  return {
    row: toClientRow(row),
    explanation: row.score?.explanation ?? [],
    baseline: row.score ? { median: row.score.baselineMedian, n: row.score.baselineN, sigma: row.score.sigma, basis: row.score.basis, adjusted: row.score.adjustedMetric, maturity: row.score.maturity, ageHours: row.score.ageHours } : null,
    analysis: (an?.data as Analysis | undefined) ?? null,
    analysisMeta: an ? { model: an.model, inputMode: an.inputMode, createdAt: an.createdAt, hookTypeAuto: an.hookType, hookTypeManual: an.hookTypeManual } : null,
    transcript: tr ? { text: tr.text, words: tr.words ?? [], speechKind: tr.speechKind, audioEvents: tr.audioEvents ?? [], model: tr.model } : null,
    frames: (fr?.items ?? []).map((f) => ({ url: f.url ?? `/api/media/${f.path}`, t: f.t })),
    videoUrl: v.videoPath && !v.videoDeletedAt && localFileExists(v.videoPath) ? `/api/media/${v.videoPath}` : null,
    snapshots: snaps.map((s) => ({ t: s.capturedAt, views: s.views, likes: s.likes })),
    job: job ? { status: job.status, progress: job.progress, error: job.error, attempts: job.attempts } : null,
    similar,
    account: { handle: account.handle, followers: account.followers, group: account.group, followersLabel: fmtInt(account.followers) },
  };
}
export type VideoDetailData = NonNullable<Awaited<ReturnType<typeof getVideoDetail>>>;
