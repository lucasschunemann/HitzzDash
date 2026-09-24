"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { Maximize2, X, ChevronUp, ChevronDown } from "lucide-react";
import type { VideoDetailData } from "@/server/detail";
import { VideoDetail, VideoDetailSkeleton } from "./video-detail";
import { useLive } from "./shell";
import { Tip } from "./ui";

type Origin = { rect: DOMRect; thumb: string | null } | null;
type PeekCtx = { open: (id: string, origin?: Origin, list?: string[]) => void };
const Ctx = createContext<PeekCtx>({ open: () => {} });
export const usePeek = () => useContext(Ctx);

export function PeekProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Origin>(null);
  const [list, setList] = useState<string[]>([]);
  const [data, setData] = useState<VideoDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { version } = useLive();

  const open = useCallback((vid: string, o?: Origin, l?: string[]) => {
    setOrigin(o ?? null);
    setList(l ?? []);
    setId(vid);
  }, []);

  const load = useCallback(async (vid: string) => {
    try {
      const r = await fetch(`/api/videos/${encodeURIComponent(vid)}`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Falha ao carregar");
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa o painel ao trocar de vídeo antes do fetch
    setData(null);
    load(id);
  }, [id, load]);

  // atualização ao vivo enquanto o painel está aberto (ex.: etapa do pipeline terminou)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recarrega do servidor quando o SSE avisa mudança
    if (id && version) load(id);
  }, [version, id, load]);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!id || !list.length) return;
      const i = list.indexOf(id);
      const next = list[i + dir];
      if (next) {
        setOrigin(null);
        setId(next);
      }
    },
    [id, list],
  );

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,[role=combobox],[role=listbox]")) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        step(1);
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, step]);

  const idx = id ? list.indexOf(id) : -1;

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <Dialog.Root open={Boolean(id)} onOpenChange={(o) => !o && setId(null)}>
        <AnimatePresence>
          {id && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="fixed inset-0 z-[60] bg-black/15 dark:bg-black/40" />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  initial={{ x: origin?.thumb ? 0 : 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 40, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 36 }}
                  className="glass-strong fixed inset-x-0 bottom-0 top-[6vh] z-[61] flex flex-col overflow-hidden rounded-t-[22px] shadow-lg ring-1 ring-hairline md:inset-y-2 md:left-auto md:right-2 md:top-2 md:w-[min(640px,calc(100vw-80px))] md:rounded-[20px]"
                >
                  <div className="flex h-12 shrink-0 items-center gap-1 border-b border-hairline px-3">
                    <div className="mx-auto h-1 w-9 rounded-full bg-hairline-strong md:hidden" aria-hidden />
                    <Dialog.Title className="sr-only">Detalhe do vídeo</Dialog.Title>
                    <div className="hidden items-center gap-0.5 md:flex">
                      <Tip content="Anterior (↑ ou k)">
                        <button disabled={idx <= 0} onClick={() => step(-1)} className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 disabled:opacity-30" aria-label="Vídeo anterior">
                          <ChevronUp className="size-4" />
                        </button>
                      </Tip>
                      <Tip content="Próximo (↓ ou j)">
                        <button disabled={idx < 0 || idx >= list.length - 1} onClick={() => step(1)} className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 disabled:opacity-30" aria-label="Próximo vídeo">
                          <ChevronDown className="size-4" />
                        </button>
                      </Tip>
                    </div>
                    <div className="ml-auto flex items-center gap-0.5">
                      <Tip content="Abrir em página cheia">
                        <Link href={`/videos/${encodeURIComponent(id)}`} onClick={() => setId(null)} className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Abrir em página cheia">
                          <Maximize2 className="size-4" />
                        </Link>
                      </Tip>
                      <Dialog.Close className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface-2" aria-label="Fechar (Esc)">
                        <X className="size-4" />
                      </Dialog.Close>
                    </div>
                  </div>
                  <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">
                    {error ? (
                      <p className="p-8 text-center text-[13px] text-bad">{error}</p>
                    ) : data && data.row.id === id ? (
                      <VideoDetail data={data} compact heroRef={undefined} origin={origin} />
                    ) : (
                      <VideoDetailSkeleton />
                    )}
                  </div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </Ctx.Provider>
  );
}

/**
 * Transição compartilhada: um "fantasma" da capa sai da posição do card e voa até a capa do painel.
 * Implementado como FLIP manual porque o card continua montado atrás do painel.
 */
export function FlyingThumb({ origin, targetRef, onDone }: { origin: Origin; targetRef: React.RefObject<HTMLElement | null>; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [target, setTarget] = useState<DOMRect | null>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    if (!origin || reduce) {
      onDone();
      return;
    }
    const measure = () => {
      const el = targetRef.current;
      if (el) setTarget(el.getBoundingClientRect());
    };
    const t = setTimeout(measure, 40);
    return () => clearTimeout(t);
  }, [origin, reduce, targetRef, onDone]);
  if (!origin || !target || reduce || !origin.thumb) return null;
  return createPortal(
    <motion.img
      src={origin.thumb}
      alt=""
      aria-hidden
      initial={{ left: origin.rect.left, top: origin.rect.top, width: origin.rect.width, height: origin.rect.height, borderRadius: 12, opacity: 1 }}
      animate={{ left: target.left, top: target.top, width: target.width, height: target.height, borderRadius: 14 }}
      transition={{ type: "spring", stiffness: 340, damping: 34 }}
      onAnimationComplete={() => {
        if (done.current) return;
        done.current = true;
        onDone();
      }}
      className="pointer-events-none fixed z-[70] object-cover shadow-lg"
    />,
    document.body,
  );
}
