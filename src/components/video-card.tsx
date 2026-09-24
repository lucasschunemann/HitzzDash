"use client";

import { useRef } from "react";
import { Play, Pin, EyeOff } from "lucide-react";
import type { ClientVideoRow } from "@/server/data";
import { hookLabel } from "@/lib/taxonomy";
import { fmtCompact, fmtAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { BandBadge } from "./badges";
import { usePeek } from "./peek";

export function useOpenVideo() {
  const { open } = usePeek();
  return (row: Pick<ClientVideoRow, "id" | "thumb">, el?: HTMLElement | null, list?: string[]) => {
    const img = el?.querySelector("img");
    open(row.id, img ? { rect: img.getBoundingClientRect(), thumb: row.thumb } : null, list);
  };
}

/** Card de vídeo (galeria): capa 9:16, conta, faixa e razão vs mediana. Abre o painel lateral. */
export function VideoCard({ row, list, size = "md", showHook = true }: { row: ClientVideoRow; list?: string[]; size?: "sm" | "md"; showHook?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const openVideo = useOpenVideo();
  return (
    <button
      ref={ref}
      onClick={() => openVideo(row, ref.current, list)}
      className={cn("group flex w-full flex-col text-left outline-none transition-transform duration-200 active:scale-[0.98]", size === "sm" ? "w-[140px] shrink-0 md:w-[150px]" : "")}
      aria-label={`Abrir vídeo de @${row.handle}`}
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[8px] bg-surface-2 ring-1 ring-hairline transition-[box-shadow,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-md)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--focus)]">
        {row.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.thumb} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]" />
        ) : (
          <div className="grid size-full place-items-center text-ink-3">
            <Play className="size-5" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
        <div className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[11.5px] font-semibold text-white tabular">
          {row.views === null ? <EyeOff className="size-3" /> : <Play className="size-3 fill-white" />}
          {row.views === null ? fmtCompact((row.likes ?? 0) + (row.comments ?? 0)) : fmtCompact(row.views)}
        </div>
        {row.isPinned && <Pin className="absolute right-2 top-2 size-3.5 text-white drop-shadow" />}
        {row.isDemo && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/45 px-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-white backdrop-blur">demo</span>}
      </div>
      <div className="mt-2 min-w-0 space-y-0.5 px-0.5">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-[13px] font-medium text-ink">@{row.handle}</span>
          <span className="shrink-0 text-[11px] text-ink-3">{fmtAgo(row.publishedAt)}</span>
        </div>
        <BandBadge band={row.score?.band ?? null} ratio={row.score?.ratio} projected={row.score?.maturing} />
        {showHook && row.hookType && <div className="truncate text-[11.5px] text-ink-3">{hookLabel(row.hookType)}</div>}
      </div>
    </button>
  );
}

/** Miniatura compacta usada como "evidência" (abre o painel do vídeo). */
export function VideoChip({ row, list }: { row: ClientVideoRow; list?: string[] }) {
  const ref = useRef<HTMLButtonElement>(null);
  const openVideo = useOpenVideo();
  return (
    <button
      ref={ref}
      onClick={() => openVideo(row, ref.current, list)}
      className="group inline-flex items-center gap-2 rounded-[6px] py-1 pl-1 pr-2.5 text-left ring-1 ring-hairline transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.97]"
      title={`Abrir vídeo de @${row.handle}`}
    >
      <span className="h-10 w-[23px] shrink-0 overflow-hidden rounded-[4px] bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {row.thumb && <img src={row.thumb} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-110" />}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[11.5px] font-medium text-ink">@{row.handle}</span>
        <span className="block text-[11px] text-ink-2 tabular">
          {row.score?.ratio ? `${row.score.ratio.toFixed(1).replace(".", ",")}×` : "—"} {row.isDemo ? "· demo" : ""}
        </span>
      </span>
    </button>
  );
}
