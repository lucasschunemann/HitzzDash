/**
 * Cliente mínimo da API do Apify (v2). Schemas de entrada conferidos nos builds atuais:
 *  - apify/instagram-reel-scraper: username[], resultsLimit, onlyPostsNewerThan, skipPinnedPosts,
 *    includeSharesCount (pago), includeTranscript, includeDownloadedVideo
 *  - apify/instagram-profile-scraper: usernames[], includeAboutSection
 */
import type { MusicInfo } from "@/db/schema";

const BASE = "https://api.apify.com/v2";
export const REEL_ACTOR = "apify~instagram-reel-scraper";
export const PROFILE_ACTOR = "apify~instagram-profile-scraper";

export class ApifyError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

function token() {
  const t = process.env.APIFY_TOKEN?.trim();
  if (!t) throw new ApifyError("APIFY_TOKEN não configurado. Adicione no arquivo .env e reinicie o app.", false);
  return t;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = body.slice(0, 300);
    try {
      msg = JSON.parse(body)?.error?.message ?? msg;
    } catch {}
    if (res.status === 401) throw new ApifyError("Apify recusou o token (401). Confira o APIFY_TOKEN.", false);
    if (res.status === 402 || res.status === 403) throw new ApifyError(`Apify: sem créditos ou sem permissão (${res.status}). ${msg}`, false);
    throw new ApifyError(`Apify ${res.status}: ${msg}`, res.status === 429 || res.status >= 500);
  }
  return res.json() as Promise<T>;
}

type Run = { id: string; status: string; defaultDatasetId: string; statusMessage?: string };

export async function runActor<T = Record<string, unknown>>(
  actor: string,
  input: Record<string, unknown>,
  onProgress?: (msg: string) => void,
  timeoutMs = 15 * 60_000,
): Promise<T[]> {
  const started = Date.now();
  let run = (await call<{ data: Run }>(`/acts/${actor}/runs?waitForFinish=60`, { method: "POST", body: JSON.stringify(input) })).data;
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
    if (Date.now() - started > timeoutMs) throw new ApifyError("Execução do Apify passou do tempo limite.", true);
    onProgress?.(run.statusMessage ? `Apify: ${run.statusMessage}` : `Apify: ${run.status.toLowerCase()}`);
    run = (await call<{ data: Run }>(`/actor-runs/${run.id}?waitForFinish=60`)).data;
  }
  if (run.status !== "SUCCEEDED") throw new ApifyError(`Actor ${actor} terminou com status ${run.status}. ${run.statusMessage ?? ""}`, true);
  return call<T[]>(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json`);
}

export type ApifyProfile = {
  id?: string;
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  postsCount?: number;
  verified?: boolean;
  private?: boolean;
  profilePicUrl?: string;
  profilePicUrlHD?: string;
  error?: string;
  errorDescription?: string;
};

export async function scrapeProfile(handle: string, onProgress?: (m: string) => void) {
  const items = await runActor<ApifyProfile>(PROFILE_ACTOR, { usernames: [handle] }, onProgress);
  const p = items.find((i) => i.username?.toLowerCase() === handle.toLowerCase()) ?? items[0];
  if (!p || p.error) throw new ApifyError(`Perfil @${handle} não encontrado ou indisponível. ${p?.errorDescription ?? ""}`, false);
  if (p.private) throw new ApifyError(`@${handle} é um perfil privado; só coletamos dados públicos.`, false);
  return p;
}

export type ApifyReel = Record<string, unknown> & {
  id?: string | number;
  shortCode?: string;
  type?: string;
  productType?: string;
  url?: string;
  caption?: string;
  hashtags?: string[];
  mentions?: string[];
  timestamp?: string;
  videoDuration?: number;
  videoPlayCount?: number;
  igPlayCount?: number;
  videoViewCount?: number;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  reshareCount?: number;
  isPinned?: boolean;
  paidPartnership?: boolean;
  sponsors?: unknown[];
  musicInfo?: Record<string, unknown> | null;
  displayUrl?: string;
  videoUrl?: string;
  locationName?: string;
  ownerUsername?: string;
  error?: string;
};

/** newerThan (AAAA-MM-DD): só posts publicados a partir dessa data; sem ele, os mais recentes até o limite. */
export async function scrapeReels(handle: string, limit: number, includeSharesCount: boolean, onProgress?: (m: string) => void, newerThan?: string) {
  return runActor<ApifyReel>(
    REEL_ACTOR,
    {
      username: [handle],
      resultsLimit: limit,
      skipPinnedPosts: false,
      includeSharesCount,
      includeTranscript: false,
      includeDownloadedVideo: false,
      ...(newerThan ? { onlyPostsNewerThan: newerThan } : {}),
    },
    onProgress,
  );
}

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const str = (x: unknown) => (typeof x === "string" && x ? x : null);

function normalizeMusic(m: Record<string, unknown> | null | undefined): MusicInfo | null {
  if (!m) return null;
  return {
    artist: str(m.artist_name) ?? str(m.artistName) ?? str(m.artist) ?? null,
    song: str(m.song_name) ?? str(m.songName) ?? str(m.title) ?? null,
    usesOriginalAudio: typeof m.uses_original_audio === "boolean" ? m.uses_original_audio : typeof m.usesOriginalAudio === "boolean" ? (m.usesOriginalAudio as boolean) : null,
    audioId: str(m.audio_id) ?? str(m.audioId) ?? null,
  };
}

/** Converte um item do reel-scraper para as colunas da tabela `videos`. Retorna null se não for vídeo válido. */
export function normalizeReel(r: ApifyReel) {
  if (r.error || r.id === undefined || r.id === null) return null;
  if (r.type && r.type !== "Video") return null;
  const published = r.timestamp ? Date.parse(r.timestamp) : NaN;
  if (!Number.isFinite(published)) return null;
  const views = num(r.videoPlayCount) ?? num(r.igPlayCount) ?? num(r.videoViewCount);
  const hashtags = Array.isArray(r.hashtags) ? r.hashtags.filter((h): h is string => typeof h === "string") : [];
  return {
    id: String(r.id),
    shortCode: str(r.shortCode),
    url: str(r.url) ?? (r.shortCode ? `https://www.instagram.com/reel/${r.shortCode}/` : null),
    caption: str(r.caption),
    hashtags,
    mentions: Array.isArray(r.mentions) ? r.mentions.filter((h): h is string => typeof h === "string") : [],
    publishedAt: published,
    durationSec: num(r.videoDuration),
    views,
    likes: num(r.likesCount) !== null && (r.likesCount as number) >= 0 ? (r.likesCount as number) : null,
    comments: num(r.commentsCount),
    shares: num(r.sharesCount) ?? num(r.reshareCount),
    isPinned: Boolean(r.isPinned),
    isSponsored: Boolean(r.paidPartnership) || (Array.isArray(r.sponsors) && r.sponsors.length > 0),
    music: normalizeMusic(r.musicInfo),
    locationName: str(r.locationName),
    productType: str(r.productType),
    remoteThumbnailUrl: str(r.displayUrl),
    remoteVideoUrl: str(r.videoUrl),
  };
}
