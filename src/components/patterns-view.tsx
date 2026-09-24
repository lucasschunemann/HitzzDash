"use client";

import { useState } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { ArrowRight, TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import type { ClientVideoRow } from "@/server/data";
import type { GroupStat, Evidence, TrendStat } from "@/lib/patterns";
import { EVIDENCE_HINT } from "@/lib/patterns";
import { fmtScore, fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, Pill, SectionTitle } from "./ui";
import { EvidenceBadge } from "./badges";
import { RankBars } from "./charts";
import { VideoChip } from "./video-card";

export type LabeledStat = GroupStat & { label: string };

/** Ranking de uma dimensão; clicar numa categoria mostra os vídeos que sustentam o número. */
export function RankingCard({ title, hint, stats, rows, scriptParam, metric = "score" }: { title: string; hint: string; stats: LabeledStat[]; rows: Record<string, ClientVideoRow>; scriptParam?: "hook" | "theme"; metric?: "score" | "engagement" }) {
  const [sel, setSel] = useState<string | null>(stats.find((s) => s.n >= 5)?.key ?? stats[0]?.key ?? null);
  const s = stats.find((x) => x.key === sel);
  const items = stats.map((x) => ({
    key: x.key,
    label: x.label,
    value: metric === "score" ? x.medianScore : x.medianEngagement,
    ciLow: metric === "score" ? x.ciLow : null,
    ciHigh: metric === "score" ? x.ciHigh : null,
    n: x.n,
  }));
  return (
    <Card className="p-5 md:p-6">
      <SectionTitle hint={hint}>{title}</SectionTitle>
      {stats.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-3">Sem dados suficientes.</p>
      ) : (
        <>
          <RankBars items={items} selected={sel} onSelect={setSel} unit={metric === "engagement" ? "pct" : "score"} />
          <p className="mt-2 px-2 text-[11px] text-ink-3">
            {metric === "score" ? "Barra = score mediano relativo à mediana da própria conta (0 = normal). Linha fina = intervalo de 90%. Cinza claro = menos de 5 vídeos." : "Engajamento mediano (curtidas + comentários por view)."}
          </p>
          {s && (
            <motion.div key={s.key} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="mt-5 rounded-[8px] bg-surface-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold">{s.label}</span>
                <EvidenceBadge level={s.evidence} hint={EVIDENCE_HINT[s.evidence]} />
                {scriptParam && (
                  <Link href={`/scripts?new=1&${scriptParam}=${s.key}`} className="group ml-auto inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[13px] font-medium text-ink transition-colors hover:bg-hover">
                    Roteiro com isso <ArrowRight className="nudge size-3.5" />
                  </Link>
                )}
              </div>
              <p className="mt-1 text-[12.5px] text-ink-2 tabular">
                {s.n} vídeos · {s.nAccounts} {s.nAccounts === 1 ? "conta" : "contas"} · score mediano {fmtScore(s.medianScore)}
                {s.ciLow !== null && ` (IC90% ${fmtScore(s.ciLow)} a ${fmtScore(s.ciHigh)})`} · {fmtPct(s.hitRate, 0)} acima do normal · engajamento {fmtPct(s.medianEngagement)}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-3">{EVIDENCE_HINT[s.evidence]}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {s.topIds.map((id) => (rows[id] ? <VideoChip key={id} row={rows[id]} list={s.topIds} /> : null))}
              </div>
            </motion.div>
          )}
        </>
      )}
    </Card>
  );
}

const TREND_ICON = {
  acelerando: <TrendingUp className="size-3.5 text-[var(--band-breakout)]" />,
  "ganhando tração": <TrendingUp className="size-3.5 text-[var(--band-breakout)]" />,
  novo: <Sparkles className="size-3.5 text-ink" />,
  estável: <Minus className="size-3.5 text-ink-3" />,
  esfriando: <TrendingDown className="size-3.5 text-[var(--band-below)]" />,
};

export function TrendList({ trends, labelOf, rows }: { trends: TrendStat[]; labelOf: Record<string, string>; rows: Record<string, ClientVideoRow> }) {
  const shown = trends.filter((t) => t.recentN + t.prevN >= 2).slice(0, 7);
  if (!shown.length) return <p className="py-6 text-center text-[13px] text-ink-3">Poucos vídeos nas últimas 6 semanas para comparar janelas.</p>;
  return (
    <div className="divide-y divide-hairline">
      {shown.map((t) => (
        <div key={t.key} className="-mx-2 rounded-[6px] px-2 py-3 transition-colors hover:bg-hover">
          <div className="flex items-center gap-2">
            {TREND_ICON[t.status]}
            <span className="min-w-0 truncate text-[13px] font-medium text-ink">{labelOf[t.key] ?? t.key}</span>
            <Pill tone={t.status === "acelerando" || t.status === "ganhando tração" ? "accent" : t.status === "esfriando" ? "blue" : "neutral"}>{t.status}</Pill>
            <span className="ml-auto flex shrink-0 gap-1">
              {t.ids.slice(0, 2).map((id) => (rows[id] ? <VideoChip key={id} row={rows[id]} list={t.ids} /> : null))}
            </span>
          </div>
          <p className="mt-0.5 pl-5.5 text-[12px] text-ink-3 tabular">
            {t.recentN} vídeos nas últimas 3 sem. ({Math.round(t.recentShare * 100)}%) vs {t.prevN} antes ({Math.round(t.prevShare * 100)}%)
            {t.recentScore !== null && ` · score ${fmtScore(t.recentScore)}${t.prevScore !== null ? ` (antes ${fmtScore(t.prevScore)})` : ""}`}
          </p>
        </div>
      ))}
    </div>
  );
}

export function EvidenceLegend() {
  const levels: Evidence[] = ["forte", "moderada", "fraca", "anedótica"];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {levels.map((l) => (
        <div key={l} className={cn("flex items-start gap-2 text-[12.5px] text-ink-2")}>
          <EvidenceBadge level={l} />
          <span>{EVIDENCE_HINT[l]}</span>
        </div>
      ))}
    </div>
  );
}
