"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "motion/react";
import { Search, Table2, LayoutGrid, Columns3, SlidersHorizontal, ArrowUpDown, Group, X, ChevronRight, Check, Film } from "lucide-react";
import type { ClientVideoRow } from "@/server/data";
import { HOOK_TYPES, THEMES, FORMATS, OFFER_TYPES, GROUPS, hookLabel, themeLabel, formatLabel, offerLabel } from "@/lib/taxonomy";
import { BAND_LABEL, type Band } from "@/lib/scoring";
import { fmtCompact, fmtScore, fmtPct, fmtDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { BandBadge, BAND_VAR } from "./badges";
import { Segmented, Kbd, EmptyState, spring } from "./ui";
import { VideoCard, useOpenVideo } from "./video-card";

type View = "table" | "gallery" | "board";
type SortKey = "score" | "views" | "ratio" | "date" | "engagement";
type GroupKey = "none" | "account" | "hookType" | "theme" | "format" | "band";
export type Filters = {
  q: string;
  accounts: number[];
  groups: string[];
  bands: string[];
  hooks: string[];
  themes: string[];
  formats: string[];
  offers: string[];
  period: "all" | "7" | "30" | "90";
  hideDemo: boolean;
  onlyAnalyzed: boolean;
};

const EMPTY: Filters = { q: "", accounts: [], groups: [], bands: [], hooks: [], themes: [], formats: [], offers: [], period: "all", hideDemo: false, onlyAnalyzed: false };
const BAND_ORDER: Band[] = ["breakout", "above", "normal", "below", "maturing"];
const SORT_LABEL: Record<SortKey, string> = { score: "Score", ratio: "Razão vs mediana", views: "Views", engagement: "Engajamento", date: "Data" };
const GROUP_LABEL: Record<GroupKey, string> = { none: "Sem agrupamento", account: "Conta", hookType: "Tipo de hook", theme: "Tema", format: "Formato", band: "Faixa de desempenho" };

export function VideoDatabase({ rows, accounts, initial, now }: { rows: ClientVideoRow[]; accounts: { id: number; handle: string }[]; initial: Partial<Filters>; now: number }) {
  const [view, setView] = useState<View>("table");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const [f, setF] = useState<Filters>({ ...EMPTY, ...initial });
  const searchRef = useRef<HTMLInputElement>(null);

  // preferências da visão ficam no navegador
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("hitzz.videos.view") ?? "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferências da visão salvas no navegador (não existem no SSR)
      if (s.view) setView(s.view);
      else if (window.innerWidth < 768) setView("gallery");
      if (s.sort) setSort(s.sort);
      if (s.groupBy) setGroupBy(s.groupBy);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("hitzz.videos.view", JSON.stringify({ view, sort, groupBy }));
    } catch {}
  }, [view, sort, groupBy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea,select")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = f.q
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    const cutoff = f.period === "all" ? 0 : now - Number(f.period) * 86_400_000;
    const out = rows.filter((r) => {
      if (f.accounts.length && !f.accounts.includes(r.accountId)) return false;
      if (f.groups.length && !f.groups.includes(r.group)) return false;
      if (f.bands.length && !f.bands.includes(r.score?.band ?? "")) return false;
      if (f.hooks.length && !f.hooks.includes(r.hookType ?? "")) return false;
      if (f.themes.length && !f.themes.includes(r.theme ?? "")) return false;
      if (f.formats.length && !f.formats.includes(r.format ?? "")) return false;
      if (f.offers.length && !f.offers.includes(r.offerType ?? "")) return false;
      if (r.publishedAt < cutoff) return false;
      if (f.hideDemo && r.isDemo) return false;
      if (f.onlyAnalyzed && !r.hookType) return false;
      if (q) {
        const hay = [r.handle, r.hookText, r.topic, r.caption, hookLabel(r.hookType), themeLabel(r.theme)]
          .join(" ")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const val = (r: ClientVideoRow): number => {
      switch (sort.key) {
        case "score":
          return r.score?.score ?? -99;
        case "ratio":
          return r.score?.ratio ?? -1;
        case "views":
          return r.views ?? -1;
        case "engagement":
          return r.score?.engagementRate ?? -1;
        case "date":
          return r.publishedAt;
      }
    };
    // fixados têm views infladas: em ordenações por desempenho vão para o fim
    const sinkPinned = sort.key === "score" || sort.key === "ratio";
    return out.sort((a, b) => (sinkPinned && a.isPinned !== b.isPinned ? (a.isPinned ? 1 : -1) : (val(a) - val(b)) * sort.dir));
  }, [rows, f, sort, now]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", items: filtered }];
    const keyOf = (r: ClientVideoRow) =>
      groupBy === "account" ? r.handle : groupBy === "band" ? (r.score?.band ?? "—") : ((r[groupBy] as string | null) ?? "—");
    const labelOf = (k: string) =>
      groupBy === "account" ? `@${k}` : groupBy === "hookType" ? hookLabel(k) : groupBy === "theme" ? themeLabel(k) : groupBy === "format" ? formatLabel(k) : groupBy === "band" ? (BAND_LABEL[k as Band] ?? "Sem score") : k;
    const m = new Map<string, ClientVideoRow[]>();
    for (const r of filtered) {
      const k = keyOf(r);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    const arr = [...m.entries()].map(([key, items]) => ({ key, label: labelOf(key), items }));
    if (groupBy === "band") arr.sort((a, b) => BAND_ORDER.indexOf(a.key as Band) - BAND_ORDER.indexOf(b.key as Band));
    else arr.sort((a, b) => b.items.length - a.items.length);
    return arr;
  }, [filtered, groupBy]);

  const ids = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.id)), [groups]);
  const activeCount = f.accounts.length + f.groups.length + f.bands.length + f.hooks.length + f.themes.length + f.formats.length + f.offers.length + (f.period !== "all" ? 1 : 0) + (f.hideDemo ? 1 : 0) + (f.onlyAnalyzed ? 1 : 0);
  const accLabel = (id: number) => `@${accounts.find((a) => a.id === id)?.handle ?? id}`;

  const chips: { label: string; clear: () => void }[] = [
    ...f.accounts.map((a) => ({ label: accLabel(a), clear: () => setF({ ...f, accounts: f.accounts.filter((x) => x !== a) }) })),
    ...f.groups.map((g) => ({ label: GROUPS[g as keyof typeof GROUPS], clear: () => setF({ ...f, groups: f.groups.filter((x) => x !== g) }) })),
    ...f.bands.map((b) => ({ label: BAND_LABEL[b as Band], clear: () => setF({ ...f, bands: f.bands.filter((x) => x !== b) }) })),
    ...f.hooks.map((h) => ({ label: hookLabel(h), clear: () => setF({ ...f, hooks: f.hooks.filter((x) => x !== h) }) })),
    ...f.themes.map((h) => ({ label: themeLabel(h), clear: () => setF({ ...f, themes: f.themes.filter((x) => x !== h) }) })),
    ...f.formats.map((h) => ({ label: formatLabel(h), clear: () => setF({ ...f, formats: f.formats.filter((x) => x !== h) }) })),
    ...f.offers.map((h) => ({ label: offerLabel(h), clear: () => setF({ ...f, offers: f.offers.filter((x) => x !== h) }) })),
    ...(f.period !== "all" ? [{ label: `Últimos ${f.period} dias`, clear: () => setF({ ...f, period: "all" }) }] : []),
    ...(f.hideDemo ? [{ label: "Sem demo", clear: () => setF({ ...f, hideDemo: false }) }] : []),
    ...(f.onlyAnalyzed ? [{ label: "Só analisados", clear: () => setF({ ...f, onlyAnalyzed: false }) }] : []),
  ];

  return (
    <div>
      {/* Barra de ferramentas */}
      <div className="glass sticky top-12 z-20 bleed-page px-page border-b border-hairline py-2.5">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
          <ViewTabs
            value={view}
            onChange={setView}
            options={[
              { value: "table", label: "Tabela", icon: <Table2 className="size-4" /> },
              { value: "gallery", label: "Galeria", icon: <LayoutGrid className="size-4" /> },
              { value: "board", label: "Board", icon: <Columns3 className="size-4" /> },
            ]}
          />
          <div className="relative order-last w-full sm:order-none sm:ml-auto sm:w-60 lg:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              ref={searchRef}
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
              placeholder="Buscar hook, legenda, conta…"
              aria-label="Buscar vídeos"
              className="h-8 w-full rounded-[6px] bg-accent-soft pl-8 pr-8 text-[13.5px] text-ink outline-none transition-[background-color,box-shadow] placeholder:text-ink-3 focus:bg-surface focus:ring-2 focus:ring-[var(--focus)]"
            />
            <span className="absolute right-2 top-1/2 hidden -translate-y-1/2 sm:block">
              <Kbd>/</Kbd>
            </span>
          </div>
          <FilterPopover f={f} setF={setF} accounts={accounts} count={activeCount} />
          <MenuPopover icon={<ArrowUpDown className="size-3.5" />} label={`Ordenar: ${SORT_LABEL[sort.key]}`}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <MenuItem key={k} active={sort.key === k} onClick={() => setSort({ key: k, dir: sort.key === k ? ((sort.dir * -1) as 1 | -1) : -1 })}>
                {SORT_LABEL[k]} {sort.key === k && <span className="ml-auto text-ink-3">{sort.dir === -1 ? "↓ maior primeiro" : "↑ menor primeiro"}</span>}
              </MenuItem>
            ))}
          </MenuPopover>
          <MenuPopover icon={<Group className="size-3.5" />} label={groupBy === "none" ? "Agrupar" : `Por ${GROUP_LABEL[groupBy].toLowerCase()}`}>
            {(Object.keys(GROUP_LABEL) as GroupKey[]).map((k) => (
              <MenuItem key={k} active={groupBy === k} onClick={() => setGroupBy(k)}>
                {GROUP_LABEL[k]}
              </MenuItem>
            ))}
          </MenuPopover>
          <span className="ml-auto text-[12.5px] text-ink-3 tabular sm:ml-1">
            {filtered.length} de {rows.length}
          </span>
        </div>
        <AnimatePresence initial={false}>
          {chips.length > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                {chips.map((c) => (
                  <button key={c.label} onClick={c.clear} className="group inline-flex h-7 items-center gap-1 rounded-full bg-surface pl-3 pr-2 text-[12.5px] font-medium text-ink ring-1 ring-hairline-strong transition-[background-color,transform] hover:bg-hover active:scale-95" aria-label={`Remover filtro ${c.label}`}>
                    {c.label}
                    <X className="size-3 text-ink-3 transition-transform group-hover:rotate-90 group-hover:text-ink" />
                  </button>
                ))}
                <button onClick={() => setF({ ...EMPTY, q: f.q })} className="ml-1 text-[12.5px] text-ink-3 transition-colors hover:text-ink">
                  Limpar filtros
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pt-6">
        {filtered.length === 0 ? (
          <EmptyState icon={<Film className="size-5" />} title="Nenhum vídeo com esses filtros">
            Tente remover algum filtro ou buscar outro termo.
          </EmptyState>
        ) : view === "board" ? (
          <Board rows={filtered} groupBy={groupBy === "none" ? "band" : groupBy} ids={ids} />
        ) : (
          <div className="space-y-10">
            {groups.map((g) => (
              <GroupSection key={g.key} label={g.label} count={g.items.length} grouped={groupBy !== "none"}>
                {view === "table" ? <Table rows={g.items} ids={ids} now={now} /> : <Gallery rows={g.items} ids={ids} />}
              </GroupSection>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ViewTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon: ReactNode }[] }) {
  return (
    <div role="tablist" aria-label="Visão" className="flex items-center gap-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn("relative inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2 text-[14px] transition-colors hover:bg-hover", on ? "font-medium text-ink max-sm:bg-active" : "text-ink-3 hover:text-ink-2")}
          >
            {o.icon}
            <span className="hidden sm:inline">{o.label}</span>
            {on && <motion.span layoutId="view-tab" transition={spring} className="absolute inset-x-1.5 -bottom-[11px] hidden h-[2px] rounded-full bg-ink sm:block" />}
          </button>
        );
      })}
    </div>
  );
}

function GroupSection({ label, count, grouped, children }: { label: string; count: number; grouped: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  if (!grouped) return <>{children}</>;
  return (
    <section>
      <button onClick={() => setOpen(!open)} className="mb-3 flex items-center gap-1.5 rounded-[5px] px-1.5 py-1 text-[14px] font-semibold text-ink transition-colors hover:bg-hover" aria-expanded={open}>
        <ChevronRight className={cn("size-3.5 text-ink-3 transition-transform duration-200", open && "rotate-90")} />
        {label}
        <span className="font-normal text-ink-3 tabular">{count}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function StatusDot({ r }: { r: ClientVideoRow }) {
  const st = r.status;
  const vals = [st.media, st.transcript, st.frames, st.analysis];
  const state = vals.includes("running") ? "running" : st.analysis === "skipped" ? "baseline" : st.analysis === "done" ? (vals.includes("failed") ? "partial" : "done") : vals.includes("failed") ? "failed" : vals.includes("blocked") ? "blocked" : st.analysis === "external" ? "external" : "pending";
  const map = {
    done: ["bg-good", "Coletado, transcrito e analisado"],
    partial: ["bg-warn", "Analisado com etapas faltando"],
    running: ["bg-[var(--band-below)] animate-pulse", "Processando"],
    failed: ["bg-bad", `Falhou: ${st.lastError ?? ""}`],
    blocked: ["bg-warn", `Aguardando configuração: ${st.lastError ?? ""}`],
    external: ["bg-warn", "Aguardando análise no Claude Code"],
    pending: ["bg-ink-3", "Na fila"],
    baseline: ["ring-1 ring-inset ring-ink-3", "Fora da janela semanal: só métricas e capa, sem análise"],
  } as const;
  return <span title={map[state][1]} className={cn("inline-block size-2 rounded-full", map[state][0])} />;
}

function Table({ rows, ids, now }: { rows: ClientVideoRow[]; ids: string[]; now: number }) {
  const openVideo = useOpenVideo();
  const [limit, setLimit] = useState(80);
  const th = "px-2.5 py-2.5 text-left text-[12.5px] font-normal text-ink-3";
  return (
    <div className="scrollbar-thin overflow-x-auto border-t border-hairline">
      <table className="w-full min-w-[980px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-hairline">
            <th className={cn(th, "w-12 pl-2")}>
              <span className="sr-only">Capa</span>
            </th>
            <th className={th}>Hook</th>
            <th className={th}>Conta</th>
            <th className={th}>Tipo de hook</th>
            <th className={th}>Tema</th>
            <th className={th}>Formato</th>
            <th className={th}>Desempenho</th>
            <th className={cn(th, "text-right")}>Score</th>
            <th className={cn(th, "text-right")}>Views</th>
            <th className={cn(th, "text-right")}>Eng.</th>
            <th className={cn(th, "text-right")}>Data</th>
            <th className={cn(th, "w-8 pr-2")}>
              <span className="sr-only">Status</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r) => (
            <tr
              key={r.id}
              tabIndex={0}
              onClick={(e) => openVideo(r, e.currentTarget as HTMLElement, ids)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openVideo(r, e.currentTarget as HTMLElement, ids);
                }
                if (e.key === "ArrowDown") (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
                if (e.key === "ArrowUp") (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
              }}
              className="group cursor-pointer border-b border-hairline transition-colors hover:bg-hover focus:bg-active focus:outline-none"
            >
              <td className="py-2 pl-2">
                <div className="h-11 w-[25px] overflow-hidden rounded-[4px] bg-surface-2 ring-1 ring-hairline">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.thumb && <img src={r.thumb} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-110" />}
                </div>
              </td>
              <td className="max-w-[280px] px-2.5">
                <div className="truncate font-medium text-ink">{r.hookText || r.topic || r.caption?.split("\n")[0] || "—"}</div>
                <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                  {r.isDemo && <span className="font-semibold text-warn">DEMO</span>}
                  {r.isPinned && <span>fixado</span>}
                  {r.isSponsored && <span>parceria</span>}
                  {r.speechKind && <span>{r.speechKind === "speech" ? "com fala" : "sem fala"}</span>}
                </div>
              </td>
              <td className="whitespace-nowrap px-2.5 text-ink-2">@{r.handle}</td>
              <td className="whitespace-nowrap px-2.5 text-ink-2">
                {hookLabel(r.hookType)}
                {r.hookManual && <span className="ml-1 text-[10.5px] text-accent-ink">(manual)</span>}
              </td>
              <td className="whitespace-nowrap px-2.5 text-ink-2">{themeLabel(r.theme)}</td>
              <td className="whitespace-nowrap px-2.5 text-ink-2">{formatLabel(r.format)}</td>
              <td className="whitespace-nowrap px-2.5">
                <BandBadge band={r.score?.band ?? null} ratio={r.score?.ratio} projected={r.score?.maturing} />
              </td>
              <td className="px-2.5 text-right tabular text-ink">{fmtScore(r.score?.score)}</td>
              <td className="px-2.5 text-right tabular text-ink-2">{r.views === null ? <span title="Views ocultas">—</span> : fmtCompact(r.views)}</td>
              <td className="px-2.5 text-right tabular text-ink-2">{fmtPct(r.score?.engagementRate)}</td>
              <td className="whitespace-nowrap px-2.5 text-right text-ink-3" title={new Date(r.publishedAt).toLocaleString("pt-BR")}>
                {fmtDate(r.publishedAt)}
                {now - r.publishedAt < 48 * 3_600_000 && <span className="ml-1.5 rounded-[3px] bg-[var(--band-below)]/14 px-1 text-[11px] font-medium text-[var(--band-below)]">novo</span>}
              </td>
              <td className="pr-2 text-center">
                <StatusDot r={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit && (
        <button onClick={() => setLimit(limit + 100)} className="w-full py-3 pl-3 text-left text-[13px] text-ink-3 transition-colors hover:bg-hover hover:text-ink-2">
          Mostrar mais {Math.min(100, rows.length - limit)} de {rows.length - limit}
        </button>
      )}
    </div>
  );
}

function Gallery({ rows, ids }: { rows: ClientVideoRow[]; ids: string[] }) {
  const [limit, setLimit] = useState(60);
  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
        {rows.slice(0, limit).map((r) => (
          <VideoCard key={r.id} row={r} list={ids} />
        ))}
      </div>
      {rows.length > limit && (
        <button onClick={() => setLimit(limit + 60)} className="mt-8 w-full rounded-[8px] py-3 text-[13px] font-medium text-ink-2 ring-1 ring-hairline transition-colors hover:bg-hover hover:text-ink">
          Mostrar mais
        </button>
      )}
    </>
  );
}

function Board({ rows, groupBy, ids }: { rows: ClientVideoRow[]; groupBy: Exclude<GroupKey, "none">; ids: string[] }) {
  const cols = useMemo(() => {
    const keyOf = (r: ClientVideoRow) => (groupBy === "account" ? r.handle : groupBy === "band" ? (r.score?.band ?? "—") : ((r[groupBy] as string | null) ?? "—"));
    const m = new Map<string, ClientVideoRow[]>();
    for (const r of rows) m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]);
    const arr = [...m.entries()];
    if (groupBy === "band") arr.sort((a, b) => BAND_ORDER.indexOf(a[0] as Band) - BAND_ORDER.indexOf(b[0] as Band));
    else arr.sort((a, b) => b[1].length - a[1].length);
    return arr;
  }, [rows, groupBy]);
  const label = (k: string) =>
    groupBy === "account" ? `@${k}` : groupBy === "hookType" ? hookLabel(k) : groupBy === "theme" ? themeLabel(k) : groupBy === "format" ? formatLabel(k) : (BAND_LABEL[k as Band] ?? "Sem score");
  return (
    <div className="scrollbar-thin bleed-page px-page flex gap-3 overflow-x-auto pb-4">
      {cols.map(([k, items]) => (
        <div key={k} className="w-[260px] shrink-0 rounded-[10px] bg-surface-2/70 p-2">
          <div className="mb-2 flex items-center gap-2 px-1.5 pt-1 text-[13px] font-medium text-ink">
            {groupBy === "band" && <span className="size-2 rounded-full" style={{ background: BAND_VAR[k as Band] ?? "var(--band-normal)" }} />}
            <span className="truncate">{label(k)}</span>
            <span className="ml-auto font-normal text-ink-3 tabular">{items.length}</span>
          </div>
          <div className="scrollbar-thin grid max-h-[70vh] grid-cols-2 gap-2 overflow-y-auto">
            {items.slice(0, 40).map((r) => (
              <VideoCard key={r.id} row={r} list={ids} showHook={groupBy !== "hookType"} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MenuPopover({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2 text-[13.5px] text-ink-2 transition-colors hover:bg-hover hover:text-ink data-[state=open]:bg-hover data-[state=open]:text-ink">
        {icon}
        <span className="hidden lg:inline">{label}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className="menu-surface z-50 w-60 rounded-[10px] p-1">
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MenuItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={cn("flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[14px] transition-colors hover:bg-hover", active ? "text-ink" : "text-ink-2")}>
      <Check className={cn("size-3.5 text-ink transition-all", active ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
      {children}
    </button>
  );
}

function ChipToggle<T extends string | number>({ values, options, onChange }: { values: T[]; options: { value: T; label: string; dot?: string }[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
            aria-pressed={on}
            className={cn("inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] transition-[background-color,color,transform] duration-150 active:scale-95", on ? "bg-accent font-medium text-on-accent" : "bg-accent-soft text-ink-2 hover:bg-active hover:text-ink")}
          >
            {o.dot && <span className="size-1.5 rounded-full" style={{ background: o.dot }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterPopover({ f, setF, accounts, count }: { f: Filters; setF: (f: Filters) => void; accounts: { id: number; handle: string }[]; count: number }) {
  const sec = "text-[12px] font-medium text-ink-3";
  return (
    <Popover.Root>
      <Popover.Trigger className={cn("inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2 text-[13.5px] transition-colors data-[state=open]:bg-hover", count ? "bg-accent-soft font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink")}>
        <SlidersHorizontal className="size-3.5" />
        <span className={cn(!count && "hidden lg:inline")}>Filtros{count ? ` · ${count}` : ""}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className="menu-surface scrollbar-thin z-50 max-h-[70vh] w-[min(440px,calc(100vw-24px))] space-y-4 overflow-y-auto rounded-[10px] p-4">
          <div className="space-y-1.5">
            <div className={sec}>Período</div>
            <Segmented
              label="Período"
              value={f.period}
              onChange={(period) => setF({ ...f, period })}
              options={[
                { value: "7", label: "7 dias" },
                { value: "30", label: "30 dias" },
                { value: "90", label: "90 dias" },
                { value: "all", label: "Tudo" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <div className={sec}>Faixa de desempenho</div>
            <ChipToggle values={f.bands} onChange={(bands) => setF({ ...f, bands })} options={BAND_ORDER.map((b) => ({ value: b, label: BAND_LABEL[b], dot: BAND_VAR[b] }))} />
          </div>
          <div className="space-y-1.5">
            <div className={sec}>Conta</div>
            <ChipToggle values={f.accounts} onChange={(accs) => setF({ ...f, accounts: accs })} options={accounts.map((a) => ({ value: a.id, label: `@${a.handle}` }))} />
          </div>
          <div className="space-y-1.5">
            <div className={sec}>Grupo</div>
            <ChipToggle values={f.groups} onChange={(groups) => setF({ ...f, groups })} options={Object.entries(GROUPS).map(([k, v]) => ({ value: k, label: v }))} />
          </div>
          <div className="space-y-1.5">
            <div className={sec}>Tipo de hook</div>
            <ChipToggle values={f.hooks} onChange={(hooks) => setF({ ...f, hooks })} options={Object.entries(HOOK_TYPES).map(([k, v]) => ({ value: k, label: v.label }))} />
          </div>
          <div className="space-y-1.5">
            <div className={sec}>Tema</div>
            <ChipToggle values={f.themes} onChange={(themes) => setF({ ...f, themes })} options={Object.entries(THEMES).map(([k, v]) => ({ value: k, label: v }))} />
          </div>
          <div className="space-y-1.5">
            <div className={sec}>Formato</div>
            <ChipToggle values={f.formats} onChange={(formats) => setF({ ...f, formats })} options={Object.entries(FORMATS).map(([k, v]) => ({ value: k, label: v }))} />
          </div>
          <div className="space-y-1.5">
            <div className={sec}>Oferta</div>
            <ChipToggle values={f.offers} onChange={(offers) => setF({ ...f, offers })} options={Object.entries(OFFER_TYPES).map(([k, v]) => ({ value: k, label: v }))} />
          </div>
          <div className="flex flex-wrap gap-4 border-t border-hairline pt-3 text-[13px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.hideDemo} onChange={(e) => setF({ ...f, hideDemo: e.target.checked })} className="accent-[var(--accent)]" />
              Esconder demonstração
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.onlyAnalyzed} onChange={(e) => setF({ ...f, onlyAnalyzed: e.target.checked })} className="accent-[var(--accent)]" />
              Só analisados
            </label>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export { spring };
