"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as Popover from "@radix-ui/react-popover";
import { toast, Toaster } from "sonner";
import {
  Settings,
  PanelLeft,
  Bell,
  Search,
  AlertTriangle,
  RefreshCw,
  CircleCheck,
  CircleAlert,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Kbd, Spinner, spring } from "./ui";
import { CommandMenu } from "./command-menu";
import { NAV } from "./nav";
import { PeekProvider } from "./peek";
import { fmtAgo } from "@/lib/format";

export { NAV };

export type ShellStatus = {
  missing: { env: string; label: string; purpose: string }[];
  ffmpeg: boolean;
  /** sse = servidor local com processo contínuo; poll = Vercel (consulta periódica). */
  live: "sse" | "poll";
  auth: boolean;
};

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

export function Shell({ children, status }: { children: ReactNode; status: ShellStatus }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNotif = useRef<number | null>(null);
  const lastVersion = useRef<number | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência salva no navegador (não existe no SSR)
      setCollapsed(localStorage.getItem("hitzz.sidebar") === "1");
    } catch {}
  }, []);
  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
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

  return (
    <TooltipPrimitive.Provider>
      <LiveCtx.Provider value={{ version, status: queue, refreshStatus }}>
        <PeekProvider>
        <div className="flex min-h-dvh">
          {/* Sidebar (desktop) */}
          <motion.aside
            initial={false}
            animate={{ width: collapsed ? 64 : 240 }}
            transition={spring}
            className="glass sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-hairline md:flex"
            aria-label="Navegação principal"
          >
            <div className={cn("flex h-13 items-center gap-2 px-3.5", collapsed && "justify-center px-0")}>
              <Link href="/" className="flex items-center gap-2 rounded-lg" aria-label="UseHitzz, início">
                <span className="squircle grid size-7 place-items-center rounded-[8px] bg-accent text-[13px] font-bold text-white shadow-sm">H</span>
                {!collapsed && (
                  <span className="leading-tight">
                    <span className="block text-[13.5px] font-semibold">UseHitzz</span>
                    <span className="block text-[11px] text-ink-3">Inteligência de conteúdo</span>
                  </span>
                )}
              </Link>
            </div>
            <button
              onClick={() => setCmdOpen(true)}
              className={cn(
                "mx-2.5 mb-2 flex h-8 items-center gap-2 rounded-[9px] bg-surface-2/70 px-2.5 text-[12.5px] text-ink-3 ring-1 ring-hairline transition-colors hover:text-ink-2",
                collapsed && "mx-auto w-9 justify-center px-0",
              )}
              aria-label="Abrir busca e comandos"
            >
              <Search className="size-3.5" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Buscar ou agir</span>
                  <Kbd>⌘K</Kbd>
                </>
              )}
            </button>
            <nav className="flex flex-col gap-0.5 px-2.5">
              {NAV.map((n) => {
                const active = isActive(pathname, n.href);
                const Icon = n.icon;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    title={collapsed ? n.label : undefined}
                    className={cn(
                      "relative flex h-8 items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] font-medium transition-colors",
                      active ? "text-ink" : "text-ink-2 hover:bg-surface-2/70 hover:text-ink",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    {active && <motion.span layoutId="nav-active" transition={spring} className="absolute inset-0 -z-10 rounded-[9px] bg-surface shadow-sm ring-1 ring-hairline" />}
                    <Icon className={cn("size-4 shrink-0", active && "text-accent")} strokeWidth={2} />
                    {!collapsed && n.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto flex flex-col gap-2 p-2.5">
              {!collapsed && <QueueWidget status={queue} />}
              {status.auth && !collapsed && (
                <a href="/api/logout" className="px-1 text-[11.5px] text-ink-3 hover:text-ink">
                  Sair
                </a>
              )}
              <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "justify-between")}>
                <NotificationsButton status={queue} onRead={refreshStatus} />
                <button onClick={toggleSidebar} className="grid size-8 place-items-center rounded-[9px] text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={collapsed ? "Expandir barra lateral (⌘\\)" : "Recolher barra lateral (⌘\\)"} title="⌘\">
                  <PanelLeft className="size-4" />
                </button>
              </div>
            </div>
          </motion.aside>

          <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
            {/* Barra superior mobile */}
            <div className="glass sticky top-0 z-30 flex h-12 items-center justify-between border-b border-hairline px-4 md:hidden">
              <Link href="/" className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-[7px] bg-accent text-[12px] font-bold text-white">H</span>
                <span className="text-[14px] font-semibold">UseHitzz</span>
              </Link>
              <div className="flex items-center gap-1">
                <button onClick={() => setCmdOpen(true)} className="grid size-9 place-items-center rounded-full text-ink-2" aria-label="Buscar">
                  <Search className="size-4.5" />
                </button>
                <NotificationsButton status={queue} onRead={refreshStatus} />
              </div>
            </div>
            {status.missing.length > 0 && <EnvBanner status={status} />}
            <main className="min-w-0 flex-1">{children}</main>
          </div>

          {/* Tab bar (mobile, estilo iOS) */}
          <nav className="glass fixed inset-x-0 bottom-0 z-40 flex border-t border-hairline pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navegação">
            {NAV.filter((n) => n.href !== "/settings").map((n) => {
              const active = isActive(pathname, n.href);
              const Icon = n.icon;
              return (
                <Link key={n.href} href={n.href} className={cn("flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px] font-medium", active ? "text-accent" : "text-ink-3")}>
                  <Icon className="size-5.5" strokeWidth={active ? 2.2 : 1.8} />
                  {n.label}
                </Link>
              );
            })}
            <Link href="/settings" className={cn("flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px] font-medium", isActive(pathname, "/settings") ? "text-accent" : "text-ink-3")}>
              <Settings className="size-5.5" strokeWidth={1.8} />
              Ajustes
            </Link>
          </nav>
        </div>
        </PeekProvider>
        <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
        <Toaster position="bottom-right" toastOptions={{ className: "!rounded-xl !shadow-lg !ring-1 !ring-hairline !bg-[var(--glass-strong)] !backdrop-blur-xl !text-ink !border-0" }} />
      </LiveCtx.Provider>
    </TooltipPrimitive.Provider>
  );
}

function EnvBanner({ status }: { status: ShellStatus }) {
  return (
    <div role="status" className="mx-4 mt-3 flex items-start gap-2.5 rounded-xl bg-warn/10 px-3.5 py-2.5 text-[12.5px] text-ink ring-1 ring-warn/25 md:mx-8">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="min-w-0">
        <span className="font-semibold">Falta configurar: </span>
        {status.missing.map((m, i) => (
          <span key={m.env}>
            <code className="rounded bg-surface-2 px-1 font-mono text-[11.5px]">{m.env}</code>
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
          <Link href="/settings" className="font-medium text-accent-ink underline-offset-2 hover:underline">
            Ver integrações
          </Link>
        </span>
      </div>
    </div>
  );
}

function QueueWidget({ status }: { status: QueueStatus | null }) {
  if (!status) return <div className="skeleton h-12" />;
  const busy = status.running.length + status.queued;
  return (
    <div className="rounded-[11px] bg-surface/70 p-2.5 ring-1 ring-hairline">
      <div className="flex items-center gap-2 text-[12px] font-medium">
        {busy && status.running.length ? <Spinner className="text-accent" /> : busy ? <RefreshCw className="size-3.5 text-ink-3" /> : status.failed24h ? <CircleAlert className="size-3.5 text-warn" /> : <CircleCheck className="size-3.5 text-good" />}
        <span className="truncate">{busy ? `${busy} ${busy === 1 ? "tarefa" : "tarefas"} na fila` : status.failed24h ? `${status.failed24h} falha(s) nas últimas 24h` : "Tudo processado"}</span>
      </div>
      <AnimatePresence initial={false}>
        {status.running.slice(0, 2).map((r) => (
          <motion.div key={r.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-1 truncate text-[11.5px] text-ink-3">
            {r.label}
            {r.progress ? ` · ${r.progress}` : ""}
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-3">
        <RefreshCw className="size-3" />
        {status.lastScrape ? `Última coleta ${fmtAgo(status.lastScrape)}` : "Nenhuma coleta real ainda"}
      </div>
      {!status.workerHost && (
        <div className="mt-0.5 text-[11px] text-ink-3" title="Coleta, transcrição e análise rodam no Mac (npm run cc -- work e Claude Code)">
          {status.workerLastSeenAt ? `Mac processou ${fmtAgo(status.workerLastSeenAt)}` : "O Mac ainda não processou a fila"}
          {busy ? " · a fila roda na próxima vez" : ""}
        </div>
      )}
    </div>
  );
}

function NotificationsButton({ status, onRead }: { status: QueueStatus | null; onRead: () => void }) {
  const unread = status?.unread ?? 0;
  const markRead = async () => {
    await fetch("/api/notifications", { method: "POST" });
    onRead();
  };
  return (
    <Popover.Root onOpenChange={(o) => !o && unread && markRead()}>
      <Popover.Trigger asChild>
        <button className="relative grid size-8 place-items-center rounded-[9px] text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Notificações${unread ? ` (${unread} novas)` : ""}`}>
          <Bell className="size-4" />
          {unread > 0 && <span className="absolute right-1 top-1 grid min-w-3.5 place-items-center rounded-full bg-accent px-0.5 text-[9px] font-bold leading-3.5 text-white">{unread}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={8} className="glass-strong z-[70] w-80 rounded-2xl p-1.5 shadow-lg ring-1 ring-hairline">
          <div className="px-2.5 py-1.5 text-[12px] font-semibold text-ink-2">Notificações</div>
          <div className="scrollbar-thin max-h-80 overflow-auto">
            {!status?.notifications.length && <p className="px-2.5 py-6 text-center text-[12.5px] text-ink-3">Nada por aqui ainda.</p>}
            {status?.notifications.map((n) => {
              const body = (
                <div className={cn("rounded-xl px-2.5 py-2 hover:bg-surface-2", !n.read && "bg-accent-soft/60")}>
                  <div className="text-[12.5px] font-medium text-ink">{n.title}</div>
                  {n.body && <div className="text-[12px] text-ink-2">{n.body}</div>}
                  <div className="mt-0.5 text-[11px] text-ink-3">{fmtAgo(n.createdAt)}</div>
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

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-4 pb-5 pt-6 md:px-8 md:pt-9">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold tracking-[-0.025em] text-ink md:text-[30px]">{title}</h1>
        {subtitle && <div className="mt-1 text-[13.5px] text-ink-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
