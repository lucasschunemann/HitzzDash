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
    <div className="mx-auto max-w-[900px] px-5 pb-24 pt-6 md:px-10 md:pt-10">
      <Link href="/videos" className="group mb-8 inline-flex items-center gap-1 rounded-[6px] py-1 pl-1 pr-2 text-[13.5px] text-ink-2 transition-colors hover:bg-hover hover:text-ink">
        <ChevronLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Vídeos
      </Link>
      <VideoDetail data={data} />
    </div>
  );
}
