/**
 * Camada de leitura: junta vídeos, contas, análises e status, calcula scores e expõe
 * linhas prontas para as telas. Cacheado pelo último id do change_log.
 */
import { db, schema } from "@/db";
import { scoreVideos, type ScoreResult } from "@/lib/scoring";
import type { Analysis } from "@/lib/analysis-schema";
import type { PatternRow } from "@/lib/patterns";
import type { AccountGroup, StageStatus, MusicInfo } from "@/db/schema";
import { getSettings } from "./settings";
import { latestChange } from "./events";

export type VideoRow = {
  id: string;
  shortCode: string | null;
  url: string | null;
  accountId: number;
  handle: string;
  group: AccountGroup;
  caption: string | null;
  hashtags: string[];
  publishedAt: number;
  durationSec: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  followers: number | null;
  isPinned: boolean;
  isSponsored: boolean;
  isDemo: boolean;
  music: MusicInfo | null;
  thumb: string | null;
  hasVideo: boolean;
  score: ScoreResult | null;
  status: { media: StageStatus; transcript: StageStatus; frames: StageStatus; analysis: StageStatus; lastError: string | null; errorStage: string | null };
  speechKind: string | null;
  hookType: string | null;
  hookTypeAuto: string | null;
  hookManual: boolean;
  theme: string | null;
  format: string | null;
  ctaType: string | null;
  offerType: string | null;
  confidence: string | null;
  hookText: string | null;
  topic: string | null;
  beatRoles: string[];
};

type Cache = { key: string; rows: VideoRow[]; byId: Map<string, VideoRow> };
const g = globalThis as unknown as { __hitzzData?: Cache };

export function thumbUrl(v: { id: string; thumbnailPath: string | null; thumbnailUrl?: string | null; isDemo: boolean }) {
  if (v.thumbnailUrl) return v.thumbnailUrl;
  if (v.thumbnailPath) return `/api/media/${v.thumbnailPath}`;
  if (v.isDemo) return `/api/demo-thumb/${encodeURIComponent(v.id)}`;
  return null;
}

export async function loadVideos(): Promise<{ rows: VideoRow[]; byId: Map<string, VideoRow> }> {
  const key = `${(await latestChange())?.id ?? 0}:${Math.floor(Date.now() / 600_000)}`;
  if (g.__hitzzData?.key === key) return g.__hitzzData;

  const accounts = new Map((await db.select().from(schema.accounts).all()).map((a) => [a.id, a]));
  const vids = (await db.select().from(schema.videos).all()).filter((v) => accounts.has(v.accountId));
  const analyses = new Map((await db.select().from(schema.analyses).all()).map((a) => [a.videoId, a]));
  const proc = new Map((await db.select().from(schema.processing).all()).map((p) => [p.videoId, p]));
  const trans = new Map(
    (await db
      .select({ videoId: schema.transcripts.videoId, speechKind: schema.transcripts.speechKind })
      .from(schema.transcripts)
      .all())
      .map((t) => [t.videoId, t.speechKind]),
  );
  const { baselineN } = await getSettings();

  const scores = scoreVideos(
    vids.map((v) => ({
      id: v.id,
      accountId: v.accountId,
      publishedAt: v.publishedAt,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      followers: v.followersAtCapture ?? accounts.get(v.accountId)?.followers ?? null,
      isPinned: v.isPinned,
      isSponsored: v.isSponsored,
    })),
    { baselineN },
  );

  const rows: VideoRow[] = vids.map((v) => {
    const acc = accounts.get(v.accountId)!;
    const an = analyses.get(v.id);
    const data = an?.data as Analysis | undefined;
    const p = proc.get(v.id);
    return {
      id: v.id,
      shortCode: v.shortCode,
      url: v.url,
      accountId: v.accountId,
      handle: acc.handle,
      group: acc.group,
      caption: v.caption,
      hashtags: v.hashtags ?? [],
      publishedAt: v.publishedAt,
      durationSec: v.durationSec,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares,
      followers: v.followersAtCapture ?? acc.followers,
      isPinned: v.isPinned,
      isSponsored: v.isSponsored,
      isDemo: v.isDemo,
      music: v.music ?? null,
      thumb: thumbUrl(v),
      hasVideo: Boolean(v.videoPath && !v.videoDeletedAt),
      score: scores.get(v.id) ?? null,
      status: {
        media: p?.media ?? "done",
        transcript: p?.transcript ?? "done",
        frames: p?.frames ?? "done",
        analysis: p?.analysis ?? (an ? "done" : "pending"),
        lastError: p?.lastError ?? null,
        errorStage: p?.errorStage ?? null,
      },
      speechKind: trans.get(v.id) ?? null,
      hookType: an ? (an.hookTypeManual ?? an.hookType) : null,
      hookTypeAuto: an?.hookType ?? null,
      hookManual: Boolean(an?.hookTypeManual),
      theme: an?.theme ?? null,
      format: an?.format ?? null,
      ctaType: an?.ctaType ?? null,
      offerType: an?.offerType ?? null,
      confidence: an?.confidence ?? null,
      hookText: data ? [...new Set([data.hook.onScreenText, data.hook.spokenText].map((t) => t.trim()).filter(Boolean))].join(" / ") : null,
      topic: data?.topic ?? null,
      beatRoles: data?.beats?.map((b) => b.role) ?? [],
    };
  });
  rows.sort((a, b) => b.publishedAt - a.publishedAt);
  const cache = { key, rows, byId: new Map(rows.map((r) => [r.id, r])) };
  g.__hitzzData = cache;
  return cache;
}

export function patternRows(rows: VideoRow[]): PatternRow[] {
  return rows
    .filter((r) => r.hookType && r.theme && !r.isPinned)
    .map((r) => ({
      id: r.id,
      accountId: r.accountId,
      handle: r.handle,
      group: r.group,
      publishedAt: r.publishedAt,
      // vídeo ainda maturando não entra nas estatísticas: a projeção de poucas horas é ruído
      score: r.score?.band === "maturing" ? null : (r.score?.score ?? null),
      band: r.score?.band ?? null,
      ratio: r.score?.ratio ?? null,
      views: r.views,
      engagementRate: r.score?.secondary.engagementRate ?? null,
      commentsPerView: r.views && r.comments !== null ? r.comments / r.views : null,
      hookType: r.hookType!,
      format: r.format!,
      theme: r.theme!,
      ctaType: r.ctaType!,
      offerType: r.offerType!,
      hookText: r.hookText ?? "",
      beatRoles: r.beatRoles,
    }));
}

/** Versão enxuta para o cliente (sem objetos grandes). */
export function toClientRow(r: VideoRow) {
  return {
    ...r,
    score: r.score
      ? {
          score: r.score.score,
          ratio: r.score.ratio,
          band: r.score.band,
          basis: r.score.basis,
          maturing: r.score.maturing,
          flags: r.score.flags,
          engagementRate: r.score.secondary.engagementRate,
          viewsPerFollower: r.score.secondary.viewsPerFollower,
          commentsPerLike: r.score.secondary.commentsPerLike,
        }
      : null,
  };
}
/** Horário da requisição (as páginas já são dinâmicas via connection()). */
export function requestNow() {
  return Date.now();
}

export type ClientVideoRow = ReturnType<typeof toClientRow>;
