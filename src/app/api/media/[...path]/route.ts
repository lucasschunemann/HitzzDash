import fs from "node:fs";
import path from "node:path";
import { mediaAbs } from "@/lib/paths";

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4" };

/** Serve a mídia local (thumbs, frames, avatares e vídeos temporários), com suporte a Range para vídeo. */
export async function GET(req: Request, ctx: RouteContext<"/api/media/[...path]">) {
  const { path: parts } = await ctx.params;
  let file: string;
  try {
    file = mediaAbs(parts.map(decodeURIComponent).join("/"));
  } catch {
    return new Response("inválido", { status: 400 });
  }
  if (!fs.existsSync(file)) return new Response("não encontrado", { status: 404 });
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const size = fs.statSync(file).size;
  const range = req.headers.get("range");
  if (range && type.startsWith("video")) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Number(m[2]) : Math.min(size - 1, start + 2_000_000);
    const stream = fs.createReadStream(file, { start, end });
    return new Response(stream as unknown as ReadableStream, {
      status: 206,
      headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(fs.readFileSync(file), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "Content-Length": String(size) } });
}
