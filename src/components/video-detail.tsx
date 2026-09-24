"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import * as Collapsible from "@radix-ui/react-collapsible";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ExternalLink, ChevronRight, RotateCw, Sparkles, Pin, BadgeDollarSign, EyeOff, Mic, Music2, Captions, Image as ImageIcon, Brain, Download, Clock } from "lucide-react";
import type { VideoDetailData } from "@/server/detail";
import { BEAT_ROLES, AUDIO_KIND_LABEL } from "@/lib/analysis-schema";
import { HOOK_TYPES, hookLabel, themeLabel, formatLabel, ctaLabel, offerLabel, CONFIDENCE, GROUPS } from "@/lib/taxonomy";
import { BAND_LABEL } from "@/lib/scoring";
import { fmtInt, fmtCompact, fmtRatio, fmtScore, fmtPct, fmtDateTime, fmtDuration, fmtAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { BandBadge, BAND_VAR, DemoBadge } from "./badges";
import { Button, Pill, Skeleton, Tip } from "./ui";
import { useOwner } from "./shell";
import { FlyingThumb } from "./peek";

type Origin = { rect: DOMRect; thumb: string | null } | null;

const STAGE_LABEL = { media: "Mídia", transcript: "Transcrição", frames: "Frames", analysis: "Análise" } as const;
const STATUS_LABEL: Record<string, string> = { pending: "pendente", running: "rodando", done: "ok", failed: "falhou", skipped: "pulada", blocked: "aguardando configuração", external: "aguardando Claude Code" };
const FLAG_LABEL: Record<string, string> = {
  views_hidden: "views ocultas (usa engajamento)",
  pinned: "fixado",
  sponsored: "parceria paga",
  small_baseline: "linha de base pequena",
  projected: "projeção (< 48h)",
};

export function VideoDetail({ data, compact, origin }: { data: VideoDetailData; compact?: boolean; heroRef?: unknown; origin?: Origin }) {
  const { row, analysis: a } = data;
  const heroRef = useRef<HTMLDivElement>(null);
  const [flying, setFlying] = useState(Boolean(origin?.thumb));
  const land = useCallback(() => setFlying(false), []);
  const pad = compact ? "px-5" : "px-0";

  return (
    <article className={cn("pb-10", compact ? "pt-5" : "")}>
      {flying && <FlyingThumb origin={origin ?? null} targetRef={heroRef} onDone={land} />}
      {/* Cabeçalho */}
      <div className={cn("flex gap-5", pad, compact ? "flex-row" : "flex-col sm:flex-row")}>
        <div ref={heroRef} className={cn("relative shrink-0 overflow-hidden rounded-[6px] bg-surface-2 ring-1 ring-hairline", compact ? "h-[210px] w-[118px]" : "aspect-[9/16] w-full max-w-[240px]")} style={{ opacity: flying ? 0 : 1 }}>
          {data.videoUrl && !compact ? (
            <video src={data.videoUrl} poster={row.thumb ?? undefined} controls playsInline className="size-full object-cover" />
          ) : row.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.thumb} alt={`Capa do Reel de @${row.handle}`} className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-ink-3">
              <ImageIcon className="size-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
            <Link href={`/videos?account=${row.accountId}`} className="font-semibold text-ink link-underline">
              @{row.handle}
            </Link>
            <span>·</span>
            <span>{GROUPS[row.group]}</span>
            <span>·</span>
            <span title={fmtDateTime(row.publishedAt)}>{fmtAgo(row.publishedAt)}</span>
          </div>
          <h2 className={cn("mt-1.5 font-semibold tracking-[-0.015em] text-ink", compact ? "text-[17px] leading-snug" : "text-[22px] leading-tight")}>
            {a?.hook.onScreenText || a?.hook.spokenText || a?.topic || row.caption?.split("\n")[0] || "Reel sem análise ainda"}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {row.isDemo && <DemoBadge />}
            {row.isPinned && (
              <Pill tone="outline">
                <Pin className="size-3" /> fixado
              </Pill>
            )}
            {row.isSponsored && (
              <Pill tone="outline">
                <BadgeDollarSign className="size-3" /> parceria
              </Pill>
            )}
            {row.score?.basis === "engagement" && (
              <Pill tone="outline">
                <EyeOff className="size-3" /> views ocultas
              </Pill>
            )}
          </div>
          <div className="mt-4 flex items-end gap-5">
            <div>
              <div className="text-[11.5px] font-medium text-ink-3">Desempenho</div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-[28px] font-semibold tracking-[-0.02em] tabular">{fmtRatio(row.score?.ratio)}</span>
                <BandBadge band={row.score?.band ?? null} />
              </div>
              <div className="text-[12px] text-ink-3">da mediana da conta · score {fmtScore(row.score?.score)}</div>
            </div>
            <div className="hidden sm:block">
              <div className="text-[11.5px] font-medium text-ink-3">{row.score?.basis === "engagement" ? "Engajamento" : "Views"}</div>
              <div className="mt-0.5 text-[20px] font-semibold tabular">{row.score?.basis === "engagement" ? fmtCompact((row.likes ?? 0) + (row.comments ?? 0)) : fmtCompact(row.views)}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {row.url && (
              <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-[6px] bg-surface px-2.5 text-[13px] font-medium ring-1 ring-hairline-strong transition-[background-color,transform] hover:bg-hover active:scale-[0.97]">
                <ExternalLink className="size-3.5" /> Instagram
              </a>
            )}
            <Link href={`/scripts?new=1&hook=${row.hookType ?? ""}&theme=${row.theme ?? ""}`} className="inline-flex h-7 items-center gap-1.5 rounded-[6px] bg-accent px-2.5 text-[13px] font-medium text-on-accent transition-[background-color,transform] hover:bg-accent-hover active:scale-[0.97]">
              <Sparkles className="size-3.5" /> Roteiro com este padrão
            </Link>
          </div>
        </div>
      </div>

      <div className={cn("mt-10 space-y-10", pad)}>
        <Properties data={data} />
        <ScoreExplain data={data} />
        {a && <HookBlock data={data} />}
        {a && a.beats.length > 0 && <BeatsTimeline data={data} />}
        {data.frames.length > 0 && <Frames data={data} />}
        {a ? <AnalysisBlocks data={data} /> : <NoAnalysis data={data} />}
        <TranscriptBlock data={data} />
        <PipelineStatus data={data} />
        {data.similar.length > 0 && <Similar data={data} />}
      </div>
    </article>
  );
}

function Block({ title, icon, children, defaultOpen = true, aside }: { title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="mb-2 flex items-center gap-2">
        <Collapsible.Trigger className="group -ml-1 flex items-center gap-1.5 rounded-[5px] px-1 py-0.5 text-[13px] font-semibold text-ink hover:bg-hover">
          <ChevronRight className={cn("size-3.5 text-ink-3 transition-transform duration-200", open && "rotate-90")} />
          {icon}
          {title}
        </Collapsible.Trigger>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      <Collapsible.Content className="overflow-hidden data-[state=closed]:hidden">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

function Prop({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex min-h-8 items-center gap-3 rounded-[6px] px-1 text-[13px] hover:bg-hover">
      <div className="w-36 shrink-0 text-ink-3" title={hint}>
        {label}
      </div>
      <div className="min-w-0 flex-1 text-ink">{children}</div>
    </div>
  );
}

function Properties({ data }: { data: VideoDetailData }) {
  const { row, analysis: a } = data;
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const setHook = async (v: string) => {
    setSaving(true);
    const r = await fetch(`/api/videos/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hookType: v === "__auto" ? null : v }) });
    setSaving(false);
    if (r.ok) {
      toast.success(v === "__auto" ? "Voltou para a classificação automática" : `Hook reclassificado: ${hookLabel(v)}`);
      router.refresh();
    } else toast.error((await r.json().catch(() => ({})))?.error ?? "Não foi possível salvar");
  };
  const audio = a?.audio.kind ? AUDIO_KIND_LABEL[a.audio.kind] : data.transcript?.speechKind === "speech" ? "Fala" : data.transcript ? "Sem fala" : "—";
  return (
    <section aria-label="Propriedades">
      <Prop label="Tipo de hook" hint="Classificado pela IA; você pode corrigir">
        {row.hookType ? (
          <span className="flex items-center gap-2">
            <select
              value={row.hookManual ? (row.hookType ?? "") : row.hookType ?? ""}
              onChange={(e) => setHook(e.target.value)}
              disabled={saving}
              className="-ml-1 h-7 max-w-full rounded-[5px] bg-transparent px-1 text-[13px] font-medium text-ink hover:bg-hover focus:bg-surface-2"
              aria-label="Reclassificar tipo de hook"
            >
              {Object.entries(HOOK_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
              {row.hookManual && <option value="__auto">↺ Voltar para automático ({hookLabel(row.hookTypeAuto)})</option>}
            </select>
            {row.hookManual && <Pill tone="accent">manual</Pill>}
          </span>
        ) : (
          <span className="text-ink-3">aguardando análise</span>
        )}
      </Prop>
      <Prop label="Tema">{themeLabel(row.theme)}</Prop>
      <Prop label="Formato">{formatLabel(row.format)}</Prop>
      <Prop label="Oferta">{offerLabel(row.offerType)}{a?.fashion.offerDetails ? <span className="text-ink-2"> · {a.fashion.offerDetails}</span> : null}</Prop>
      <Prop label="CTA">{ctaLabel(row.ctaType)}{a?.cta.text ? <span className="text-ink-2"> · “{a.cta.text}”</span> : null}</Prop>
      <Prop label="Publicado">{fmtDateTime(row.publishedAt)}</Prop>
      <Prop label="Duração">{fmtDuration(row.durationSec)}</Prop>
      <Prop label="Views">
        <span className="tabular">{row.views === null ? <span className="text-ink-3">ocultas pelo Instagram</span> : fmtInt(row.views)}</span>
      </Prop>
      <Prop label="Curtidas · comentários">
        <span className="tabular">
          {fmtInt(row.likes)} · {fmtInt(row.comments)}
          {row.shares !== null && <> · {fmtInt(row.shares)} compart.</>}
        </span>
      </Prop>
      <Prop label="Engajamento / view" hint="(curtidas + comentários) ÷ views">
        <span className="tabular">{fmtPct(row.score?.engagementRate)}</span>
      </Prop>
      <Prop label="Comentários / curtida">
        <span className="tabular">{fmtPct(row.score?.commentsPerLike)}</span>
      </Prop>
      <Prop label="Views / seguidor" hint={`Seguidores na coleta: ${fmtInt(row.followers)}`}>
        <span className="tabular">{row.score?.viewsPerFollower ? `${row.score.viewsPerFollower.toFixed(2)}` : "—"}</span>
      </Prop>
      <Prop label="Áudio">
        {audio}
        {row.music?.song ? <span className="text-ink-2"> · {row.music.song}{row.music.artist ? ` — ${row.music.artist}` : ""}</span> : row.music?.usesOriginalAudio ? <span className="text-ink-2"> · áudio original</span> : null}
      </Prop>
      <Prop label="Confiança da análise">
        {row.confidence ? (
          <Tip content={a?.confidenceReason}>
            <span>
              <Pill tone={row.confidence === "high" ? "good" : row.confidence === "medium" ? "neutral" : "warn"}>{CONFIDENCE[row.confidence as keyof typeof CONFIDENCE]}</Pill>
            </span>
          </Tip>
        ) : (
          "—"
        )}
      </Prop>
      {row.hashtags.length > 0 && (
        <Prop label="Hashtags">
          <span className="text-ink-2">{row.hashtags.map((h) => `#${h}`).join(" ")}</span>
        </Prop>
      )}
    </section>
  );
}

function ScoreExplain({ data }: { data: VideoDetailData }) {
  const { row, baseline } = data;
  const ratio = row.score?.ratio ?? null;
  const band = row.score?.band ?? null;
  // escala log de 1/8× a 16×
  const pos = (r: number) => Math.min(1, Math.max(0, (Math.log2(r) + 3) / 7));
  return (
    <Block title="Como o score foi calculado" icon={<Brain className="size-3.5 text-ink-3" />} defaultOpen={false}>
      {ratio !== null && (
        <div className="mb-4 rounded-[8px] bg-surface-2/60 p-3.5">
          <div className="relative h-8">
            <div className="absolute inset-x-0 top-3.5 h-1 rounded-full bg-gradient-to-r from-[var(--band-below)] via-[var(--band-normal)] to-[var(--band-breakout)] opacity-50" />
            <div className="absolute top-1.5 h-5 w-px bg-ink-3" style={{ left: `${pos(1) * 100}%` }} title="mediana da conta" />
            <motion.div
              initial={{ left: `${pos(1) * 100}%` }}
              animate={{ left: `${pos(ratio) * 100}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 26 }}
              className="absolute top-1 size-6 -translate-x-1/2 rounded-full border-2 border-surface shadow-md"
              style={{ background: band ? BAND_VAR[band] : "var(--band-normal)" }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-ink-3 tabular">
            <span>⅛×</span>
            <span>mediana (1×)</span>
            <span>16×</span>
          </div>
        </div>
      )}
      <ol className="space-y-1.5 text-[13px] leading-relaxed text-ink-2">
        {data.explanation.map((e, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-surface-2 text-[10.5px] font-semibold text-ink-3 tabular">{i + 1}</span>
            <span>{e}</span>
          </li>
        ))}
      </ol>
      {row.score?.flags.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {row.score.flags.map((f) => (
            <Pill key={f} tone="outline">
              {FLAG_LABEL[f] ?? f}
            </Pill>
          ))}
        </div>
      ) : null}
      {baseline && (
        <p className="mt-3 text-[12px] text-ink-3">
          Faixas: abaixo &lt; −0,75 · normal · acima ≥ 0,75 (e ≥ 1,3×) · breakout ≥ 1,75 (e ≥ 2×). {band && `Este vídeo: ${BAND_LABEL[band]}.`}
        </p>
      )}
    </Block>
  );
}

function HookBlock({ data }: { data: VideoDetailData }) {
  const a = data.analysis!;
  return (
    <Block title="Hook (primeiros 3 segundos)" aside={<Pill tone={a.hook.strength === "strong" ? "good" : a.hook.strength === "weak" ? "warn" : "neutral"}>{a.hook.strength === "strong" ? "forte" : a.hook.strength === "weak" ? "fraco" : "ok"}</Pill>}>
      <div className="space-y-2 rounded-[8px] bg-surface-2/60 p-3.5 text-[13px]">
        {a.hook.onScreenText && (
          <p>
            <span className="mr-2 text-ink-3">
              <Captions className="mr-1 inline size-3.5" />
              Tela
            </span>
            <span className="font-medium">“{a.hook.onScreenText}”</span>
          </p>
        )}
        {a.hook.spokenText && (
          <p>
            <span className="mr-2 text-ink-3">
              <Mic className="mr-1 inline size-3.5" />
              Fala
            </span>
            <span className="font-medium">“{a.hook.spokenText}”</span>
          </p>
        )}
        <p className="text-ink-2">{a.hook.visual}</p>
        <p className="text-[12.5px] text-ink-3">
          {hookLabel(a.hook.type)}
          {a.hook.secondaryType ? ` + ${hookLabel(a.hook.secondaryType)}` : ""} · {a.hook.rationale}
        </p>
      </div>
    </Block>
  );
}

const ROLE_TINT: Record<string, string> = {
  hook: "var(--band-breakout)",
  cta: "var(--band-below)",
  offer: "var(--band-above)",
  urgency: "var(--band-above)",
};

function BeatsTimeline({ data }: { data: VideoDetailData }) {
  const a = data.analysis!;
  const total = Math.max(data.row.durationSec ?? 0, ...a.beats.map((b) => b.end), 1);
  return (
    <Block title="Estrutura beat a beat" icon={<Clock className="size-3.5 text-ink-3" />}>
      <div className="mb-3 flex h-7 w-full gap-[2px] overflow-hidden rounded-[6px]" role="img" aria-label={`Linha do tempo: ${a.beats.map((b) => BEAT_ROLES[b.role]).join(", ")}`}>
        {a.beats.map((b, i) => (
          <Tip key={i} content={`${BEAT_ROLES[b.role]} · ${b.start.toFixed(1)}–${b.end.toFixed(1)}s`}>
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: i * 0.05, type: "spring", stiffness: 260, damping: 30 }}
              style={{ flexGrow: Math.max(0.2, b.end - b.start), transformOrigin: "left", background: ROLE_TINT[b.role] ?? "var(--surface-3)" }}
              className="flex min-w-0 items-center px-1.5 text-[10.5px] font-medium text-ink/90"
            >
              <span className={cn("truncate", ROLE_TINT[b.role] && "text-[var(--on-tint)]")}>{BEAT_ROLES[b.role]}</span>
            </motion.div>
          </Tip>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-ink-3 tabular">
        <span>0s</span>
        <span>{fmtDuration(total)}</span>
      </div>
      <ol className="mt-3 space-y-2.5">
        {a.beats.map((b, i) => (
          <li key={i} className="flex gap-3 text-[13px]">
            <span className="w-16 shrink-0 pt-px text-[12px] text-ink-3 tabular">
              {b.start.toFixed(1)}–{b.end.toFixed(1)}s
            </span>
            <div className="min-w-0">
              <span className="font-medium">{BEAT_ROLES[b.role]}</span>
              <span className="text-ink-2"> · {b.description}</span>
              {(b.onScreenText || b.spoken) && (
                <div className="mt-0.5 text-[12.5px] text-ink-3">
                  {b.onScreenText && <>Tela: “{b.onScreenText}” </>}
                  {b.spoken && <>Fala: “{b.spoken}”</>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12.5px] text-ink-2">{a.structureSummary}</p>
    </Block>
  );
}

function Frames({ data }: { data: VideoDetailData }) {
  return (
    <Block title={`Frames-chave (${data.frames.length})`} icon={<ImageIcon className="size-3.5 text-ink-3" />} defaultOpen={false}>
      <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {data.frames.map((f) => (
          <figure key={f.url} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={`Frame em ${f.t.toFixed(1)}s`} loading="lazy" className="h-40 w-[90px] rounded-[6px] object-cover ring-1 ring-hairline" />
            <figcaption className="mt-1 text-center text-[11px] text-ink-3 tabular">{f.t.toFixed(1)}s</figcaption>
          </figure>
        ))}
      </div>
    </Block>
  );
}

function List({ items, empty = "—" }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul className="space-y-1 text-[13px] text-ink-2">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-3" />
          {x}
        </li>
      ))}
    </ul>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">{title}</h4>
      {children}
    </div>
  );
}

function AnalysisBlocks({ data }: { data: VideoDetailData }) {
  const a = data.analysis!;
  return (
    <>
      <Block title="Por que provavelmente performou assim">
        <p className="text-[14px] font-medium leading-snug text-ink">{a.performance.verdict}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Sub title="Ajudou">
            <List items={a.performance.drivers} />
          </Sub>
          <Sub title="Atrapalhou">
            <List items={a.performance.detractors} />
          </Sub>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-3">Risco de retenção: {a.performance.retentionRisk}</p>
      </Block>
      <Block title="O que dá para replicar (sem copiar)">
        <List items={a.replicable} />
        {a.avoidCopying.length > 0 && (
          <p className="mt-2 text-[12.5px] text-ink-3">
            Não copiar: {a.avoidCopying.join("; ")}
          </p>
        )}
      </Block>
      <Block title="Tema, ângulo e mecânicas">
        <div className="grid gap-4 sm:grid-cols-2">
          <Sub title="Tema central">
            <p className="text-[13px] text-ink-2">{a.topic}</p>
          </Sub>
          <Sub title="Ângulo">
            <p className="text-[13px] text-ink-2">{a.angle}</p>
          </Sub>
          <Sub title="Proposta de valor">
            <p className="text-[13px] text-ink-2">{a.valueProposition}</p>
          </Sub>
          <Sub title="Gatilhos emocionais">
            <List items={a.emotionalTriggers} />
          </Sub>
          <Sub title="Curiosity gaps">
            <List items={a.curiosityGaps} empty="Nenhum identificado" />
          </Sub>
          <Sub title="Open loops">
            <List items={a.openLoops} empty="Nenhum identificado" />
          </Sub>
          <Sub title="Pattern interrupts">
            <List items={a.patternInterrupts} empty="Nenhum identificado" />
          </Sub>
          <Sub title="Produção">
            <p className="text-[13px] text-ink-2">
              Nível {a.production.level === "lofi" ? "lo-fi" : a.production.level === "mid" ? "médio" : "alto"} · ritmo {a.production.pacing === "fast" ? "rápido" : a.production.pacing === "slow" ? "lento" : "médio"}
            </p>
          </Sub>
        </div>
      </Block>
      <Block title="Moda e calçado">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 text-[13px]">
          <Sub title="Produto em destaque">
            <p className="text-ink-2">{a.fashion.featuredProducts.join(", ") || "—"} ({a.fashion.productCategory})</p>
          </Sub>
          <Sub title="Linha / coleção">
            <p className="text-ink-2">{a.fashion.lineOrCollection ?? "—"}</p>
          </Sub>
          <Sub title="Preço">
            <p className="text-ink-2">
              {a.fashion.priceMentioned ?? "não mencionado"} · faixa {a.fashion.priceRange === "budget" ? "até R$150" : a.fashion.priceRange === "mid" ? "R$150–350" : a.fashion.priceRange === "premium" ? "acima de R$350" : "desconhecida"}
            </p>
          </Sub>
          <Sub title="Oferta">
            <p className="text-ink-2">{offerLabel(a.fashion.offerType)}{a.fashion.offerDetails ? ` · ${a.fashion.offerDetails}` : ""}</p>
          </Sub>
          <Sub title="Urgência / escassez">
            <p className="text-ink-2">{a.fashion.urgency === "none" ? "Nenhuma" : a.fashion.urgency === "soft" ? "Leve" : "Forte"}{a.fashion.urgencyDetails ? ` · ${a.fashion.urgencyDetails}` : ""}</p>
          </Sub>
          <Sub title="Sazonalidade">
            <p className="text-ink-2">{a.fashion.seasonality ?? "—"}</p>
          </Sub>
        </div>
      </Block>
      {a.onScreenText.length > 0 && (
        <Block title="Texto na tela" icon={<Captions className="size-3.5 text-ink-3" />} defaultOpen={false}>
          <ul className="space-y-1 text-[13px]">
            {a.onScreenText.map((o, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-10 shrink-0 text-ink-3 tabular">{o.t.toFixed(1)}s</span>“{o.text}”
              </li>
            ))}
          </ul>
        </Block>
      )}
      <p className="text-[12px] text-ink-3">
        Análise {data.analysisMeta?.model === "demo" ? "de demonstração" : `por ${data.analysisMeta?.model}`} · entrada: {data.analysisMeta?.inputMode === "speech" ? "fala + frames + legenda" : data.analysisMeta?.inputMode === "visual" ? "sem fala: texto na tela + cenas + legenda" : "só capa + legenda"} · {a.confidenceReason}
      </p>
    </>
  );
}

function NoAnalysis({ data }: { data: VideoDetailData }) {
  return (
    <div className="rounded-[8px] bg-surface-2/60 p-4 text-[13px] text-ink-2">
      Este vídeo ainda não foi analisado.{" "}
      {data.row.status.analysis === "external" ? (
        <>
          Ele está aguardando o Claude Code: no terminal do Claude Code, diga <b>“analise os vídeos pendentes do Hitzz”</b>.
        </>
      ) : data.row.status.analysis === "blocked" ? "Configure ANTHROPIC_API_KEY para liberar a análise." : data.row.status.analysis === "failed" ? `A análise falhou: ${data.row.status.lastError}` : "Ele está na fila."}
    </div>
  );
}

function TranscriptBlock({ data }: { data: VideoDetailData }) {
  const t = data.transcript;
  const kind = t?.speechKind;
  return (
    <Block title="Transcrição" icon={kind === "speech" ? <Mic className="size-3.5 text-ink-3" /> : <Music2 className="size-3.5 text-ink-3" />} defaultOpen={kind === "speech"}>
      {!t ? (
        <p className="text-[13px] text-ink-3">Sem transcrição{data.row.status.transcript === "blocked" ? ` (${data.row.status.lastError ?? "aguardando configuração"})` : data.row.status.transcript === "skipped" ? " (vídeo indisponível)" : ""}.</p>
      ) : kind === "speech" ? (
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-2">
          {t.words.length
            ? t.words
                .filter((w) => w.type === "word")
                .map((w, i) => (
                  <span key={i} title={`${w.start.toFixed(1)}s`}>
                    {w.text}{" "}
                  </span>
                ))
            : t.text}
        </p>
      ) : (
        <div className="rounded-[8px] bg-surface-2/60 p-3.5 text-[13px] text-ink-2">
          <p className="font-medium text-ink">{kind === "lyrics" ? "Só música (letra detectada, não é fala do criador)" : kind === "no_audio" ? "Vídeo sem áudio" : "Sem fala: só trilha/efeitos"}</p>
          <p className="mt-1">A análise usou legenda, texto na tela e a sequência de cenas no lugar da transcrição.</p>
          {kind === "lyrics" && t.text && <p className="mt-2 text-[12.5px] italic text-ink-3">“{t.text.slice(0, 240)}”</p>}
          {t.audioEvents.length > 0 && <p className="mt-1 text-[12px] text-ink-3">Eventos de áudio: {t.audioEvents.join(", ")}</p>}
        </div>
      )}
      {t?.model && t.model !== "demo" && <p className="mt-2 text-[11.5px] text-ink-3">Modelo: {t.model}</p>}
    </Block>
  );
}

function PipelineStatus({ data }: { data: VideoDetailData }) {
  const owner = useOwner();
  const { row } = data;
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (analysis: boolean) => {
    setBusy(analysis ? "analysis" : "retry");
    const r = await fetch(`/api/videos/${encodeURIComponent(row.id)}/reprocess`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysis }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (r.ok) {
      toast.success(analysis ? "Nova análise na fila" : "Reprocessamento na fila");
      router.refresh();
    } else toast.error(j.error ?? "Falhou");
  };
  const stages = ["media", "transcript", "frames", "analysis"] as const;
  return (
    <Block title="Processamento" defaultOpen={Boolean(row.status.lastError)}>
      <div className="flex flex-wrap gap-2">
        {stages.map((s) => {
          const st = row.status[s];
          return (
            <span key={s} className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] ring-1 ring-hairline", st === "failed" && "text-bad", (st === "blocked" || st === "external") && "text-warn")}>
              <span className={cn("size-1.5 rounded-full", st === "done" ? "bg-good" : st === "failed" ? "bg-bad" : st === "running" ? "animate-pulse bg-[var(--band-below)]" : st === "blocked" || st === "external" ? "bg-warn" : "bg-ink-3")} />
              {STAGE_LABEL[s]}: {STATUS_LABEL[st] ?? st}
            </span>
          );
        })}
      </div>
      {data.job && (data.job.status === "queued" || data.job.status === "running") && (
        <p className="mt-2 text-[12.5px] text-ink-2">
          {data.job.status === "running" ? "Rodando" : "Na fila"}
          {data.job.progress ? ` · ${data.job.progress}` : ""}
        </p>
      )}
      {row.status.lastError && <p className="mt-2 text-[12.5px] text-bad">Último erro ({row.status.errorStage}): {row.status.lastError}</p>}
      {owner && !row.isDemo && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" icon={<RotateCw className="size-3.5" />} loading={busy === "retry"} onClick={() => run(false)}>
            Retomar etapas pendentes
          </Button>
          <Button size="sm" variant="ghost" icon={<Brain className="size-3.5" />} loading={busy === "analysis"} onClick={() => run(true)}>
            Reanalisar
          </Button>
          {data.videoUrl && (
            <a href={data.videoUrl} download className="inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] font-medium text-ink-2 hover:bg-hover">
              <Download className="size-3.5" /> Vídeo (temporário)
            </a>
          )}
        </div>
      )}
      {row.isDemo && <p className="mt-2 text-[12.5px] text-ink-3">Vídeo de demonstração: não há mídia real para processar.</p>}
    </Block>
  );
}

function Similar({ data }: { data: VideoDetailData }) {
  return (
    <Block title="Vídeos parecidos (mesmo hook ou tema)" defaultOpen={false}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {data.similar.map((s) => (
          <Link key={s.id} href={`/videos/${encodeURIComponent(s.id)}`} className="group">
            <div className="aspect-[9/16] overflow-hidden rounded-[6px] bg-surface-2 ring-1 ring-hairline">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.thumb && <img src={s.thumb} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />}
            </div>
            <div className="mt-1 truncate text-[11.5px] text-ink-2">@{s.handle}</div>
            <div className="text-[11.5px]">
              <BandBadge band={s.score?.band ?? null} ratio={s.score?.ratio} compact />
            </div>
          </Link>
        ))}
      </div>
    </Block>
  );
}

export function VideoDetailSkeleton() {
  return (
    <div className="space-y-6 p-5">
      <div className="flex gap-5">
        <Skeleton className="h-[210px] w-[118px] rounded-[10px]" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="mt-6 h-8 w-32" />
        </div>
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}
