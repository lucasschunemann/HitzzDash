import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Grupo da conta: define como ela entra nas comparações. */
export type AccountGroup = "competitor" | "reference" | "own";
/** external = aguardando análise feita fora do app (Claude Code). */
export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped" | "blocked" | "external";

export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    handle: text("handle").notNull(),
    group: text("group").$type<AccountGroup>().notNull().default("competitor"),
    igUserId: text("ig_user_id"),
    fullName: text("full_name"),
    biography: text("biography"),
    followers: integer("followers"),
    postsCount: integer("posts_count"),
    verified: integer("verified", { mode: "boolean" }),
    avatarPath: text("avatar_path"),
    /** URL pública (Vercel Blob) para o dashboard na nuvem. */
    avatarUrl: text("avatar_url"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    lastScrapedAt: integer("last_scraped_at"),
    lastScrapeStatus: text("last_scrape_status"),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("accounts_handle_uq").on(t.handle)],
);

/** Seguidores ao longo do tempo (um registro por coleta). */
export const accountSnapshots = sqliteTable("account_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull(),
  followers: integer("followers"),
  capturedAt: integer("captured_at").notNull(),
});

export type MusicInfo = {
  artist?: string | null;
  song?: string | null;
  usesOriginalAudio?: boolean | null;
  audioId?: string | null;
};

export const videos = sqliteTable(
  "videos",
  {
    /** ID do Instagram (chave de deduplicação). */
    id: text("id").primaryKey(),
    shortCode: text("short_code"),
    accountId: integer("account_id").notNull(),
    url: text("url"),
    caption: text("caption"),
    hashtags: text("hashtags", { mode: "json" }).$type<string[]>(),
    mentions: text("mentions", { mode: "json" }).$type<string[]>(),
    publishedAt: integer("published_at").notNull(),
    durationSec: real("duration_sec"),
    views: integer("views"),
    likes: integer("likes"),
    comments: integer("comments"),
    shares: integer("shares"),
    followersAtCapture: integer("followers_at_capture"),
    isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
    isSponsored: integer("is_sponsored", { mode: "boolean" }).notNull().default(false),
    music: text("music", { mode: "json" }).$type<MusicInfo>(),
    locationName: text("location_name"),
    productType: text("product_type"),
    thumbnailPath: text("thumbnail_path"),
    /** URL pública (Vercel Blob) da capa, para o dashboard na nuvem. */
    thumbnailUrl: text("thumbnail_url"),
    remoteThumbnailUrl: text("remote_thumbnail_url"),
    remoteVideoUrl: text("remote_video_url"),
    videoPath: text("video_path"),
    videoDeletedAt: integer("video_deleted_at"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    firstSeenAt: integer("first_seen_at").notNull(),
    metricsUpdatedAt: integer("metrics_updated_at").notNull(),
    raw: text("raw", { mode: "json" }),
  },
  (t) => [index("videos_account_idx").on(t.accountId), index("videos_published_idx").on(t.publishedAt)],
);

/** Métricas por coleta: base para a curva de crescimento e para projetar vídeos novos. */
export const videoSnapshots = sqliteTable(
  "video_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    videoId: text("video_id").notNull(),
    views: integer("views"),
    likes: integer("likes"),
    comments: integer("comments"),
    capturedAt: integer("captured_at").notNull(),
  },
  (t) => [index("snap_video_idx").on(t.videoId)],
);

/** Estado de cada etapa do pipeline por vídeo. */
export const processing = sqliteTable("processing", {
  videoId: text("video_id").primaryKey(),
  media: text("media").$type<StageStatus>().notNull().default("pending"),
  transcript: text("transcript").$type<StageStatus>().notNull().default("pending"),
  frames: text("frames").$type<StageStatus>().notNull().default("pending"),
  analysis: text("analysis").$type<StageStatus>().notNull().default("pending"),
  lastError: text("last_error"),
  errorStage: text("error_stage"),
  attempts: integer("attempts").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export type TranscriptWord = { text: string; start: number; end: number; type: string };

export const transcripts = sqliteTable("transcripts", {
  videoId: text("video_id").primaryKey(),
  text: text("text").notNull().default(""),
  words: text("words", { mode: "json" }).$type<TranscriptWord[]>(),
  audioEvents: text("audio_events", { mode: "json" }).$type<string[]>(),
  languageCode: text("language_code"),
  hasSpeech: integer("has_speech", { mode: "boolean" }).notNull(),
  /** speech = fala; lyrics = provável letra de música; none = sem fala; no_audio = vídeo sem trilha. */
  speechKind: text("speech_kind").$type<"speech" | "lyrics" | "none" | "no_audio">().notNull().default("none"),
  speechSeconds: real("speech_seconds"),
  model: text("model"),
  createdAt: integer("created_at").notNull(),
});

/** path = arquivo local no Mac; url = cópia pública no Vercel Blob (quando configurado). */
export type FrameRef = { path: string; t: number; url?: string | null };

export const frames = sqliteTable("frames", {
  videoId: text("video_id").primaryKey(),
  items: text("items", { mode: "json" }).$type<FrameRef[]>().notNull(),
  createdAt: integer("created_at").notNull(),
});

export const analyses = sqliteTable(
  "analyses",
  {
    videoId: text("video_id").primaryKey(),
    data: text("data", { mode: "json" }).notNull(),
    hookType: text("hook_type").notNull(),
    hookTypeManual: text("hook_type_manual"),
    theme: text("theme").notNull(),
    format: text("format").notNull(),
    ctaType: text("cta_type").notNull(),
    offerType: text("offer_type").notNull(),
    confidence: text("confidence").notNull(),
    inputMode: text("input_mode").notNull(),
    model: text("model").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("analyses_hook_idx").on(t.hookType)],
);

export type JobType = "scrape_account" | "process_video" | "weekly_digest" | "generate_script";
export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").$type<JobType>().notNull(),
    key: text("key").notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    progress: text("progress"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(4),
    runAfter: integer("run_after").notNull(),
    error: text("error"),
    batchId: text("batch_id"),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
  },
  (t) => [index("jobs_status_idx").on(t.status, t.runAfter), index("jobs_key_idx").on(t.key)],
);

export const scripts = sqliteTable("scripts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  parentId: integer("parent_id"),
  mode: text("mode").notNull(),
  input: text("input", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  plan: text("plan", { mode: "json" }),
  output: text("output", { mode: "json" }).notNull(),
  evidence: text("evidence", { mode: "json" }),
  title: text("title").notNull(),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  generator: text("generator").notNull(),
  model: text("model"),
  createdAt: integer("created_at").notNull(),
});

/** Pedidos de roteiro que serão escritos pelo Claude Code (modo sem API). */
export const scriptRequests = sqliteTable("script_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  input: text("input", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  kind: text("kind").notNull().default("new"),
  parentId: integer("parent_id"),
  reusePlanOf: integer("reuse_plan_of"),
  status: text("status").$type<"pending" | "done" | "cancelled">().notNull().default("pending"),
  scriptId: integer("script_id"),
  createdAt: integer("created_at").notNull(),
});

export const digests = sqliteTable("digests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekStart: integer("week_start").notNull(),
  data: text("data", { mode: "json" }).notNull(),
  generator: text("generator").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  videoId: text("video_id"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

/** Contador global de mudanças, lido pelo SSE para atualizar a interface. */
export const changeLog = sqliteTable("change_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topic: text("topic").notNull(),
  createdAt: integer("created_at").notNull(),
});
