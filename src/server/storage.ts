/**
 * Imagens do dashboard (capas, frames-chave, avatares). O worker guarda o original em data/media e
 * uma cópia WebP comprimida na tabela `media` do banco (Turso). O site, na Vercel ou local, serve
 * essa cópia por /api/img/<chave>. Não depende de storage externo nem de arquivos do Mac.
 * O vídeo MP4 nunca sai do worker.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type ImageKind = "thumb" | "frame" | "avatar";

/** Largura máxima e qualidade por tipo: o suficiente para a tela, pequeno para o banco. */
const SPEC: Record<ImageKind, { width: number; quality: number }> = {
  thumb: { width: 360, quality: 72 },
  frame: { width: 540, quality: 70 },
  avatar: { width: 160, quality: 78 },
};

export const IMG_PREFIX = "/api/img/";

/** A URL aponta para a cópia no banco (e não para um arquivo local ou storage antigo). */
export const isStoredUrl = (url: string | null | undefined) => Boolean(url?.startsWith(IMG_PREFIX));

export const imageUrl = (key: string, hash: string) => `${IMG_PREFIX}${key}?v=${hash}`;

/**
 * Comprime um arquivo local e grava no banco sob `key` (ex.: thumbs/<id>). Devolve a URL servida
 * pelo dashboard, ou null se o arquivo não existir ou não for uma imagem válida.
 */
export async function storeImage(localFile: string, key: string, kind: ImageKind): Promise<string | null> {
  if (!fs.existsSync(localFile)) return null;
  const { default: sharp } = await import("sharp");
  const { width, quality } = SPEC[kind];
  const data = await sharp(localFile).rotate().resize({ width, withoutEnlargement: true }).webp({ quality, effort: 4 }).toBuffer();
  const hash = crypto.createHash("sha1").update(data).digest("hex").slice(0, 10);
  const row = { mime: "image/webp", data, bytes: data.length, hash, createdAt: Date.now() };
  await db
    .insert(schema.media)
    .values({ key, ...row })
    .onConflictDoUpdate({ target: schema.media.key, set: row })
    .run();
  return imageUrl(key, hash);
}

export async function readImage(key: string) {
  return db.select({ mime: schema.media.mime, data: schema.media.data, hash: schema.media.hash }).from(schema.media).where(eq(schema.media.key, key)).get();
}

/** Chave estável de um frame a partir do caminho local (frames/<videoId>/<arquivo>). */
export const frameKey = (localPath: string) => `frames/${localPath.split("/").slice(-2).join("-").replace(/\.\w+$/, "")}`;
