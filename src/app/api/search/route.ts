import { loadVideos } from "@/server/data";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (!q) return Response.json({ videos: [], accounts: [] });
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const nq = norm(q);
  const accounts = (await db
    .select({ id: schema.accounts.id, handle: schema.accounts.handle })
    .from(schema.accounts)
    .all())
    .filter((a) => a.handle.includes(nq.replace(/^@/, "")))
    .slice(0, 5);
  const videos = (await loadVideos())
    .rows.filter((r) => norm([r.hookText, r.topic, r.caption, r.handle].filter(Boolean).join(" ")).includes(nq))
    .slice(0, 12)
    .map((r) => ({ id: r.id, handle: r.handle, title: r.hookText || r.topic || r.caption?.slice(0, 80) || r.id, hookType: r.hookType }));
  return Response.json({ videos, accounts });
}
