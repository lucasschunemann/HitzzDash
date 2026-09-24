"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ClientVideoRow } from "@/server/data";
import { BAND_LABEL, type Band } from "@/lib/scoring";
import { fmtRatio, fmtScore, fmtDate, fmtCompact } from "@/lib/format";
import { hookLabel } from "@/lib/taxonomy";
import { BAND_VAR } from "./badges";
import { useInView } from "./ui";
import { useOpenVideo } from "./video-card";
import { cn } from "@/lib/cn";

type Hover = { x: number; y: number; content: ReactNode } | null;

function ChartTooltip({ hover }: { hover: Hover }) {
  if (!hover) return null;
  return (
    <div
      className="glass-strong pointer-events-none absolute z-20 max-w-60 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg px-2.5 py-1.5 text-[12px] leading-snug text-ink shadow-lg ring-1 ring-hairline"
      style={{ left: hover.x, top: hover.y }}
    >
      {hover.content}
    </div>
  );
}

export function BandLegend({ bands = ["below", "normal", "above", "breakout", "maturing"] as Band[] }: { bands?: Band[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
      {bands.map((b) => (
        <span key={b} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: BAND_VAR[b] }} />
          {BAND_LABEL[b]}
        </span>
      ))}
    </div>
  );
}

/** Dispersão de outliers ao longo do tempo: x = data, y = score normalizado. */
export function OutlierScatter({ rows, height = 260, now }: { rows: ClientVideoRow[]; height?: number; now: number }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduce = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover>(null);
  const openVideo = useOpenVideo();
  const pts = rows.filter((r) => r.score?.score !== null && r.score?.score !== undefined && !r.isPinned);
  const W = 720;
  const H = height;
  const m = { l: 34, r: 12, t: 12, b: 26 };
  const xmin = Math.min(...pts.map((p) => p.publishedAt), now - 60 * 86_400_000);
  const xmax = now;
  const ymin = Math.min(-2.5, ...pts.map((p) => p.score!.score as number));
  const ymax = Math.max(3, ...pts.map((p) => p.score!.score as number));
  const x = (t: number) => Math.round((m.l + ((t - xmin) / (xmax - xmin)) * (W - m.l - m.r)) * 10) / 10;
  const y = (s: number) => Math.round((m.t + (1 - (s - ymin) / (ymax - ymin)) * (H - m.t - m.b)) * 10) / 10;
  const ticks = [-2, -1, 0, 1, 2, 3].filter((t) => t >= ymin && t <= ymax);
  const xt = Array.from({ length: 5 }, (_, i) => xmin + ((xmax - xmin) * i) / 4);
  const ids = pts.map((p) => p.id);

  return (
    <div ref={ref}>
      <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Dispersão de ${pts.length} vídeos por data e score`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--hairline-strong)" strokeDasharray={t === 0 ? undefined : "2 4"} strokeWidth={t === 0 ? 1 : 0.8} />
              <text x={m.l - 6} y={y(t) + 3.5} textAnchor="end" className="fill-[var(--text-3)] text-[10px] tabular">
                {t > 0 ? `+${t}` : t}
              </text>
            </g>
          ))}
          <text x={W - m.r} y={y(0) - 5} textAnchor="end" className="fill-[var(--text-3)] text-[10px]">
            mediana da conta
          </text>
          {xt.map((t, i) => (
            <text key={i} x={x(t)} y={H - 6} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} className="fill-[var(--text-3)] text-[10px]">
              {fmtDate(t)}
            </text>
          ))}
          {pts.map((p, i) => {
            const band = (p.score!.band ?? "normal") as Band;
            return (
              <motion.circle
                key={p.id}
                cx={x(p.publishedAt)}
                cy={y(p.score!.score as number)}
                r={band === "breakout" ? 5.5 : 4.5}
                fill={BAND_VAR[band]}
                stroke="var(--surface)"
                strokeWidth={1.5}
                initial={reduce ? false : { opacity: 0, scale: 0 }}
                animate={seen ? { opacity: 1, scale: 1 } : undefined}
                transition={{ delay: Math.min(0.6, i * 0.006), type: "spring", stiffness: 300, damping: 22 }}
                className="cursor-pointer"
                style={{ transformOrigin: `${x(p.publishedAt)}px ${y(p.score!.score as number)}px` }}
                onMouseEnter={(e) => {
                  const b = wrap.current!.getBoundingClientRect();
                  const c = (e.target as SVGCircleElement).getBoundingClientRect();
                  setHover({
                    x: c.left - b.left + c.width / 2,
                    y: c.top - b.top,
                    content: (
                      <>
                        <div className="font-semibold">@{p.handle}</div>
                        <div className="text-ink-2">
                          {fmtRatio(p.score!.ratio)} da mediana · score {fmtScore(p.score!.score)}
                        </div>
                        <div className="text-ink-3">
                          {hookLabel(p.hookType)} · {fmtDate(p.publishedAt)}
                        </div>
                      </>
                    ),
                  });
                }}
                onClick={() => openVideo(p, null, ids)}
              />
            );
          })}
        </svg>
        <ChartTooltip hover={hover} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <BandLegend />
        <span className="hidden text-[11px] text-ink-3 sm:block">Clique num ponto para abrir o vídeo</span>
      </div>
    </div>
  );
}

export type RankItem = {
  key: string;
  label: string;
  value: number | null;
  ciLow?: number | null;
  ciHigh?: number | null;
  n: number;
  nAccounts?: number;
  aside?: ReactNode;
  tooltip?: ReactNode;
};

/** Ranking horizontal divergente em torno de 0 (mediana geral), com intervalo de confiança. */
export function RankBars({ items, onSelect, selected, unit = "score" }: { items: RankItem[]; onSelect?: (key: string) => void; selected?: string | null; unit?: "score" | "pct" }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduce = useReducedMotion();
  const vals = items.flatMap((i) => [i.value ?? 0, i.ciLow ?? 0, i.ciHigh ?? 0]);
  const lo = Math.min(-0.5, ...vals);
  const hi = Math.max(0.5, ...vals);
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zero = pos(0);
  return (
    <div ref={ref} className="space-y-1" role="list">
      {items.map((it, i) => {
        const v = it.value ?? 0;
        const left = Math.min(pos(v), zero);
        const width = Math.abs(pos(v) - zero);
        const small = it.n < 5;
        return (
          <button
            key={it.key}
            role="listitem"
            onClick={() => onSelect?.(it.key)}
            className={cn("group grid w-full grid-cols-[minmax(0,150px)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface-2/70 sm:grid-cols-[minmax(0,190px)_1fr_auto]", selected === it.key && "bg-surface-2")}
            title={typeof it.tooltip === "string" ? it.tooltip : undefined}
          >
            <span className={cn("truncate text-[12.5px]", small ? "text-ink-3" : "text-ink")}>{it.label}</span>
            <span className="relative h-5">
              <span className="absolute inset-y-0 w-px bg-hairline-strong" style={{ left: `${zero}%` }} />
              {it.value !== null && (
                <motion.span
                  initial={reduce ? false : { scaleX: 0 }}
                  animate={seen ? { scaleX: 1 } : undefined}
                  transition={{ delay: i * 0.03, type: "spring", stiffness: 220, damping: 28 }}
                  className="absolute top-1 h-3 rounded-[4px]"
                  style={{
                    left: `${left}%`,
                    width: `max(${width}%, 2px)`,
                    transformOrigin: v >= 0 ? "left" : "right",
                    background: v >= 0 ? "var(--band-breakout)" : "var(--band-below)",
                    opacity: small ? 0.35 : 0.9,
                  }}
                />
              )}
              {it.ciLow !== null && it.ciLow !== undefined && it.ciHigh !== null && it.ciHigh !== undefined && (
                <span className="absolute top-[9px] h-px bg-ink-2/60" style={{ left: `${pos(it.ciLow)}%`, width: `${pos(it.ciHigh) - pos(it.ciLow)}%` }} aria-hidden />
              )}
            </span>
            <span className="flex w-[118px] items-center justify-end gap-2 text-[12px] tabular">
              <span className={cn("font-medium", small ? "text-ink-3" : "text-ink")}>{unit === "pct" ? `${((it.value ?? 0) * 100).toFixed(1)}%` : fmtScore(it.value)}</span>
              <span className="w-11 text-right text-ink-3">n={it.n}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Mapa de calor categoria × semana (cor = nº de vídeos; tooltip mostra o score médio). */
export function Heatmap({ weeks, rows, labels }: { weeks: number[]; rows: { key: string; cells: { n: number; score: number | null }[] }[]; labels: Record<string, string> }) {
  const labelOf = (k: string) => labels[k] ?? k;
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduce = useReducedMotion();
  const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.n)));
  const step = (n: number) => (n === 0 ? 0 : Math.min(6, 1 + Math.floor((n / max) * 5.99)));
  const sorted = [...rows].sort((a, b) => b.cells.reduce((s, c) => s + c.n, 0) - a.cells.reduce((s, c) => s + c.n, 0));
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover>(null);
  return (
    <div ref={ref}>
      <div ref={wrap} className="relative overflow-x-auto" onMouseLeave={() => setHover(null)}>
        <table className="w-full border-separate border-spacing-[3px]">
          <thead>
            <tr>
              <th className="w-40" />
              {weeks.map((w) => (
                <th key={w} className="text-[10.5px] font-normal text-ink-3">
                  {fmtDate(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, ri) => (
              <tr key={r.key}>
                <th scope="row" className="truncate pr-2 text-left text-[12px] font-normal text-ink-2">
                  {labelOf(r.key)}
                </th>
                {r.cells.map((c, ci) => (
                  <td key={ci} className="p-0">
                    <motion.div
                      initial={reduce ? false : { opacity: 0 }}
                      animate={seen ? { opacity: 1 } : undefined}
                      transition={{ delay: (ri + ci) * 0.015 }}
                      className="h-6 min-w-7 rounded-[5px]"
                      style={{ background: `var(--seq-${step(c.n)})` }}
                      onMouseEnter={(e) => {
                        const b = wrap.current!.getBoundingClientRect();
                        const t = (e.target as HTMLElement).getBoundingClientRect();
                        setHover({
                          x: t.left - b.left + t.width / 2,
                          y: t.top - b.top,
                          content: (
                            <>
                              <div className="font-semibold">{labelOf(r.key)}</div>
                              <div className="text-ink-2">
                                Semana de {fmtDate(weeks[ci])}: {c.n} {c.n === 1 ? "vídeo" : "vídeos"}
                              </div>
                              {c.score !== null && <div className="text-ink-3">score médio {fmtScore(c.score)}</div>}
                            </>
                          ),
                        });
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <ChartTooltip hover={hover} />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-3">
        <span>menos</span>
        {[0, 1, 2, 3, 4, 5, 6].map((s) => (
          <span key={s} className="h-2.5 w-4 rounded-[3px]" style={{ background: `var(--seq-${s})` }} />
        ))}
        <span>mais vídeos</span>
      </div>
    </div>
  );
}

/** Barras simples (uma série) com rótulo de valor, para comparar contas. */
const UNITS = {
  compact: (n: number) => fmtCompact(n),
  pct: (n: number) => `${Math.round(n * 100)}%`,
  perWeek: (n: number) => `${n.toFixed(1).replace(".", ",")}/sem`,
};

export function CompareBars({ items, unit = "compact", highlight }: { items: { key: string; label: string; value: number | null; sub?: string }[]; unit?: keyof typeof UNITS; highlight?: string }) {
  const format = UNITS[unit];
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduce = useReducedMotion();
  const max = Math.max(1e-9, ...items.map((i) => i.value ?? 0));
  return (
    <div ref={ref} className="space-y-1.5">
      {items.map((it, i) => (
        <div key={it.key} className="grid grid-cols-[minmax(0,130px)_1fr_auto] items-center gap-3">
          <span className={cn("truncate text-[12.5px]", it.key === highlight ? "font-semibold text-ink" : "text-ink-2")}>{it.label}</span>
          <span className="relative h-4">
            <motion.span
              initial={reduce ? false : { scaleX: 0 }}
              animate={seen ? { scaleX: 1 } : undefined}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 220, damping: 28 }}
              className="absolute inset-y-0.5 left-0 rounded-[4px]"
              style={{ width: `${((it.value ?? 0) / max) * 100}%`, transformOrigin: "left", background: it.key === highlight ? "var(--accent)" : "var(--seq-4)" }}
            />
          </span>
          <span className="w-20 text-right text-[12px] font-medium text-ink tabular">
            {it.value === null ? "—" : format(it.value)}
            {it.sub && <span className="block text-[10.5px] font-normal text-ink-3">{it.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

const CAT = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-other)"];

/** Barra 100% empilhada (mix de formatos por conta). Máx. 3 categorias + "Outros". */
export function MixBars({ rows, labels }: { rows: { key: string; label: string; mix: Record<string, number> }[]; labels: Record<string, string> }) {
  const labelOf = (k: string) => labels[k] ?? k;
  const totals: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.mix)) totals[k] = (totals[k] ?? 0) + v;
  const top = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  const cats = [...top, "__other"];
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduce = useReducedMotion();
  const colors = CAT;
  return (
    <div ref={ref}>
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
        {cats.map((c, i) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[3px]" style={{ background: colors[i] }} />
            {c === "__other" ? "Outros" : labelOf(c)}
          </span>
        ))}
      </div>
      <div className="space-y-1.5">
        {rows.map((r, ri) => {
          const total = Object.values(r.mix).reduce((a, b) => a + b, 0) || 1;
          const parts = cats.map((c) => (c === "__other" ? Object.entries(r.mix).filter(([k]) => !top.includes(k)).reduce((s, [, v]) => s + v, 0) : (r.mix[c] ?? 0)));
          return (
            <div key={r.key} className="grid grid-cols-[minmax(0,130px)_1fr] items-center gap-3">
              <span className="truncate text-[12.5px] text-ink-2">{r.label}</span>
              <motion.div initial={reduce ? false : { scaleX: 0 }} animate={seen ? { scaleX: 1 } : undefined} transition={{ delay: ri * 0.04, type: "spring", stiffness: 200, damping: 28 }} style={{ transformOrigin: "left" }} className="flex h-4 gap-[2px] overflow-hidden rounded-[4px]">
                {parts.map((p, i) =>
                  p > 0 ? (
                    <span key={i} title={`${cats[i] === "__other" ? "Outros" : labelOf(cats[i])}: ${Math.round((p / total) * 100)}%`} style={{ width: `${(p / total) * 100}%`, background: colors[i] }} />
                  ) : null,
                )}
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
