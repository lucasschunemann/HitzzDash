import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Analysis } from "@/lib/analysis-schema";

/** Capa gerada para os vídeos de demonstração (não há mídia real para eles). */
export async function GET(_req: Request, ctx: RouteContext<"/api/demo-thumb/[id]">) {
  const { id } = await ctx.params;
  const an = await db.select().from(schema.analyses).where(eq(schema.analyses.videoId, id)).get();
  const data = an?.data as Analysis | undefined;
  const text = (data?.hook.onScreenText || "Reel").slice(0, 60);
  const cat = data?.fashion.productCategory ?? "";
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = [18, 28, 205, 340, 160, 265, 42][h % 7];
  const words = text.split(" ");
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + w).length <= 16) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 640" width="360" height="640">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 45% 28%)"/></linearGradient></defs>
<rect width="360" height="640" fill="url(#g)"/>
<ellipse cx="180" cy="430" rx="120" ry="34" fill="rgba(0,0,0,.18)"/>
<path d="M85 400 q20-70 70-78 l40 -8 q30 30 70 36 q40 8 30 50 z" fill="rgba(255,255,255,.88)"/>
<path d="M85 400 h190 v14 h-190 z" fill="rgba(0,0,0,.35)"/>
${lines
  .slice(0, 4)
  .map((l, i) => `<text x="28" y="${110 + i * 40}" font-family="-apple-system,Helvetica,Arial" font-size="32" font-weight="700" fill="#fff">${esc(l)}</text>`)
  .join("")}
<text x="28" y="600" font-family="-apple-system,Helvetica,Arial" font-size="18" fill="rgba(255,255,255,.8)">${esc(cat)} · DEMO</text>
</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
