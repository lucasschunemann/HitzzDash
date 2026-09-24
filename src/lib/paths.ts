import path from "node:path";
import fs from "node:fs";

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));
export const MEDIA_DIR = path.join(DATA_DIR, "media");
export const THUMBS_DIR = path.join(MEDIA_DIR, "thumbs");
export const VIDEOS_DIR = path.join(MEDIA_DIR, "videos");
export const FRAMES_DIR = path.join(MEDIA_DIR, "frames");
export const AVATARS_DIR = path.join(MEDIA_DIR, "avatars");
export const TMP_DIR = path.join(DATA_DIR, "tmp");

export function ensureDirs() {
  for (const d of [DATA_DIR, THUMBS_DIR, VIDEOS_DIR, FRAMES_DIR, AVATARS_DIR, TMP_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

/** Caminho relativo à pasta de mídia, usado no banco e servido por /api/media. */
export function mediaRel(abs: string) {
  return path.relative(MEDIA_DIR, abs).split(path.sep).join("/");
}

export function mediaAbs(rel: string) {
  const abs = path.resolve(MEDIA_DIR, rel);
  if (!abs.startsWith(MEDIA_DIR + path.sep)) throw new Error("caminho de mídia inválido");
  return abs;
}
