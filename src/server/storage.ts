/**
 * Imagens públicas do dashboard (capas, frames-chave, avatares). No Mac elas ficam em data/media;
 * com BLOB_READ_WRITE_TOKEN também são enviadas ao Vercel Blob, para o dashboard na Vercel exibir.
 * O vídeo MP4 nunca sai do Mac.
 */
import fs from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";

export const hasBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/** Envia um arquivo local ao Blob e devolve a URL pública (ou null sem Blob configurado). */
export async function uploadMedia(localFile: string, key: string): Promise<string | null> {
  if (!hasBlob() || !fs.existsSync(localFile)) return null;
  const res = await put(`hitzz/${key}`, fs.readFileSync(localFile), {
    access: "public",
    addRandomSuffix: true,
    contentType: TYPES[path.extname(localFile).toLowerCase()] ?? "application/octet-stream",
  });
  return res.url;
}
