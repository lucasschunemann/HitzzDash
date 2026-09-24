import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/shell";
import { VideoDatabase, type Filters } from "@/components/video-database";
import { loadVideos, toClientRow, requestNow } from "@/server/data";
import { db, schema } from "@/db";

export const metadata: Metadata = { title: "Vídeos" };

const list = (v: string | string[] | undefined) => (v ? (Array.isArray(v) ? v : v.split(",")).filter(Boolean) : []);

export default async function VideosPage({ searchParams }: PageProps<"/videos">) {
  await connection();
  const sp = await searchParams;
  const { rows } = await loadVideos();
  const accounts = await db.select({ id: schema.accounts.id, handle: schema.accounts.handle }).from(schema.accounts).all();
  const initial: Partial<Filters> = {
    accounts: list(sp.account).map(Number).filter(Number.isFinite),
    bands: list(sp.band),
    hooks: list(sp.hook),
    themes: list(sp.theme),
    formats: list(sp.format),
    groups: list(sp.group),
    q: typeof sp.q === "string" ? sp.q : "",
  };
  const analyzed = rows.filter((r) => r.hookType).length;
  return (
    <div className="px-page pb-16">
      <div className="bleed-page">
        <PageHeader title="Vídeos" subtitle={`${rows.length} Reels coletados · ${analyzed} analisados. Clique para abrir o detalhe; ↑/↓ navega no painel.`} />
      </div>
      <VideoDatabase rows={rows.map(toClientRow)} accounts={accounts} initial={initial} now={requestNow()} />
    </div>
  );
}
