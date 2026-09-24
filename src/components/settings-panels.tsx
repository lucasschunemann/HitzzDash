"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as Switch from "@radix-ui/react-switch";
import { toast } from "sonner";
import { CheckCircle2, XCircle, PlugZap, RotateCw, Ban, Loader2 } from "lucide-react";
import { Button, Card, Pill } from "./ui";
import { useLive } from "./shell";
import { fmtAgo, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export type Integration = { key: string; label: string; env: string | null; purpose: string; configured: boolean; detail: string };

export function IntegrationList({ items }: { items: Integration[] }) {
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string } | "loading">>({});
  const test = async (key: string) => {
    setResults((r) => ({ ...r, [key]: "loading" }));
    const r = await fetch("/api/integrations/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
    const j = await r.json().catch(() => ({ ok: false, message: "Falha na requisição" }));
    setResults((x) => ({ ...x, [key]: j }));
  };
  return (
    <Card className="divide-y divide-hairline">
      {items.map((i) => {
        const res = results[i.key];
        return (
          <div key={i.key} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            {i.configured ? <CheckCircle2 className="size-4.5 text-good" /> : <XCircle className="size-4.5 text-bad" />}
            <div className="min-w-48 flex-1">
              <div className="text-[13.5px] font-semibold">{i.label}</div>
              <div className="text-[12px] text-ink-3">
                {i.purpose}
                {i.env && (
                  <>
                    {" · "}
                    <code className="font-mono">{i.env}</code> {i.configured ? "definida" : "ausente"}
                  </>
                )}
                {i.detail && ` · ${i.detail}`}
              </div>
              {res && res !== "loading" && <div className={cn("mt-1 text-[12px]", res.ok ? "text-good" : "text-bad")}>{res.message}</div>}
            </div>
            <Button size="sm" icon={<PlugZap className="size-3.5" />} loading={res === "loading"} onClick={() => test(i.key)}>
              Testar
            </Button>
          </div>
        );
      })}
    </Card>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-52 flex-1">
        <div className="text-[13.5px] font-medium">{label}</div>
        {hint && <div className="text-[12px] text-ink-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

const input = "h-8 w-24 rounded-[9px] bg-surface-2 px-2.5 text-right text-[13px] ring-1 ring-hairline outline-none focus:ring-2 focus:ring-[var(--focus)] tabular";

type S = { ownHandle: string; reelsPerAccount: number; baselineN: number; scheduleEnabled: boolean; scheduleIntervalHours: number; scheduleHour: number; includeSharesCount: boolean; keepVideoDays: number; lastScheduledRunAt: number };

export function SettingsForm({ initial, apify }: { initial: S; apify: boolean }) {
  const [s, setS] = useState(initial);
  const router = useRouter();
  const save = async (patch: Partial<S>, msg = "Salvo") => {
    const r = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(j.error ?? "Não foi possível salvar");
    setS(j.settings);
    toast.success(msg);
    router.refresh();
  };
  const num = (k: keyof S) => (
    <input
      type="number"
      className={input}
      value={s[k] as number}
      onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
      onBlur={(e) => Number(e.target.value) !== initial[k] && save({ [k]: Number(e.target.value) } as Partial<S>)}
      aria-label={k}
    />
  );
  const next = s.lastScheduledRunAt ? s.lastScheduledRunAt + s.scheduleIntervalHours * 3_600_000 : null;
  return (
    <div className="space-y-6">
      <Card className="divide-y divide-hairline">
        <Row label="Conta própria (UseHitzz)" hint="Usada para comparar com os concorrentes e nas lacunas. Muda o grupo da conta automaticamente.">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save({ ownHandle: s.ownHandle }, `Conta própria: @${s.ownHandle}`);
            }}
          >
            <span className="text-ink-3">@</span>
            <input value={s.ownHandle} onChange={(e) => setS({ ...s, ownHandle: e.target.value })} className={cn(input, "w-44 text-left")} aria-label="Handle da conta própria" />
            <Button size="sm" type="submit">
              Salvar
            </Button>
          </form>
        </Row>
      </Card>

      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink-2">Agendamento</h3>
        <Card className="divide-y divide-hairline">
          <Row label="Coleta automática" hint={apify ? (s.scheduleEnabled ? (next ? `Próxima por volta de ${fmtDateTime(next)}` : "Roda na próxima checagem (a cada minuto)") : "Desligada") : "Precisa de APIFY_TOKEN"}>
            <Switch.Root
              checked={s.scheduleEnabled}
              onCheckedChange={(v) => save({ scheduleEnabled: v }, v ? "Coleta automática ligada" : "Coleta automática desligada")}
              className="relative h-6 w-10 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-good"
              aria-label="Coleta automática"
            >
              <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
            </Switch.Root>
          </Row>
          <Row label="Intervalo entre coletas (horas)" hint="24 = uma vez por dia">
            {num("scheduleIntervalHours")}
          </Row>
          <Row label="Hora preferida (0–23)" hint="Para intervalos diários ou maiores">
            {num("scheduleHour")}
          </Row>
          <Row label="Última coleta agendada">{<span className="text-[13px] text-ink-2">{s.lastScheduledRunAt ? fmtAgo(s.lastScheduledRunAt) : "nunca"}</span>}</Row>
        </Card>
      </div>

      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink-2">Coleta e análise</h3>
        <Card className="divide-y divide-hairline">
          <Row label="Reels por conta a cada coleta" hint="Os já conhecidos só têm métricas atualizadas; só os novos são transcritos e analisados">
            {num("reelsPerAccount")}
          </Row>
          <Row label="Linha de base (N últimas publicações)" hint="Mediana usada no score de outlier">
            {num("baselineN")}
          </Row>
          <Row label="Manter vídeo baixado (dias)" hint="Capa e frames ficam para sempre; o MP4 é temporário">
            {num("keepVideoDays")}
          </Row>
          <Row label="Coletar compartilhamentos" hint="Recurso pago do actor do Apify (includeSharesCount)">
            <Switch.Root checked={s.includeSharesCount} onCheckedChange={(v) => save({ includeSharesCount: v })} className="relative h-6 w-10 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-good" aria-label="Coletar compartilhamentos">
              <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
            </Switch.Root>
          </Row>
        </Card>
      </div>
    </div>
  );
}

type JobRow = { id: number; type: string; label: string; status: string; progress: string | null; error: string | null; attempts: number; maxAttempts: number; runAfter: number; finishedAt: number | null; videoId: string | null };

export function QueuePanel() {
  const { version } = useLive();
  const [data, setData] = useState<{ active: JobRow[]; recent: JobRow[] } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/jobs", { cache: "no-store" });
    if (r.ok) setData(await r.json());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca a fila no servidor a cada aviso do SSE
    load();
  }, [load, version]);
  const act = async (id: number, action: "retry" | "cancel") => {
    await fetch(`/api/jobs/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    load();
  };
  if (!data) return <div className="skeleton h-32" />;
  const rows = [...data.active, ...data.recent];
  return (
    <Card className="divide-y divide-hairline">
      {rows.length === 0 && <p className="p-6 text-center text-[13px] text-ink-3">Nenhuma tarefa ainda. Coletas, processamento de vídeos e roteiros aparecem aqui.</p>}
      {rows.slice(0, 40).map((j) => (
        <div key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
          {j.status === "running" ? <Loader2 className="size-3.5 animate-spin text-accent" /> : <span className={cn("size-2 rounded-full", j.status === "done" ? "bg-good" : j.status === "failed" ? "bg-bad" : j.status === "queued" ? "bg-ink-3" : "bg-surface-3")} />}
          <span className="font-medium">
            {j.videoId ? (
              <Link href={`/videos/${encodeURIComponent(j.videoId)}`} className="hover:underline">
                {j.label}
              </Link>
            ) : (
              j.label
            )}
          </span>
          <Pill tone={j.status === "failed" ? "bad" : j.status === "done" ? "good" : j.status === "running" ? "accent" : "neutral"}>{{ queued: "na fila", running: "rodando", done: "ok", failed: "falhou", cancelled: "cancelado" }[j.status] ?? j.status}</Pill>
          <span className="text-[12px] text-ink-3">
            {j.progress ?? ""}
            {j.attempts > 0 && ` · tentativa ${j.attempts}/${j.maxAttempts}`}
            {j.finishedAt ? ` · ${fmtAgo(j.finishedAt)}` : ""}
          </span>
          <span className="ml-auto flex gap-1">
            {(j.status === "failed" || j.status === "cancelled") && (
              <Button size="sm" variant="ghost" icon={<RotateCw className="size-3.5" />} onClick={() => act(j.id, "retry")}>
                Tentar de novo
              </Button>
            )}
            {j.status === "queued" && (
              <Button size="sm" variant="ghost" icon={<Ban className="size-3.5" />} onClick={() => act(j.id, "cancel")}>
                Cancelar
              </Button>
            )}
          </span>
          {j.error && j.status !== "done" && <p className="w-full text-[12px] text-bad">{j.error}</p>}
        </div>
      ))}
    </Card>
  );
}
