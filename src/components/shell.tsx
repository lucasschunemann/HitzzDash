"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as Popover from "@radix-ui/react-popover";
import { toast, Toaster } from "sonner";
import { Inbox, Search, AlertTriangle, RefreshCw, CircleCheck, CircleAlert, ChevronsLeft, ChevronsRight, ChevronRight, LogOut, Bell } from "lucide-react";
import { cn } from "@/lib/cn";
import { Kbd, Spinner, Tip, spring } from "./ui";
import { CommandMenu } from "./command-menu";
import { NAV, navFor } from "./nav";
import { PeekProvider } from "./peek";
import { ThemeProvider, ThemeSegment, ThemeToggle } from "./theme";
import { fmtAgo } from "@/lib/format";

export { NAV };

export type ShellStatus = {
  missing: { env: string; label: string; purpose: string }[];
  ffmpeg: boolean;
  /** sse = servidor local com processo contínuo; poll = Vercel (consulta periódica). */
  live: "sse" | "poll";
  auth: boolean;
  /** Dono (Lucas): coleta, pede IA e configura. A equipe só consulta. */
  owner: boolean;
};

const OwnerCtx = createContext(true);
/** true para o dono do dashboard; a equipe vê tudo, mas sem ações que gastam tokens ou créditos. */
export const useOwner = () => useContext(OwnerCtx);

type Live = { version: number; status: QueueStatus | null; refreshStatus: () => void };
const LiveCtx = createContext<Live>({ version: 0, status: null, refreshStatus: () => {} });
export const useLive = () => useContext(LiveCtx);

export type QueueStatus = {
  running: { id: number; type: string; key: string; progress: string | null; label: string }[];
  queued: number;
  failed24h: number;
  lastScrape: number | null;
  unread: number;
  notifications: { id: number; title: string; body: string | null; videoId: string | null; read: boolean; createdAt: number; kind: string }[];
  version: number;
  workerHost: boolean;
  workerLastSeenAt: number | null;
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Largura ≥ 1024px: barra lateral completa. Entre 768 e 1023 (tablet) vira um trilho de ícones. */
function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export function Shell({ children, status }: { children: ReactNode; status: ShellStatus }) {
  const pathname = usePathname();
  const router = useRouter();
  const wide = useIsWide();
  const [collapsedPref, setCollapsedPref] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNotif = useRef<number | null>(null);
  const lastVersion = useRef<number | null>(null);
  const collapsed = collapsedPref || !wide;
  // sem animação na primeira pintura (evita a barra "encolhendo" ao abrir no tablet)
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência salva no navegador (não existe no SSR)
      setCollapsedPref(localStorage.getItem("hitzz.sidebar") === "1");
    } catch {}
  }, []);
  const toggleSidebar = useCallback(() => {
    setCollapsedPref((c) => {
      try {
        localStorage.setItem("hitzz.sidebar", c ? "0" : "1");
      } catch {}
      return !c;
    });
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (!r.ok) return;
      const s = (await r.json()) as QueueStatus;
      setQueue(s);
      // modo poll: a versão do banco mudou desde a última consulta → re-renderiza a página
      if (status.live === "poll" && lastVersion.current !== null && s.version !== lastVersion.current) {
        setVersion((v) => v + 1);
        router.refresh();
      }
      lastVersion.current = s.version;
      const newest = s.notifications[0];
      if (newest && lastNotif.current !== null && newest.id > lastNotif.current && newest.kind === "outlier") {
        toast(newest.title, {
          description: newest.body ?? undefined,
          action: newest.videoId ? { label: "Ver", onClick: () => router.push(`/videos/${encodeURIComponent(newest.videoId!)}`) } : undefined,
        });
      }
      lastNotif.current = newest?.id ?? 0;
    } catch {}
  }, [router, status.live]);

  // Atualização ao vivo: o servidor avisa via SSE quando algo muda; a página se re-renderiza sem recarregar.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- status inicial da fila; depois só via SSE
    refreshStatus();
    if (status.live === "poll") {
      const t = setInterval(() => document.visibilityState === "visible" && refreshStatus(), 20_000);
      return () => clearInterval(t);
    }
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource("/api/events");
      es.addEventListener("change", () => {
        setVersion((v) => v + 1);
        refreshStatus();
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 600);
      });
      es.onerror = () => {
        es?.close();
        retry = setTimeout(connect, 4000);
      };
    };
    connect();
    return () => {
      es?.close();
      clearTimeout(retry);
    };
  }, [router, refreshStatus, status.live]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const current = navFor(pathname);
  const detail = pathname.startsWith("/videos/") ? "Detalhe" : null;

  return (
    <ThemeProvider>
      <TooltipPrimitive.Provider delayDuration={300}>
        <LiveCtx.Provider value={{ version, status: queue, refreshStatus }}>
          <OwnerCtx.Provider value={status.owner}>
          <PeekProvider>
            <div className="flex min-h-dvh">
              {/* Barra lateral (tablet: trilho de ícones; desktop: completa) */}
              <motion.aside
                initial={false}
                animate={{ width: collapsed ? 60 : 248 }}
                transition={animate ? spring : { duration: 0 }}
                className="group/side md:max-lg:!w-[60px] sticky top-0 z-30 hidden h-dvh shrink-0 flex-col overflow-hidden border-r border-hairline bg-sidebar md:flex"
                aria-label="Navegação principal"
              >
                <div className={cn("flex h-12 shrink-0 items-center gap-1 px-2", collapsed && "justify-center")}>
                  <Link href="/" className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-[6px] px-1.5 py-1 transition-colors hover:bg-hover", collapsed && "flex-none")} aria-label="UseHitzz, início">
                    <Logo />
                    {!collapsed && (
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[14px] font-semibold text-ink">UseHitzz</span>
                      </span>
                    )}
                  </Link>
                  {!collapsed && (
                    <Tip content={<span>Recolher barra lateral <span className="opacity-60">⌘\</span></span>} side="bottom">
                      <button onClick={toggleSidebar} className="grid size-7 shrink-0 place-items-center rounded-[6px] text-ink-3 opacity-0 transition-all hover:bg-hover hover:text-ink focus-visible:opacity-100 group-hover/side:opacity-100" aria-label="Recolher barra lateral (⌘\)">
                        <ChevronsLeft className="size-4" />
                      </button>
                    </Tip>
                  )}
                </div>

                <div className="flex flex-col gap-px px-2">
                  <SideButton collapsed={collapsed} icon={<Search className="size-[18px]" />} label="Buscar" onClick={() => setCmdOpen(true)} hint={<Kbd>⌘K</Kbd>} />
                  <NotificationsButton status={queue} onRead={refreshStatus} variant={collapsed ? "rail" : "side"} />
                </div>

                <div className={cn("mb-1 mt-5 px-4 text-[11.5px] font-medium text-ink-3 transition-opacity", collapsed && "opacity-0")}>{!collapsed && "Espaço de trabalho"}</div>
                <nav className="flex flex-col gap-px px-2">
                  {NAV.filter((n) => n.href !== "/settings").map((n) => (
                    <SideLink key={n.href} href={n.href} label={n.label} Icon={n.icon} active={isActive(pathname, n.href)} collapsed={collapsed} />
                  ))}
                </nav>

                <div className="mt-auto flex flex-col gap-2 p-2">
                  {!collapsed && <QueueWidget status={queue} />}
                  <div className="flex flex-col gap-px">
                    {NAV.filter((n) => n.href === "/settings").map((n) => (
                      <SideLink key={n.href} href={n.href} label={n.label} Icon={n.icon} active={isActive(pathname, n.href)} collapsed={collapsed} />
                    ))}
                    {status.auth && (
                      <Tip content={collapsed ? "Sair" : null} side="right">
                        <a href="/api/logout" className={cn("flex h-[30px] items-center gap-2.5 rounded-[6px] px-2 text-[14px] text-ink-2 transition-colors hover:bg-hover hover:text-ink", collapsed && "justify-center px-0")}>
                          <LogOut className="size-[18px] shrink-0 text-ink-3" />
                          {!collapsed && "Sair"}
                        </a>
                      </Tip>
                    )}
                  </div>
                  {collapsed ? (
                    <div className="flex flex-col items-center gap-1">
                      <ThemeToggle />
                      {wide && (
                        <Tip content={<span>Expandir barra lateral <span className="opacity-60">⌘\</span></span>} side="right">
                          <button onClick={toggleSidebar} className="grid size-8 place-items-center rounded-[6px] text-ink-3 hover:bg-hover hover:text-ink" aria-label="Expandir barra lateral (⌘\)">
                            <ChevronsRight className="size-4" />
                          </button>
                        </Tip>
                      )}
                    </div>
                  ) : (
                    <div className="px-1 pb-1">
                      <ThemeSegment />
                    </div>
                  )}
                </div>
              </motion.aside>

              <div className="flex min-w-0 flex-1 flex-col pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
                {/* Barra superior: breadcrumb no tablet/desktop, marca no celular */}
                <header className="glass sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 px-3 md:px-4">
                  <Link href="/" className="flex items-center gap-2 rounded-[6px] px-1 py-1 md:hidden" aria-label="UseHitzz, início">
                    <Logo />
                    <span className="text-[15px] font-semibold">UseHitzz</span>
                  </Link>
                  <nav aria-label="Você está em" className="hidden min-w-0 items-center gap-0.5 text-[14px] md:flex">
                    <Link href="/" className="rounded-[5px] px-1.5 py-0.5 text-ink-2 transition-colors hover:bg-hover hover:text-ink">
                      UseHitzz
                    </Link>
                    {current && (
                      <>
                        <ChevronRight className="size-3.5 shrink-0 text-ink-3" />
                        <Link href={current.href} className={cn("flex min-w-0 items-center gap-1.5 rounded-[5px] px-1.5 py-0.5 transition-colors hover:bg-hover", detail ? "text-ink-2 hover:text-ink" : "text-ink")}>
                          <current.icon className="size-3.5 shrink-0" />
                          <span className="truncate">{current.label}</span>
                        </Link>
                      </>
                    )}
                    {detail && (
                      <>
                        <ChevronRight className="size-3.5 shrink-0 text-ink-3" />
                        <span className="truncate px-1.5 text-ink">{detail}</span>
                      </>
                    )}
                  </nav>
                  <div className="ml-auto flex items-center gap-0.5">
                    <LiveStatus status={queue} />
                    <button onClick={() => setCmdOpen(true)} className="grid size-8 place-items-center rounded-[6px] text-ink-2 transition-colors hover:bg-hover hover:text-ink md:hidden" aria-label="Buscar">
                      <Search className="size-[18px]" />
                    </button>
                    <div className="md:hidden">
                      <NotificationsButton status={queue} onRead={refreshStatus} variant="icon" />
                    </div>
                    <ThemeToggle className={cn(collapsed && "md:hidden")} />
                  </div>
                </header>
                {status.owner && status.missing.length > 0 && <EnvBanner status={status} />}
                <main key={pathname} className="page-in min-w-0 flex-1">
                  {children}
                </main>
              </div>

              {/* Tab bar (celular) */}
              <nav className="glass fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline px-1 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navegação">
                {NAV.map((n) => {
                  const active = isActive(pathname, n.href);
                  const Icon = n.icon;
                  return (
                    <Link key={n.href} href={n.href} className={cn("relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2 text-[10.5px] font-medium transition-colors active:scale-95", active ? "text-ink" : "text-ink-3")} aria-current={active ? "page" : undefined}>
                      <span className="relative grid h-7 w-11 place-items-center">
                        {active && <motion.span layoutId="tab-active" transition={spring} className="absolute inset-0 rounded-full bg-accent-soft" />}
                        <Icon className="relative size-[19px]" strokeWidth={active ? 2.2 : 1.8} />
                      </span>
                      {n.short}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </PeekProvider>
          <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} owner={status.owner} />
          <Toaster
            position="bottom-right"
            offset={16}
            mobileOffset={{ bottom: 84 }}
            toastOptions={{ className: "!rounded-[10px] !bg-[var(--menu)] !text-ink !border-0 !shadow-[var(--shadow-lg)] !font-sans !text-[13.5px]" }}
          />
          </OwnerCtx.Provider>
        </LiveCtx.Provider>
      </TooltipPrimitive.Provider>
    </ThemeProvider>
  );
}

function Logo() {
  return <span className="grid size-[22px] shrink-0 place-items-center rounded-[5px] bg-accent text-[12px] font-bold text-on-accent">H</span>;
}

function SideLink({ href, label, Icon, active, collapsed }: { href: string; label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; active: boolean; collapsed: boolean }) {
  return (
    <Tip content={collapsed ? label : null} side="right">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn("group relative flex h-[30px] items-center gap-2.5 rounded-[6px] px-2 text-[14px] transition-colors", active ? "font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink", collapsed && "justify-center px-0")}
      >
        {active && <motion.span layoutId="nav-active" transition={spring} className="absolute inset-0 -z-10 rounded-[6px] bg-active" />}
        <Icon className={cn("size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-105", active ? "text-ink" : "text-ink-3")} strokeWidth={active ? 2.1 : 1.8} />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    </Tip>
  );
}

function SideButton({ icon, label, onClick, hint, collapsed, badge }: { icon: ReactNode; label: string; onClick?: () => void; hint?: ReactNode; collapsed: boolean; badge?: number }) {
  return (
    <Tip content={collapsed ? label : null} side="right">
      <button onClick={onClick} className={cn("group relative flex h-[30px] w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[14px] text-ink-2 transition-colors hover:bg-hover hover:text-ink data-[state=open]:bg-hover", collapsed && "justify-center px-0")} aria-label={label}>
        <span className="relative text-ink-3 transition-transform duration-200 group-hover:scale-105">
          {icon}
          {collapsed && <Badge n={badge} className="-right-1.5 -top-1" />}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{label}</span>
            {badge ? <Badge n={badge} className="static" /> : <span className="opacity-0 transition-opacity group-hover:opacity-100">{hint}</span>}
          </>
        )}
      </button>
    </Tip>
  );
}

function Badge({ n, className }: { n?: number; className?: string }) {
  return (
    <AnimatePresence>
      {n ? (
        <motion.span
          key={n}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 20 }}
          className={cn("absolute grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-none text-white tabular", className)}
        >
          {n > 9 ? "9+" : n}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

function EnvBanner({ status }: { status: ShellStatus }) {
  return (
    <div role="status" className="page-in px-page mt-4">
      <div className="flex items-start gap-3 rounded-[8px] bg-warn/10 px-4 py-3 text-[13px] leading-relaxed text-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
        <div className="min-w-0">
          <span className="font-semibold">Falta configurar: </span>
          {status.missing.map((m, i) => (
            <span key={m.env}>
              <code className="rounded-[4px] bg-accent-soft px-1 font-mono text-[12px] text-bad">{m.env}</code>
              <span className="text-ink-2"> ({m.purpose.toLowerCase()})</span>
              {i < status.missing.length - 1 ? ", " : ". "}
            </span>
          ))}
          {!status.ffmpeg && <span>ffmpeg não encontrado (frames e áudio ficam indisponíveis). </span>}
          <span className="text-ink-2">
            {status.live === "poll" ? (
              <>Configure em Settings → Environment Variables do projeto na Vercel e faça um novo deploy.{" "}</>
            ) : (
              <>Preencha o <code className="font-mono">.env</code> e reinicie. Enquanto isso, o app funciona com os dados de demonstração.{" "}</>
            )}
            <Link href="/settings" className="link-underline font-medium text-ink">
              Ver integrações
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Indicador discreto no topo: fila rodando, falhas ou tudo em dia. */
function LiveStatus({ status }: { status: QueueStatus | null }) {
  if (!status) return null;
  const busy = status.running.length + status.queued;
  const label = busy ? `${busy} na fila` : status.failed24h ? `${status.failed24h} falha${status.failed24h > 1 ? "s" : ""}` : "Em dia";
  const tip = status.lastScrape ? `Última coleta ${fmtAgo(status.lastScrape)}` : "Nenhuma coleta real ainda";
  return (
    <Tip content={tip} side="bottom">
      <Link href="/settings#fila" className="mr-1 hidden h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] text-ink-2 transition-colors hover:bg-hover hover:text-ink sm:inline-flex">
        <span className="relative grid size-2 place-items-center">
          {busy > 0 && <span className="absolute inset-0 animate-ping rounded-full bg-[var(--band-below)] opacity-60" />}
          <span className={cn("relative size-2 rounded-full", busy ? "bg-[var(--band-below)]" : status.failed24h ? "bg-warn" : "bg-good")} />
        </span>
        {label}
      </Link>
    </Tip>
  );
}

function QueueWidget({ status }: { status: QueueStatus | null }) {
  if (!status) return <div className="skeleton h-14" />;
  const busy = status.running.length + status.queued;
  return (
    <div className="rounded-[8px] px-2 py-2 text-ink-2 ring-1 ring-hairline">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
        {busy && status.running.length ? <Spinner className="text-ink" /> : busy ? <RefreshCw className="size-3.5 text-ink-3" /> : status.failed24h ? <CircleAlert className="size-3.5 text-warn" /> : <CircleCheck className="size-3.5 text-good" />}
        <span className="truncate">{busy ? `${busy} ${busy === 1 ? "tarefa" : "tarefas"} na fila` : status.failed24h ? `${status.failed24h} falha(s) nas últimas 24h` : "Tudo processado"}</span>
      </div>
      <AnimatePresence initial={false}>
        {status.running.slice(0, 2).map((r) => (
          <motion.div key={r.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-1 truncate pl-5.5 text-[11.5px] text-ink-3">
            {r.label}
            {r.progress ? ` · ${r.progress}` : ""}
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="mt-1 truncate pl-5.5 text-[11.5px] text-ink-3">{status.lastScrape ? `Última coleta ${fmtAgo(status.lastScrape)}` : "Nenhuma coleta real ainda"}</div>
      {!status.workerHost && (
        <div className="truncate pl-5.5 text-[11.5px] text-ink-3" title="Coleta, transcrição e análise rodam no Mac (npm run cc -- work e Claude Code)">
          {status.workerLastSeenAt ? `Mac processou ${fmtAgo(status.workerLastSeenAt)}` : "O Mac ainda não processou a fila"}
          {busy ? " · roda na próxima vez" : ""}
        </div>
      )}
    </div>
  );
}

function NotificationsButton({ status, onRead, variant }: { status: QueueStatus | null; onRead: () => void; variant: "side" | "rail" | "icon" }) {
  const unread = status?.unread ?? 0;
  const markRead = async () => {
    await fetch("/api/notifications", { method: "POST" });
    onRead();
  };
  return (
    <Popover.Root onOpenChange={(o) => !o && unread && markRead()}>
      <Popover.Trigger asChild>
        {variant === "icon" ? (
          <button className="relative grid size-8 place-items-center rounded-[6px] text-ink-2 transition-colors hover:bg-hover hover:text-ink" aria-label={`Notificações${unread ? ` (${unread} novas)` : ""}`}>
            <Bell className="size-[18px]" />
            <Badge n={unread} className="right-0.5 top-0.5" />
          </button>
        ) : (
          <div>
            <SideButton collapsed={variant === "rail"} icon={<Inbox className="size-[18px]" />} label="Caixa de entrada" badge={unread} />
          </div>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side={variant === "icon" ? "bottom" : "right"} align={variant === "icon" ? "end" : "start"} sideOffset={8} collisionPadding={12} className="menu-surface z-[70] w-[min(340px,calc(100vw-24px))] rounded-[10px] p-1">
          <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
            <span className="text-[13px] font-semibold text-ink">Caixa de entrada</span>
            {unread > 0 && <span className="text-[12px] text-ink-3">{unread} nova{unread > 1 ? "s" : ""}</span>}
          </div>
          <div className="scrollbar-thin max-h-[60vh] overflow-auto">
            {!status?.notifications.length && (
              <div className="px-3 py-10 text-center">
                <Inbox className="mx-auto mb-2 size-6 text-ink-3" strokeWidth={1.5} />
                <p className="text-[13px] text-ink-3">Nada por aqui ainda.</p>
              </div>
            )}
            {status?.notifications.map((n) => {
              const body = (
                <div className="flex gap-2.5 rounded-[6px] px-2.5 py-2 transition-colors hover:bg-hover">
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-[var(--band-below)]")} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink">{n.title}</div>
                    {n.body && <div className="text-[12.5px] text-ink-2">{n.body}</div>}
                    <div className="mt-0.5 text-[11.5px] text-ink-3">{fmtAgo(n.createdAt)}</div>
                  </div>
                </div>
              );
              return n.videoId ? (
                <Link key={n.id} href={`/videos/${encodeURIComponent(n.videoId)}`}>
                  {body}
                </Link>
              ) : (
                <div key={n.id}>{body}</div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Cabeçalho de página no estilo Notion: ícone grande, título, descrição e ações. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname();
  const Icon = navFor(pathname)?.icon;
  return (
    <header className="px-page pb-8 pt-8 md:pb-10 md:pt-14">
      {Icon && (
        <motion.div initial={{ opacity: 0, scale: 0.8, rotate: -8 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className="mb-4 grid size-12 place-items-center rounded-[10px] text-ink md:size-14">
          <Icon className="size-9 md:size-10" strokeWidth={1.4} />
        </motion.div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-[760px]">
          <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.025em] text-ink md:text-[40px]">{title}</h1>
          {subtitle && <div className="mt-2.5 text-[14.5px] leading-relaxed text-ink-2 md:text-[15px]">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
