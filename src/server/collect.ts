import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { AVATARS_DIR, FRAMES_DIR, mediaAbs, mediaRel } from "@/lib/paths";
import { scrapeProfile, scrapeReels, normalizeReel } from "./apify";
import { download } from "./media";
import { storeImage } from "./storage";
import { bump, notify } from "./events";
import { getSettings } from "./settings";
import { ensureProcessingRow } from "./pipeline";
import { loadVideos } from "./data";

const DAY = 86_400_000;

export function normalizeHandle(input: string) {
  let h = input.trim();
  const m = h.match(/instagram\.com\/([^/?#]+)/i);
  if (m) h = m[1];
  h = h.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(h)) return null;
  return h;
}

/**
 * Coleta uma conta: perfil (seguidores) + Reels recentes. Deduplica por ID: vídeos já
 * conhecidos só têm métricas atualizadas (com snapshot); os novos entram na fila.
 */
export async function collectAccount(accountId: number, progress: (m: string) => void) {
  const acc = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).get();
  if (!acc) throw new Error("Conta não existe mais");
  const settings = await getSettings();
  const now = Date.now();
  await db.update(schema.accounts).set({ lastScrapeStatus: "running", lastError: null }).where(eq(schema.accounts.id, accountId)).run();
  await bump("accounts");

  try {
    progress(`Perfil @${acc.handle}`);
    const p = await scrapeProfile(acc.handle, progress);
    let avatarPath = acc.avatarPath;
    let avatarUrl = acc.avatarUrl;
    const pic = p.profilePicUrlHD || p.profilePicUrl;
    if (pic) {
      try {
        const dest = path.join(AVATARS_DIR, `${acc.handle}.jpg`);
        await download(pic, dest, "image");
        avatarPath = mediaRel(dest);
        avatarUrl = (await storeImage(dest, `avatars/${acc.handle}`, "avatar").catch(() => null)) ?? avatarUrl;
      } catch {}
    }
    await db.update(schema.accounts)
      .set({
        igUserId: p.id ?? acc.igUserId,
        fullName: p.fullName ?? acc.fullName,
        biography: p.biography ?? acc.biography,
        followers: p.followersCount ?? acc.followers,
        postsCount: p.postsCount ?? acc.postsCount,
        verified: p.verified ?? acc.verified,
        avatarPath,
        avatarUrl,
      })
      .where(eq(schema.accounts.id, accountId))
      .run();
    if (p.followersCount != null) await db.insert(schema.accountSnapshots).values({ accountId, followers: p.followersCount, capturedAt: now }).run();

    progress(`Reels de @${acc.handle}`);
    // Conta já com histórico: só a janela recente (semana nova + métricas da anterior).
    // Conta nova: histórico completo até o limite, para a mediana de referência do score.
    const known = (await db.select({ id: schema.videos.id }).from(schema.videos).where(and(eq(schema.videos.accountId, accountId), eq(schema.videos.isDemo, false))).all()).length;
    const newerThan = known >= settings.baselineMinVideos ? new Date(now - settings.collectWindowDays * DAY).toISOString().slice(0, 10) : undefined;
    const items = await scrapeReels(acc.handle, settings.reelsPerAccount, settings.includeSharesCount, progress, newerThan);
    const reels = items.map(normalizeReel).filter((x): x is NonNullable<typeof x> => x !== null);
    const followers = p.followersCount ?? acc.followers ?? null;
    const fresh = await upsertReels(accountId, reels, followers, now, now - settings.analysisWindowDays * DAY);

    await db.update(schema.accounts)
      .set({ lastScrapedAt: now, lastScrapeStatus: "ok", lastError: null })
      .where(eq(schema.accounts.id, accountId))
      .run();
    await bump("videos");
    await bump("accounts");
    await notifyOutliers(accountId);
    return { total: reels.length, fresh, updated: reels.length - fresh.length };
  } catch (e) {
    await db.update(schema.accounts)
      .set({ lastScrapeStatus: "error", lastError: (e as Error).message })
      .where(eq(schema.accounts.id, accountId))
      .run();
    await bump("accounts");
    throw e;
  }
}

type Reel = NonNullable<ReturnType<typeof normalizeReel>>;

/**
 * Grava os Reels coletados. Deduplica por ID: conhecidos só atualizam métricas; novos são
 * inseridos e ganham linha de processamento. Sempre registra um snapshot de métricas.
 */
/**
 * analyzeSince: vídeos novos publicados antes disso entram só com métricas e capa (base do score),
 * sem transcrição, frames nem análise.
 */
export async function upsertReels(accountId: number, reels: Reel[], followers: number | null, now = Date.now(), analyzeSince = 0) {
  const ids = reels.map((r) => r.id);
  const known = new Set(
    ids.length ? (await db.select({ id: schema.videos.id }).from(schema.videos).where(inArray(schema.videos.id, ids)).all()).map((r) => r.id) : [],
  );
  const fresh: string[] = [];
  await db.transaction(async (tx) => {
    for (const r of reels) {
      if (known.has(r.id)) {
        await tx.update(schema.videos)
          .set({
            views: r.views,
            likes: r.likes,
            comments: r.comments,
            shares: r.shares ?? undefined,
            isPinned: r.isPinned,
            caption: r.caption,
            remoteThumbnailUrl: r.remoteThumbnailUrl,
            remoteVideoUrl: r.remoteVideoUrl,
            metricsUpdatedAt: now,
          })
          .where(eq(schema.videos.id, r.id))
          .run();
      } else {
        await tx.insert(schema.videos)
          .values({ ...r, accountId, followersAtCapture: followers, firstSeenAt: now, metricsUpdatedAt: now })
          .run();
        fresh.push(r.id);
      }
      await tx.insert(schema.videoSnapshots).values({ videoId: r.id, views: r.views, likes: r.likes, comments: r.comments, capturedAt: now }).run();
    }
  });
  const old = new Set(reels.filter((r) => fresh.includes(r.id) && r.publishedAt < analyzeSince).map((r) => r.id));
  for (const id of fresh) await ensureProcessingRow(id, old.has(id) ? "baseline" : "full");
  return fresh;
}

/** Notifica novos breakouts (uma vez por vídeo). */
export async function notifyOutliers(accountId?: number) {
  const { rows } = await loadVideos();
  const already = new Set(
    (await db
      .select({ v: schema.notifications.videoId })
      .from(schema.notifications)
      .where(eq(schema.notifications.kind, "outlier"))
      .all())
      .map((r) => r.v),
  );
  const cutoff = Date.now() - 14 * 86_400_000;
  for (const r of rows) {
    if (accountId && r.accountId !== accountId) continue;
    if (r.isDemo || r.publishedAt < cutoff || already.has(r.id)) continue;
    if (r.score?.band !== "breakout") continue;
    await notify({
      kind: "outlier",
      title: `Novo outlier em @${r.handle}`,
      body: `${r.score.ratio!.toFixed(1)}× a mediana da conta${r.score.maturing ? " (projeção, ainda maturando)" : ""}.`,
      videoId: r.id,
    });
  }
}

export async function deleteAccount(accountId: number) {
  const vids = await db.select({ id: schema.videos.id, videoPath: schema.videos.videoPath, thumb: schema.videos.thumbnailPath }).from(schema.videos).where(eq(schema.videos.accountId, accountId)).all();
  const ids = vids.map((v) => v.id);
  await db.transaction(async (tx) => {
    if (ids.length) {
      for (const t of [schema.analyses, schema.transcripts, schema.frames, schema.processing] as const) await tx.delete(t).where(inArray(t.videoId, ids)).run();
      await tx.delete(schema.videoSnapshots).where(inArray(schema.videoSnapshots.videoId, ids)).run();
      await tx.delete(schema.notifications).where(inArray(schema.notifications.videoId, ids)).run();
      await tx.delete(schema.videos).where(eq(schema.videos.accountId, accountId)).run();
    }
    await tx.delete(schema.accountSnapshots).where(eq(schema.accountSnapshots.accountId, accountId)).run();
    await tx.delete(schema.jobs).where(and(eq(schema.jobs.key, `scrape:${accountId}`), inArray(schema.jobs.status, ["queued", "failed"]))).run();
    await tx.delete(schema.accounts).where(eq(schema.accounts.id, accountId)).run();
  });
  // mídia local da conta
  for (const v of vids) {
    try {
      for (const rel of [v.videoPath, v.thumb]) if (rel) fs.rmSync(mediaAbs(rel), { force: true });
      fs.rmSync(path.join(FRAMES_DIR, v.id), { recursive: true, force: true });
    } catch {}
  }
  await bump("accounts");
  await bump("videos");
}
