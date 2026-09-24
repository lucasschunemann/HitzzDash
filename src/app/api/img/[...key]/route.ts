import { readImage } from "@/server/storage";

/**
 * Serve as imagens guardadas no banco (capas, frames, avatares). A URL leva ?v=<hash> do conteúdo,
 * então a resposta é imutável: o navegador e a CDN da Vercel guardam por um ano. O proxy de login
 * roda antes, então só quem entrou com a senha da equipe recebe as imagens.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/img/[...key]">) {
  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");
  if (!/^[\w.@/-]+$/.test(key) || key.includes("..")) return new Response("inválido", { status: 400 });
  const img = await readImage(key);
  if (!img) return new Response("não encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });
  const etag = `"${img.hash}"`;
  const cache = { "Cache-Control": "private, max-age=31536000, immutable", "Vercel-CDN-Cache-Control": "max-age=31536000, immutable", ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: cache });
  return new Response(new Uint8Array(img.data), { headers: { "Content-Type": img.mime, "Content-Length": String(img.data.length), ...cache } });
}
