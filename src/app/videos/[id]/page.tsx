import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChevronLeft } from "lucide-react";
import { getVideoDetail } from "@/server/detail";
import { VideoDetail } from "@/components/video-detail";

export async function generateMetadata({ params }: PageProps<"/videos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const d = await getVideoDetail(decodeURIComponent(id));
  return { title: d ? `@${d.row.handle} · ${d.analysis?.hook.onScreenText || d.row.topic || "Reel"}` : "Vídeo" };
}

export default async function VideoPage({ params }: PageProps<"/videos/[id]">) {
  await connection();
  const { id } = await params;
  const data = await getVideoDetail(decodeURIComponent(id));
  if (!data) notFound();
  return (
    <div className="mx-auto max-w-[860px] px-4 pb-16 pt-5 md:px-8 md:pt-8">
      <Link href="/videos" className="mb-5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
        <ChevronLeft className="size-4" /> Vídeos
      </Link>
      <VideoDetail data={data} />
    </div>
  );
}
