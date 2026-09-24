"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Terminal } from "lucide-react";
import { Sparkles, Star, RotateCw, Shuffle, Mic, Copy, Trash2, Clock, Music2, Film, Check, X, AlertTriangle, ShieldCheck, ArrowRight, Wand2, Plus } from "lucide-react";
import type { Plan, Script, EvidenceItem, ScriptInput } from "@/server/scriptgen";
import type { ClientVideoRow } from "@/server/data";
import { SCRIPT_CATEGORIES, TONES, hookLabel, themeLabel, formatLabel, ctaLabel, offerLabel, type ScriptCategory, type Tone } from "@/lib/taxonomy";
import { BEAT_ROLES } from "@/lib/analysis-schema";
import { fmtAgo, fmtRatio, fmtScore, fmtCompact } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Card, Pill, Segmented, Skeleton, SectionTitle, EmptyState, Tip, spring } from "./ui";
import { VideoChip } from "./video-card";
import { useOwner } from "./shell";

export type ScriptRow = {
  id: number;
  parentId: number | null;
  title: string;
  favorite: boolean;
  generator: string;
  model: string | null;
  createdAt: number;
  input: ScriptInput;
  plan: Plan | null;
  output: Script;
  evidence: { items: EvidenceItem[]; removedIds: string[]; originality: { maxSimilarity: number; closestId: string | null; ok: boolean }; basedOn: { analyzed: number; demo: number } } | null;
};

export type ScriptRequestRow = { id: number; kind: string; input: ScriptInput; createdAt: number };

const GEN_LABEL = (s: { generator: string; model: string | null }) =>
  s.generator === "ai" ? `IA · ${s.model ?? ""}` : s.generator === "claude-code" ? "escrito pelo Claude Code" : "esqueleto sem IA";

export const CC_PHRASE = "gere os roteiros pendentes do Hitzz";

type Job = { id: number; status: string; progress: string | null; error: string | null; payload: Record<string, unknown> | null };

const STEPS = ["Lendo o dataset e escolhendo a oportunidade", "Escrevendo o roteiro cena a cena", "Validando evidências citadas"];

function useJob(onDone: (scriptId: number) => void) {
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as Job;
      setJob(j);
      if (j.status === "done" && j.payload?.scriptId) onDone(Number(j.payload.scriptId));
      if (j.status === "failed") toast.error(j.error ?? "A geração falhou");
    }, 900);
    return () => clearInterval(t);
  }, [job, onDone]);
  return [job, setJob] as const;
}

export function ScriptStudio({
  scripts,
  selected,
  rows,
  initial,
  aiEnabled,
  canGenerate,
  mode,
  requests,
}: {
  scripts: ScriptRow[];
  selected: ScriptRow | null;
  rows: Record<string, ClientVideoRow>;
  initial: { open: boolean; seedTheme?: string; seedHook?: string };
  aiEnabled: boolean;
  canGenerate: boolean;
  mode: "api" | "claude_code";
  requests: ScriptRequestRow[];
}) {
  const router = useRouter();
  const owner = useOwner();
  // a equipe só lê: roteiros novos chegam no lote semanal gerado pelo administrador
  const [showForm, setShowForm] = useState(owner && (initial.open || !selected));
  const latestBatch = scripts.map((s) => s.input.batch).filter(Boolean).sort().at(-1);
  const [filter, setFilter] = useState<"all" | "week" | "fav">(latestBatch ? "week" : "all");
  const onDone = useMemo(
    () => (id: number) => {
      toast.success("Roteiro pronto");
      setShowForm(false);
      router.push(`/scripts?id=${id}`);
      router.refresh();
    },
    [router],
  );
  const [job, setJob] = useJob(onDone);
  const busy = job && (job.status === "queued" || job.status === "running");

  const start = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(j.error ?? "Não foi possível iniciar");
    if (j.scriptId) {
      toast.success("Roteiro pronto");
      setShowForm(false);
      router.push(`/scripts?id=${j.scriptId}`);
      router.refresh();
      return;
    }
    if (j.requestId) {
      toast.success("Pedido enviado ao Claude Code", { description: `No Claude Code, diga: “${CC_PHRASE}”.` });
      setShowForm(false);
      router.refresh();
      return;
    }
    setJob({ id: j.jobId, status: "queued", progress: null, error: null, payload: null });
  };

  const list = scripts.filter((s) => filter === "all" || (filter === "fav" ? s.favorite : s.input.batch === latestBatch));
  const roots = list.filter((s) => !s.parentId || !list.some((p) => p.id === s.parentId));

  return (
    <div className="grid gap-12 px-page lg:grid-cols-[232px_1fr] lg:gap-10 xl:grid-cols-[260px_1fr] xl:gap-14">
      {/* Histórico */}
      <aside className="order-2 lg:sticky lg:top-20 lg:order-1 lg:self-start" aria-label="Histórico de roteiros">
        <div className="mb-3 flex items-center justify-between">
          <Segmented label="Filtro do histórico" value={filter} onChange={setFilter} options={[...(latestBatch ? [{ value: "week" as const, label: "Da semana" }] : []), { value: "all" as const, label: "Todos" }, { value: "fav" as const, label: "Favoritos" }]} />
          {owner && (
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setShowForm(true)}>
              Novo
            </Button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="rounded-[8px] bg-surface-2 p-4 text-[13px] text-ink-3">{filter === "fav" ? "Nenhum favorito ainda." : filter === "week" ? "Os roteiros base desta semana aparecem aqui na segunda-feira." : "Os roteiros gerados ficam salvos aqui."}</p>
        ) : (
          <ul className="stagger space-y-px">
            {roots.map((s) => {
              const kids = list.filter((k) => k.parentId === s.id);
              return (
                <li key={s.id}>
                  <HistoryItem s={s} active={selected?.id === s.id} />
                  {kids.length > 0 && (
                    <ul className="ml-3 border-l border-hairline pl-2">
                      {kids.map((k) => (
                        <li key={k.id}>
                          <HistoryItem s={k} active={selected?.id === k.id} child />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <div className="order-1 min-w-0 space-y-10 lg:order-2">
        <AnimatePresence initial={false}>
          {(showForm || busy) && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}>
              {busy ? (
                <Progress job={job!} aiEnabled={aiEnabled} />
              ) : (
                <GeneratorForm initial={initial} aiEnabled={aiEnabled} ccMode={mode === "claude_code"} canGenerate={canGenerate} onSubmit={(b) => start("/api/scripts", b)} onCancel={selected ? () => setShowForm(false) : undefined} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {requests.length > 0 && <PendingRequests requests={requests} owner={owner} />}
        {!busy && selected && <ScriptView s={selected} rows={rows} family={scripts.filter((x) => x.id !== selected.id && (x.parentId === (selected.parentId ?? selected.id) || x.id === selected.parentId))} onVariant={(body) => start(`/api/scripts/${selected.id}/variant`, body)} aiEnabled={aiEnabled || mode === "claude_code"} owner={owner} />}
        {!busy && !selected && !showForm && (
          <Card>
            {owner ? (
              <EmptyState icon={<Sparkles className="size-5" />} title="Nenhum roteiro selecionado" action={<Button variant="primary" onClick={() => setShowForm(true)}>Gerar roteiro</Button>} />
            ) : (
              <EmptyState icon={<Sparkles className="size-5" />} title="Nenhum roteiro ainda">
                Toda segunda-feira chegam 10 roteiros base, escritos a partir das tendências e da análise da semana.
              </EmptyState>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function HistoryItem({ s, active, child }: { s: ScriptRow; active: boolean; child?: boolean }) {
  return (
    <Link href={`/scripts?id=${s.id}`} className={cn("relative block rounded-[6px] px-2.5 py-2 transition-colors", active ? "bg-active" : "hover:bg-hover")}>
      <div className="flex items-center gap-1.5">
        {s.favorite && <Star className="size-3 shrink-0 fill-[var(--band-breakout)] text-[var(--band-breakout)]" />}
        <span className={cn("truncate text-[14px]", active ? "font-medium text-ink" : "text-ink-2")}>{s.title}</span>
      </div>
      <div className="mt-0.5 text-[12px] text-ink-3">
        {s.input.batch ? `Semana de ${s.input.batch.slice(8, 10)}/${s.input.batch.slice(5, 7)} · ` : ""}
        {child ? "Variação · " : ""}
        {fmtAgo(s.createdAt)} · {s.generator === "ai" ? "IA" : s.generator === "claude-code" ? "Claude Code" : "sem IA"}
      </div>
    </Link>
  );
}

function GeneratorForm({ initial, onSubmit, onCancel, aiEnabled, ccMode, canGenerate }: { initial: { seedTheme?: string; seedHook?: string }; onSubmit: (b: Partial<ScriptInput> & { via?: "heuristic" }) => void; onCancel?: () => void; aiEnabled: boolean; ccMode: boolean; canGenerate: boolean }) {
  const [mode, setMode] = useState<ScriptInput["mode"]>("auto");
  const [category, setCategory] = useState<ScriptCategory>("launch");
  const [theme, setTheme] = useState("");
  const [tone, setTone] = useState<Tone>("natural");
  const [duration, setDuration] = useState<string>("auto");
  const [notes, setNotes] = useState("");
  const [seedTheme, setSeedTheme] = useState(initial.seedTheme);
  const [seedHook, setSeedHook] = useState(initial.seedHook);
  const label = "mb-2 block text-[13px] font-medium text-ink-2";
  const payload = () => ({ mode, category: mode === "category" ? category : undefined, theme: mode === "theme" ? theme : undefined, tone, notes, durationSec: duration === "auto" ? null : Number(duration), seedTheme, seedHook });
  return (
    <Card className="p-6 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.015em]">Novo roteiro</h2>
          <p className="mt-1 text-[13.5px] text-ink-3">O gerador primeiro lê o dataset e escolhe tema, hook, ângulo e estrutura; só depois escreve.</p>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="grid size-7 place-items-center rounded-[6px] text-ink-3 hover:bg-hover" aria-label="Fechar formulário">
            <X className="size-4" />
          </button>
        )}
      </div>
      {ccMode ? (
        <div className="mb-6 flex gap-3 rounded-[8px] bg-surface-2 p-4 text-[13.5px] leading-relaxed text-ink-2">
          <Terminal className="mt-0.5 size-4 shrink-0 text-ink" />
          <span>
            Modo gratuito: o roteiro é escrito pelo <b>Claude Code</b>, com a sua assinatura do Claude, usando os mesmos dados e as mesmas validações. Faça o pedido aqui e depois, no Claude Code, diga <b>“{CC_PHRASE}”</b>. Para algo imediato, use o esqueleto rápido (sem IA).
          </span>
        </div>
      ) : (
        !aiEnabled && (
          <div className="mb-6 flex gap-3 rounded-[8px] bg-warn/10 p-4 text-[13.5px] leading-relaxed text-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <span>Sem ANTHROPIC_API_KEY o gerador roda em modo heurístico: escolhe tema, hook e estrutura pelos números e monta um esqueleto de cenas, mas não escreve fala nem justificativa em texto livre.</span>
          </div>
        )
      )}
      <div className="space-y-6">
        <div>
          <span className={label}>Como escolher o assunto</span>
          <Segmented
            label="Modo"
            value={mode}
            onChange={setMode}
            options={[
              { value: "auto", label: "Os dados decidem" },
              { value: "category", label: "Por categoria" },
              { value: "theme", label: "Tema livre" },
            ]}
          />
        </div>
        {mode === "category" && (
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SCRIPT_CATEGORIES) as ScriptCategory[])
              .filter((c) => c !== "auto")
              .map((c) => (
                <button key={c} onClick={() => setCategory(c)} aria-pressed={category === c} className={cn("h-8 rounded-[6px] px-3 text-[13px] transition-[background-color,color,transform] duration-150 active:scale-95", category === c ? "bg-accent font-medium text-on-accent" : "bg-accent-soft text-ink-2 hover:bg-active hover:text-ink")}>
                  {SCRIPT_CATEGORIES[c]}
                </button>
              ))}
          </div>
        )}
        {mode === "theme" && (
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Ex.: lançamento da bota de inverno para quem trabalha em pé"
            className="h-9 w-full rounded-[6px] bg-surface px-3 text-[13.5px] ring-1 ring-hairline outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-[var(--focus)]"
            aria-label="Tema livre"
          />
        )}
        {(seedTheme || seedHook) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <span className="text-ink-3">Ponto de partida:</span>
            {seedTheme && (
              <button onClick={() => setSeedTheme(undefined)} className="inline-flex h-6 items-center gap-1 rounded-full bg-accent-soft pl-2.5 pr-1.5 font-medium text-accent-ink">
                tema {themeLabel(seedTheme)} <X className="size-3" />
              </button>
            )}
            {seedHook && (
              <button onClick={() => setSeedHook(undefined)} className="inline-flex h-6 items-center gap-1 rounded-full bg-accent-soft pl-2.5 pr-1.5 font-medium text-accent-ink">
                hook {hookLabel(seedHook)} <X className="size-3" />
              </button>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className={label}>Tom</span>
            <select value={tone} onChange={(e) => setTone(e.target.value as Tone)} className="h-9 w-full rounded-[6px] bg-surface px-2.5 text-[13px] ring-1 ring-hairline">
              {Object.entries(TONES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Duração</span>
            <select value={duration} onChange={(e) => setDuration(e.target.value)} className="h-9 w-full rounded-[6px] bg-surface px-2.5 text-[13px] ring-1 ring-hairline">
              <option value="auto">Recomendada pelos dados</option>
              {[10, 15, 20, 30, 45, 60].map((d) => (
                <option key={d} value={d}>
                  ~{d} segundos
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={label}>Produto, preço e oferta (opcional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Ex.: Tênis Nuvem, R$ 249 em até 6x, frete grátis até domingo. Sem isso, o roteiro usa marcadores como [PREÇO]."
            className="w-full resize-y rounded-[6px] bg-surface px-3 py-2 text-[13px] ring-1 ring-hairline outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-[var(--focus)]"
          />
        </label>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            disabled={!canGenerate || (mode === "theme" && !theme.trim())}
            icon={<Wand2 className="size-3.5" />}
            onClick={() => onSubmit(payload())}
          >
            {ccMode ? "Pedir ao Claude Code" : "Gerar roteiro"}
          </Button>
          {ccMode && (
            <Button disabled={!canGenerate || (mode === "theme" && !theme.trim())} onClick={() => onSubmit({ ...payload(), via: "heuristic" })}>
              Esqueleto rápido (sem IA)
            </Button>
          )}
          {!canGenerate && <span className="text-[12.5px] text-ink-3">Precisa de pelo menos 3 vídeos analisados.</span>}
        </div>
      </div>
    </Card>
  );
}

function Progress({ job, aiEnabled }: { job: Job; aiEnabled: boolean }) {
  const idx = job.progress ? Math.max(0, STEPS.indexOf(job.progress)) : 0;
  return (
    <Card className="p-5 md:p-6" aria-live="polite">
      <h2 className="text-[16px] font-semibold">Gerando roteiro…</h2>
      <p className="text-[12.5px] text-ink-3">{aiEnabled ? "Duas chamadas ao Claude: estratégia e escrita. Costuma levar de 30 s a 2 min." : "Modo heurístico: leva poucos segundos."}</p>
      <ol className="mt-4 space-y-2.5">
        {STEPS.map((s, i) => {
          const state = job.status === "queued" ? "wait" : i < idx ? "done" : i === idx ? "now" : "wait";
          return (
            <li key={s} className="flex items-center gap-2.5 text-[13px]">
              <span className={cn("grid size-5 place-items-center rounded-full", state === "done" ? "bg-good text-[var(--on-tint)]" : state === "now" ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-3")}>
                {state === "done" ? <Check className="size-3" /> : state === "now" ? <span className="size-1.5 animate-pulse rounded-full bg-accent" /> : <span className="text-[10px]">{i + 1}</span>}
              </span>
              <span className={state === "wait" ? "text-ink-3" : "text-ink"}>{s}</span>
            </li>
          );
        })}
      </ol>
      {job.progress?.startsWith("Nova tentativa") && <p className="mt-3 text-[12.5px] text-warn">{job.progress}</p>}
      <div className="mt-5 space-y-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </Card>
  );
}

function scriptText(s: ScriptRow) {
  const o = s.output;
  const lines = [
    o.title,
    `Duração: ~${Math.round(o.totalDurationSec)}s · Áudio: ${o.audio.direction}`,
    `HOOK (tela): ${o.onScreenHook}`,
    o.spokenHook ? `HOOK (fala): ${o.spokenHook}` : "",
    "",
    ...o.scenes.map((c, i) => `${i + 1}. [${c.durationSec}s · ${BEAT_ROLES[c.role]}] Plano: ${c.shot}${c.onScreenText ? `\n   Tela: ${c.onScreenText}` : ""}${c.speech ? `\n   Fala: ${c.speech}` : ""}${c.notes ? `\n   Nota: ${c.notes}` : ""}`),
    "",
    `CTA: ${o.cta.text}`,
    "",
    "LEGENDA:",
    o.caption,
    o.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" "),
  ];
  return lines.filter((l) => l !== undefined).join("\n");
}

function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={ok ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5" />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          toast.error("Não foi possível copiar");
        }
      }}
    >
      {label}
    </Button>
  );
}

function ScriptView({ s, rows, family, onVariant, aiEnabled, owner }: { s: ScriptRow; rows: Record<string, ClientVideoRow>; family: ScriptRow[]; onVariant: (b: { kind: string; tone?: string }) => void; aiEnabled: boolean; owner: boolean }) {
  const router = useRouter();
  const o = s.output;
  const p = s.plan;
  const ev = s.evidence;
  const [title, setTitle] = useState(s.title);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- título editável acompanha o valor salvo
  useEffect(() => setTitle(s.title), [s.title]);
  const patch = async (b: Record<string, unknown>) => {
    const r = await fetch(`/api/scripts/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    if (!r.ok) toast.error("Não foi possível salvar");
    router.refresh();
  };
  const total = o.scenes.reduce((a, c) => a + c.durationSec, 0) || o.totalDurationSec || 1;
  const byDecision = (d: string) => p?.decisions.find((x) => x.decision === d);

  return (
    <article className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <Pill tone={s.generator === "heuristic" ? "warn" : "accent"}>{GEN_LABEL(s)}</Pill>
          <span>{fmtAgo(s.createdAt)}</span>
          <span>·</span>
          <span>
            {s.input.mode === "auto" ? "Os dados decidiram" : s.input.mode === "category" ? `Categoria: ${SCRIPT_CATEGORIES[s.input.category ?? "auto"]}` : `Tema: ${s.input.theme}`} · tom {TONES[s.input.tone].toLowerCase()}
          </span>
          {ev?.basedOn.demo ? <Pill tone="warn">baseado em dados de demonstração</Pill> : null}
        </div>
        <div className="mt-1.5 flex items-start gap-2">
          <textarea
            value={title}
            rows={1}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            onBlur={() => title !== s.title && patch({ title })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            aria-label="Título do roteiro"
            className="-ml-1.5 min-w-0 flex-1 resize-none rounded-[6px] bg-transparent px-1.5 [field-sizing:content] text-[28px] font-bold leading-tight tracking-[-0.025em] text-ink outline-none transition-colors hover:bg-hover focus:bg-hover md:text-[34px]"
          />
          <Tip content={s.favorite ? "Remover dos favoritos" : "Favoritar"}>
            <button onClick={() => patch({ favorite: !s.favorite })} className="mt-1.5 grid size-9 place-items-center rounded-[6px] transition-colors hover:bg-hover" aria-label={s.favorite ? "Remover dos favoritos" : "Favoritar"} aria-pressed={s.favorite}>
              <motion.span key={String(s.favorite)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
                <Star className={cn("size-5", s.favorite ? "fill-[var(--band-breakout)] text-[var(--band-breakout)]" : "text-ink-3")} />
              </motion.span>
            </button>
          </Tip>
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {owner && (
            <>
              <Button size="sm" icon={<RotateCw className="size-3.5" />} onClick={() => onVariant({ kind: "regenerate" })}>
                Regenerar
              </Button>
              <Button size="sm" icon={<Shuffle className="size-3.5" />} onClick={() => onVariant({ kind: "alternative" })}>
                Gerar alternativa
              </Button>
              <Popover.Root>
                <Popover.Trigger asChild>
                  <Button size="sm" icon={<Mic className="size-3.5" />} disabled={!aiEnabled || s.generator === "heuristic"} title={s.generator === "heuristic" ? "Esqueletos heurísticos não têm fala para reescrever" : undefined}>
                    Ajustar tom
                  </Button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content sideOffset={6} align="start" className="menu-surface z-50 w-56 rounded-[8px] p-1">
                    {Object.entries(TONES).map(([k, v]) => (
                      <Popover.Close key={k} asChild>
                        <button disabled={k === s.input.tone} onClick={() => onVariant({ kind: "tone", tone: k })} className="flex h-8 w-full items-center rounded-[6px] px-2.5 text-left text-[13px] hover:bg-hover disabled:text-ink-3">
                          {v} {k === s.input.tone && <span className="ml-auto text-[11px]">atual</span>}
                        </button>
                      </Popover.Close>
                    ))}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </>
          )}
          <CopyButton text={scriptText(s)} label="Copiar roteiro" />
          {owner && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-3.5" />}
              onClick={async () => {
                if (!window.confirm("Excluir este roteiro?")) return;
                await fetch(`/api/scripts/${s.id}`, { method: "DELETE" });
                router.push("/scripts");
                router.refresh();
              }}
            >
              Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Hook e resumo */}
      <Card className="overflow-hidden">
        <div className="grid gap-0 xl:grid-cols-[1.4fr_1fr]">
          <div className="p-6 md:p-8">
            <div className="text-[13px] font-medium text-ink-3">Hook (0–3 s)</div>
            <p className="mt-2 text-[24px] font-bold leading-tight tracking-[-0.02em] text-ink">“{o.onScreenHook}”</p>
            {o.spokenHook && (
              <p className="mt-2 flex items-start gap-1.5 text-[14px] text-ink-2">
                <Mic className="mt-0.5 size-4 shrink-0 text-ink-3" />“{o.spokenHook}”
              </p>
            )}
            {o.altHooks.length > 0 && (
              <div className="mt-3">
                <div className="text-[11.5px] text-ink-3">Alternativas de hook</div>
                <ul className="mt-0.5 space-y-0.5 text-[13px] text-ink-2">
                  {o.altHooks.map((h, i) => (
                    <li key={i}>· {h}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="space-y-3.5 border-t border-hairline bg-surface-2/60 p-6 text-[13.5px] md:p-8 xl:border-l xl:border-t-0">
            <Fact icon={<Clock className="size-3.5" />} label="Duração">
              ~{Math.round(o.totalDurationSec)} s · {o.scenes.length} cenas
            </Fact>
            <Fact icon={<Music2 className="size-3.5" />} label="Áudio">
              {o.audio.direction}
            </Fact>
            <Fact icon={<ArrowRight className="size-3.5" />} label="CTA">
              {ctaLabel(o.cta.type)}: “{o.cta.text}”
            </Fact>
            {p && (
              <Fact icon={<Film className="size-3.5" />} label="Estratégia">
                {themeLabel(p.chosen.theme)} · {hookLabel(p.chosen.hookType)} · {formatLabel(p.chosen.format)}
                {p.chosen.offerType !== "none" ? ` · ${offerLabel(p.chosen.offerType)}` : ""}
              </Fact>
            )}
          </div>
        </div>
      </Card>

      {/* Cenas */}
      <section>
        <SectionTitle hint="Proporção de tempo por cena">Roteiro cena a cena</SectionTitle>
        <div className="mb-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
          {o.scenes.map((c, i) => (
            <motion.span key={i} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: i * 0.05, ...spring }} style={{ flexGrow: c.durationSec, transformOrigin: "left", background: c.role === "hook" ? "var(--band-breakout)" : c.role === "cta" ? "var(--band-below)" : "var(--surface-3)" }} title={`${BEAT_ROLES[c.role]} · ${c.durationSec}s`} />
          ))}
        </div>
        <ol className="space-y-3">
          {o.scenes.map((c, i) => {
            const start = o.scenes.slice(0, i).reduce((a, x) => a + x.durationSec, 0);
            return (
              <motion.li key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card interactive className="grid gap-4 p-5 sm:grid-cols-[88px_1fr]">
                  <div>
                    <div className="text-[20px] font-semibold text-ink tabular">{i + 1}</div>
                    <div className="text-[11.5px] text-ink-3 tabular">
                      {start.toFixed(1)}–{(start + c.durationSec).toFixed(1)} s
                    </div>
                    <div className="mt-1 text-[11.5px] font-medium text-ink-2">{BEAT_ROLES[c.role]}</div>
                  </div>
                  <div className="grid gap-2.5 text-[13px] md:grid-cols-3">
                    <Cell label="Plano de imagem">{c.shot}</Cell>
                    <Cell label="Texto na tela">{c.onScreenText ? <span className="font-medium text-ink">“{c.onScreenText}”</span> : <span className="text-ink-3">—</span>}</Cell>
                    <Cell label="Fala">{c.speech ? <span className="text-ink">“{c.speech}”</span> : <span className="text-ink-3">sem fala</span>}</Cell>
                    {c.notes && <p className="text-[12px] text-ink-3 md:col-span-3">Nota: {c.notes}</p>}
                  </div>
                </Card>
              </motion.li>
            );
          })}
        </ol>
        <p className="mt-2 text-[12px] text-ink-3 tabular">Soma das cenas: {total.toFixed(1)} s</p>
      </section>

      {/* Legenda */}
      <section>
        <SectionTitle action={<CopyButton text={`${o.caption}\n\n${o.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`} label="Copiar legenda" />}>Legenda pronta</SectionTitle>
        <Card className="p-6">
          <p className="whitespace-pre-wrap text-[14.5px] leading-[1.7] text-ink">{o.caption}</p>
          <p className="mt-4 text-[13.5px] text-[var(--band-below)]">{o.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
        </Card>
        {o.productionNotes.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-[12.5px] text-ink-2">
            {o.productionNotes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Por quê */}
      {p && (
        <section>
          <SectionTitle hint="Cada decisão com os números e os vídeos (do banco) que a sustentam">Por que este roteiro</SectionTitle>
          <Card className="space-y-8 p-6 md:p-8">
            <p className="max-w-[75ch] text-[15px] leading-[1.7] text-ink">{p.datasetReading}</p>
            <div className="space-y-6">
              {(["tema", "hook", "ângulo", "formato", "estrutura", "oferta", "cta", "duração", "áudio"] as const).map((d) => {
                const x = byDecision(d);
                if (!x) return null;
                return (
                  <div key={d} className="grid gap-1 sm:grid-cols-[120px_1fr]">
                    <div className="text-[13px] capitalize text-ink-3">{d}</div>
                    <div>
                      <div className="text-[13.5px] font-medium text-ink">{x.choice}</div>
                      <p className="text-[13px] text-ink-2">{x.why}</p>
                      <p className="text-[12px] text-ink-3 tabular">{x.stats}</p>
                      {x.evidenceIds.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {x.evidenceIds.map((id) => (rows[id] ? <VideoChip key={id} row={rows[id]} list={x.evidenceIds} /> : null))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {p.opportunities.length > 0 && (
              <div>
                <div className="mb-2 text-[13px] font-medium text-ink-3">Oportunidades consideradas</div>
                <ul className="space-y-1.5 text-[13px]">
                  {p.opportunities.map((op, i) => (
                    <li key={i}>
                      <span className="font-medium text-ink">{op.title}.</span> <span className="text-ink-2">{op.rationale}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-[8px] bg-surface-2 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold">Expectativa de desempenho</span>
                <Pill tone={p.expected.confidence === "alta" ? "good" : p.expected.confidence === "média" ? "neutral" : "warn"}>confiança {p.expected.confidence}</Pill>
              </div>
              <p className="mt-1 text-[13px] text-ink-2">{p.expected.rationale}</p>
              {p.expected.risks.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[12.5px] text-ink-3">
                  {p.expected.risks.map((r, i) => (
                    <li key={i}>· {r}</li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </section>
      )}

      {/* Evidências */}
      {ev && (
        <section>
          <SectionTitle hint="Todos os vídeos citados existem no banco (validado no servidor). Clique para abrir.">Evidências citadas ({ev.items.length})</SectionTitle>
          <Card className="divide-y divide-hairline">
            {ev.items.map((e) => (
              <div key={e.videoId} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                {rows[e.videoId] ? <VideoChip row={rows[e.videoId]} /> : <span>@{e.handle}</span>}
                <span className="min-w-0 flex-1 truncate text-ink-2">{e.hookText ?? "—"}</span>
                <span className="text-ink-3 tabular">
                  {fmtRatio(e.ratio)} · score {fmtScore(e.score)} · {fmtCompact(e.views)} views
                </span>
                <span className="flex gap-1">
                  {e.used.map((u) => (
                    <Pill key={u}>{u}</Pill>
                  ))}
                </span>
              </div>
            ))}
          </Card>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-good" />
              {ev.removedIds.length ? `${ev.removedIds.length} ID(s) citados pela IA não existiam no banco e foram removidos.` : "Nenhuma citação inválida."}
            </span>
            <span className="inline-flex items-center gap-1">
              {ev.originality.ok ? <ShieldCheck className="size-3.5 text-good" /> : <AlertTriangle className="size-3.5 text-warn" />}
              Originalidade: maior sobreposição de texto com um hook existente = {Math.round(ev.originality.maxSimilarity * 100)}%
              {!ev.originality.ok && ev.originality.closestId ? " (revise: muito parecido com um vídeo do banco)" : ""}
            </span>
          </div>
        </section>
      )}

      {family.length > 0 && (
        <section>
          <SectionTitle>Outras versões</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {family.map((f) => (
              <Link key={f.id} href={`/scripts?id=${f.id}`} className="block-hover rounded-[8px] bg-surface px-3.5 py-2.5 text-[13px] ring-1 ring-hairline">
                <div className="font-medium text-ink">{f.title}</div>
                <div className="text-ink-3">
                  {fmtAgo(f.createdAt)} · tom {TONES[f.input.tone].toLowerCase()}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 text-ink-3">{icon}</span>
      <div>
        <div className="text-[11.5px] text-ink-3">{label}</div>
        <div className="text-ink">{children}</div>
      </div>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[12px] text-ink-3">{label}</div>
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

function describe(r: ScriptRequestRow) {
  const i = r.input;
  const what = i.mode === "theme" ? `Tema: ${i.theme}` : i.mode === "category" ? `Categoria: ${SCRIPT_CATEGORIES[i.category ?? "auto"]}` : "Os dados decidem";
  const kind = r.kind === "tone" ? " · ajuste de tom" : r.kind === "alternative" ? " · alternativa" : r.kind === "regenerate" ? " · nova versão" : r.kind === "weekly" ? " · lote semanal" : "";
  return `${what}${kind} · tom ${TONES[i.tone].toLowerCase()}`;
}

function PendingRequests({ requests, owner }: { requests: ScriptRequestRow[]; owner: boolean }) {
  const router = useRouter();
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Terminal className="size-4 text-ink" />
        <span className="text-[13.5px] font-semibold">Aguardando o Claude Code ({requests.length})</span>
        {owner ? (
          <span className="ml-auto flex items-center gap-2 text-[12px] text-ink-3">
            No Claude Code, diga “{CC_PHRASE}”
            <CopyButton text={CC_PHRASE} label="Copiar frase" />
          </span>
        ) : (
          <span className="ml-auto text-[12.5px] text-ink-3">Serão escritos na atualização de segunda-feira.</span>
        )}
      </div>
      <ul className="divide-y divide-hairline">
        {requests.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2 text-[13px]">
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--band-below)]" />
            <span className="min-w-0 flex-1 truncate text-ink-2">
              #{r.id} · {describe(r)}
              {r.input.notes ? ` · ${r.input.notes}` : ""}
            </span>
            <span className="text-[11.5px] text-ink-3">{fmtAgo(r.createdAt)}</span>
            {owner && (
              <Button
                size="sm"
                variant="ghost"
                icon={<X className="size-3.5" />}
                aria-label={`Cancelar pedido ${r.id}`}
                onClick={async () => {
                  await fetch(`/api/script-requests/${r.id}`, { method: "DELETE" });
                  router.refresh();
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
