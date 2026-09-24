/**
 * Processamento por vídeo, em etapas independentes e retomáveis:
 *   mídia (thumb permanente + vídeo temporário) → transcrição (Scribe) → frames (ffmpeg) → análise (Claude)
 * Cada etapa já concluída é pulada numa nova tentativa. Nada é transcrito duas vezes.
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { StageStatus } from "@/db/schema";
import { THUMBS_DIR, VIDEOS_DIR, mediaRel, mediaAbs } from "@/lib/paths";
import { download, extractAudio, extractFrames, hasFfmpeg, loudness, probe, thumbFromVideo, MediaError } from "./media";
import { transcribe, classifySpeech, SCRIBE_MODEL, ScribeError } from "./scribe";
import { analyzeVideo } from "./analyze";
import { LlmError } from "./llm";
import { bump } from "./events";
import { loadVideos } from "./data";
import { hasKey, transcriberMode, analyzerMode } from "./env";
import { uploadMedia, hasBlob } from "./storage";
import { transcribeLocal, hasWhisper, WHISPER_MODEL_NAME, WhisperError } from "./whisper";

type Stage = "media" | "transcript" | "frames" | "analysis";

export class StageError extends Error {
  constructor(public stage: Stage, message: string, public retryable: boolean) {
    super(message);
  }
}

async function setStage(videoId: string, stage: Stage, status: StageStatus, error?: string | null) {
  const patch: Record<string, unknown> = { [stage]: status, updatedAt: Date.now() };
  if (status === "failed") {
    patch.lastError = error ?? "erro desconhecido";
    patch.errorStage = stage;
  } else if (status === "done" || status === "skipped") {
    const cur = await db.select().from(schema.processing).where(eq(schema.processing.videoId, videoId)).get();
    if (cur?.errorStage === stage) {
      patch.lastError = null;
      patch.errorStage = null;
    }
  } else if ((status === "blocked" || status === "external") && error) {
    patch.lastError = error;
    patch.errorStage = stage;
  }
  await db.update(schema.processing).set(patch).where(eq(schema.processing.videoId, videoId)).run();
  await bump("videos");
}

export async function ensureProcessingRow(videoId: string) {
  await db.insert(schema.processing).values({ videoId, updatedAt: Date.now() }).onConflictDoNothing().run();
}

const retryableOf = (e: unknown) =>
  e instanceof MediaError || e instanceof ScribeError || e instanceof LlmError || e instanceof WhisperError ? e.retryable : true;

async function stageMedia(videoId: string, progress: (m: string) => void) {
  const v = (await db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get())!;
  const needThumb = !v.thumbnailPath || !fs.existsSync(mediaAbs(v.thumbnailPath));
  const needVideo = !v.videoDeletedAt && (!v.videoPath || !fs.existsSync(mediaAbs(v.videoPath)));
  if (!needThumb && !needVideo) return;
  await setStage(videoId, "media", "running");
  let videoError: string | null = null;
  if (needVideo && v.remoteVideoUrl) {
    progress("Baixando vídeo");
    try {
      const dest = path.join(VIDEOS_DIR, `${videoId}.mp4`);
      await download(v.remoteVideoUrl, dest, "video", 180_000);
      await db.update(schema.videos).set({ videoPath: mediaRel(dest) }).where(eq(schema.videos.id, videoId)).run();
    } catch (e) {
      videoError = (e as Error).message;
      if (retryableOf(e)) throw new StageError("media", videoError, true);
    }
  } else if (needVideo) {
    videoError = "Coleta não trouxe URL do vídeo";
  }
  if (needThumb) {
    progress("Baixando capa");
    const dest = path.join(THUMBS_DIR, `${videoId}.jpg`);
    try {
      if (!v.remoteThumbnailUrl) throw new MediaError("sem URL de capa", false);
      await download(v.remoteThumbnailUrl, dest, "image");
    } catch (e) {
      const cur = (await db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get())!;
      if (cur.videoPath && (await hasFfmpeg())) await thumbFromVideo(mediaAbs(cur.videoPath), dest);
      else if (retryableOf(e)) throw new StageError("media", (e as Error).message, true);
    }
    if (fs.existsSync(dest)) {
      const url = await uploadMedia(dest, `thumbs/${videoId}.jpg`).catch(() => null);
      await db.update(schema.videos).set({ thumbnailPath: mediaRel(dest), thumbnailUrl: url }).where(eq(schema.videos.id, videoId)).run();
    }
  }
  const cur = (await db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get())!;
  if (videoError && !cur.videoPath) {
    // Sem vídeo seguimos com capa + legenda (análise com confiança baixa), mas registramos o motivo.
    await setStage(videoId, "media", "failed", `Vídeo indisponível: ${videoError}. A análise usará capa e legenda.`);
  } else {
    await setStage(videoId, "media", "done");
  }
}

async function stageTranscript(videoId: string, progress: (m: string) => void) {
  const existing = await db.select().from(schema.transcripts).where(eq(schema.transcripts.videoId, videoId)).get();
  if (existing) return await setStage(videoId, "transcript", "done");
  const v = (await db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get())!;
  if (!v.videoPath || v.videoDeletedAt) return await setStage(videoId, "transcript", "skipped");
  if (!(await hasFfmpeg())) return await setStage(videoId, "transcript", "blocked", "ffmpeg não encontrado no sistema.");
  await setStage(videoId, "transcript", "running");
  const file = mediaAbs(v.videoPath);
  const info = await probe(file);
  const save = async (t: Partial<typeof schema.transcripts.$inferInsert> & { hasSpeech: boolean }) =>
    await db
      .insert(schema.transcripts)
      .values({ videoId, text: "", createdAt: Date.now(), ...t })
      .onConflictDoNothing()
      .run();

  if (!info.hasAudio) {
    save({ hasSpeech: false, speechKind: "no_audio", model: "ffprobe" });
    return await setStage(videoId, "transcript", "done");
  }
  progress("Extraindo áudio");
  const audio = await extractAudio(file, videoId);
  try {
    const vol = await loudness(audio);
    if (vol !== null && vol < -55) {
      save({ hasSpeech: false, speechKind: "no_audio", model: "ffmpeg-volumedetect" });
      return await setStage(videoId, "transcript", "done");
    }
    let r: Awaited<ReturnType<typeof transcribe>>;
    let model: string;
    if (transcriberMode() === "elevenlabs") {
      if (!hasKey("elevenlabs")) return await setStage(videoId, "transcript", "blocked", "ELEVENLABS_API_KEY ausente: transcrição pendente.");
      progress("Transcrevendo com Scribe");
      r = await transcribe(audio, ["UseHitzz", ...(v.hashtags ?? []).slice(0, 10)]);
      model = SCRIBE_MODEL;
    } else {
      if (!(await hasWhisper())) return await setStage(videoId, "transcript", "blocked", "Whisper local não instalado: rode npm run setup:whisper.");
      progress("Transcrevendo com Whisper (local)");
      r = await transcribeLocal(audio);
      model = WHISPER_MODEL_NAME;
    }
    const kind = classifySpeech(r, v.music ?? null);
    save({
      text: r.text,
      words: r.words,
      audioEvents: r.audioEvents,
      languageCode: r.languageCode,
      hasSpeech: kind === "speech",
      speechKind: kind,
      speechSeconds: r.speechSeconds,
      model,
    });
    await setStage(videoId, "transcript", "done");
  } finally {
    fs.rmSync(audio, { force: true });
  }
}

async function stageFrames(videoId: string, progress: (m: string) => void) {
  const existing = await db.select().from(schema.frames).where(eq(schema.frames.videoId, videoId)).get();
  if (existing) return await setStage(videoId, "frames", "done");
  const v = (await db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get())!;
  if (!v.videoPath || v.videoDeletedAt) return await setStage(videoId, "frames", "skipped");
  if (!(await hasFfmpeg())) return await setStage(videoId, "frames", "blocked", "ffmpeg não encontrado no sistema.");
  await setStage(videoId, "frames", "running");
  progress("Extraindo frames-chave");
  const file = mediaAbs(v.videoPath);
  const info = await probe(file);
  const items = await extractFrames(file, videoId, v.durationSec ?? info.duration);
  for (const f of items) f.url = await uploadMedia(mediaAbs(f.path), `frames/${f.path.split("/").slice(-2).join("-")}`).catch(() => null);
  await db.insert(schema.frames).values({ videoId, items, createdAt: Date.now() }).onConflictDoNothing().run();
  if (!v.durationSec && info.duration) await db.update(schema.videos).set({ durationSec: info.duration }).where(eq(schema.videos.id, videoId)).run();
  await setStage(videoId, "frames", "done");
}

async function stageAnalysis(videoId: string, progress: (m: string) => void, force = false) {
  const existing = await db.select().from(schema.analyses).where(eq(schema.analyses.videoId, videoId)).get();
  if (existing && !force) return await setStage(videoId, "analysis", "done");
  if (analyzerMode() === "claude_code") return await setStage(videoId, "analysis", "external", "Aguardando análise no Claude Code.");
  if (!hasKey("anthropic")) return await setStage(videoId, "analysis", "blocked", "ANTHROPIC_API_KEY ausente: análise pendente.");
  const v = (await db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get())!;
  const acc = (await db.select().from(schema.accounts).where(eq(schema.accounts.id, v.accountId)).get())!;
  const tr = await db.select().from(schema.transcripts).where(eq(schema.transcripts.videoId, videoId)).get();
  const fr = await db.select().from(schema.frames).where(eq(schema.frames.videoId, videoId)).get();
  const sc = (await loadVideos()).byId.get(videoId)?.score ?? null;
  await setStage(videoId, "analysis", "running");
  progress("Analisando com Claude");
  const res = await analyzeVideo({
    handle: acc.handle,
    caption: v.caption,
    hashtags: v.hashtags ?? [],
    durationSec: v.durationSec,
    publishedAt: v.publishedAt,
    music: v.music ?? null,
    metrics: { views: v.views, likes: v.likes, comments: v.comments, shares: v.shares, followers: v.followersAtCapture ?? acc.followers },
    score: sc ? { band: sc.band, ratio: sc.ratio, score: sc.score, maturing: sc.maturing, basis: sc.basis, baselineN: sc.baselineN } : null,
    transcript: tr ? { text: tr.text, words: tr.words ?? null, speechKind: tr.speechKind } : null,
    frames: fr?.items ?? [],
    thumbnailPath: v.thumbnailPath,
  });
  const d = res.data;
  const row = {
    videoId,
    data: d,
    hookType: d.hook.type,
    theme: d.theme,
    format: d.format,
    ctaType: d.cta.type,
    offerType: d.fashion.offerType,
    confidence: d.confidence,
    inputMode: res.inputMode,
    model: res.model,
    createdAt: Date.now(),
  };
  await db.insert(schema.analyses)
    .values(row)
    // reanálise preserva a reclassificação manual do hook
    .onConflictDoUpdate({ target: schema.analyses.videoId, set: row })
    .run();
  await setStage(videoId, "analysis", "done");
}

/** Reels têm no máximo alguns minutos; acima disso é live/IGTV e fica fora da análise. */
export const MAX_REEL_SECONDS = 600;

export async function processVideo(videoId: string, progress: (m: string) => void, opts: { forceAnalysis?: boolean } = {}) {
  await ensureProcessingRow(videoId);
  const v0 = await db.select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  if (v0?.durationSec && v0.durationSec > MAX_REEL_SECONDS) {
    if (v0.videoPath) {
      try {
        fs.rmSync(mediaAbs(v0.videoPath), { force: true });
      } catch {}
      await db.update(schema.videos).set({ videoDeletedAt: Date.now() }).where(eq(schema.videos.id, videoId)).run();
    }
    const min = Math.round(v0.durationSec / 60);
    await db
      .update(schema.processing)
      .set({ media: "skipped", transcript: "skipped", frames: "skipped", analysis: "skipped", lastError: `Vídeo longo (${min} min, provavelmente live): fora da análise de Reels.`, errorStage: "media", updatedAt: Date.now() })
      .where(eq(schema.processing.videoId, videoId))
      .run();
    await bump("videos");
    return;
  }
  const stages: [Stage, () => Promise<void>][] = [
    ["media", () => stageMedia(videoId, progress)],
    ["transcript", () => stageTranscript(videoId, progress)],
    ["frames", () => stageFrames(videoId, progress)],
    ["analysis", () => stageAnalysis(videoId, progress, opts.forceAnalysis)],
  ];
  for (const [stage, fn] of stages) {
    try {
      await fn();
    } catch (e) {
      const retryable = e instanceof StageError ? e.retryable : retryableOf(e);
      const msg = (e as Error).message;
      await setStage(videoId, stage, "failed", msg);
      await db.update(schema.processing)
        .set({ attempts: ((await db.select().from(schema.processing).where(eq(schema.processing.videoId, videoId)).get())?.attempts ?? 0) + 1 })
        .where(eq(schema.processing.videoId, videoId))
        .run();
      // Falha em transcrição/frames não impede a análise com o que houver; falha de mídia retryable interrompe.
      if (stage === "media" && retryable) throw new StageError(stage, msg, true);
      if (stage === "analysis") throw new StageError(stage, msg, retryable);
      if (retryable) throw new StageError(stage, msg, true);
    }
  }
}

/** Apaga vídeos temporários já processados há mais de N dias (a thumb e os frames ficam). */
export async function cleanupVideos(keepDays: number) {
  const cutoff = Date.now() - keepDays * 86_400_000;
  const rows = await db.select().from(schema.videos).all();
  let n = 0;
  for (const v of rows) {
    if (!v.videoPath || v.videoDeletedAt || v.firstSeenAt > cutoff) continue;
    const p = await db.select().from(schema.processing).where(eq(schema.processing.videoId, v.id)).get();
    const settled = (s?: StageStatus) => s === "done" || s === "skipped";
    if (!p || !settled(p.transcript) || !settled(p.frames)) continue;
    try {
      fs.rmSync(mediaAbs(v.videoPath), { force: true });
    } catch {}
    await db.update(schema.videos).set({ videoDeletedAt: Date.now() }).where(eq(schema.videos.id, v.id)).run();
    n++;
  }
  if (n) await bump("videos");
  return n;
}

/**
 * Envia ao Vercel Blob as imagens locais que ainda não têm cópia na nuvem (capas, frames, avatares).
 * Útil ao configurar o Blob depois de já ter coletado vídeos.
 */
export async function syncMediaToBlob(log: (m: string) => void = () => {}) {
  if (!hasBlob()) return { thumbs: 0, frames: 0, avatars: 0 };
  let thumbs = 0;
  let framesN = 0;
  let avatars = 0;
  for (const v of await db.select().from(schema.videos).all()) {
    if (!v.thumbnailPath || v.thumbnailUrl || v.isDemo) continue;
    const url = await uploadMedia(mediaAbs(v.thumbnailPath), `thumbs/${v.id}.jpg`).catch(() => null);
    if (url) {
      await db.update(schema.videos).set({ thumbnailUrl: url }).where(eq(schema.videos.id, v.id)).run();
      thumbs++;
    }
  }
  for (const fr of await db.select().from(schema.frames).all()) {
    if (fr.items.every((f) => f.url)) continue;
    const items = [];
    for (const f of fr.items) items.push({ ...f, url: f.url ?? (await uploadMedia(mediaAbs(f.path), `frames/${f.path.split("/").slice(-2).join("-")}`).catch(() => null)) });
    await db.update(schema.frames).set({ items }).where(eq(schema.frames.videoId, fr.videoId)).run();
    framesN++;
  }
  for (const a of await db.select().from(schema.accounts).all()) {
    if (!a.avatarPath || a.avatarUrl) continue;
    const url = await uploadMedia(mediaAbs(a.avatarPath), `avatars/${a.handle}.jpg`).catch(() => null);
    if (url) {
      await db.update(schema.accounts).set({ avatarUrl: url }).where(eq(schema.accounts.id, a.id)).run();
      avatars++;
    }
  }
  if (thumbs + framesN + avatars) {
    log(`Blob: ${thumbs} capas, ${framesN} vídeos com frames, ${avatars} avatares enviados`);
    await bump("videos");
  }
  return { thumbs, frames: framesN, avatars };
}
