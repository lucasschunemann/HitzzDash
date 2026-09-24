"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, RefreshCw, Trash2, AtSign } from "lucide-react";
import type { AccountStat } from "@/server/accounts";
import { GROUPS } from "@/lib/taxonomy";
import { fmtAgo, fmtCompact } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, Pill, Card, Tip } from "./ui";

export function AddAccountForm({ compact }: { compact?: boolean }) {
  const [handle, setHandle] = useState("");
  const [group, setGroup] = useState<keyof typeof GROUPS>("competitor");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (sp.get("add")) input.current?.focus();
  }, [sp]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setLoading(true);
    const r = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, group }) });
    const j = await r.json().catch(() => ({}));
    setLoading(false);
    if (!r.ok) return toast.error(j.error ?? "Não foi possível adicionar");
    toast.success(j.message);
    setHandle("");
    router.refresh();
  };
  return (
    <form onSubmit={submit} className={cn("flex flex-wrap items-center gap-2", compact && "")}>
      <div className="relative min-w-52 flex-1">
        <AtSign className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
        <input
          ref={input}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="handle ou link do perfil"
          aria-label="Handle do Instagram"
          className="h-8 w-full rounded-[6px] bg-surface pl-8 pr-3 text-[14px] ring-1 ring-hairline-strong outline-none transition-shadow placeholder:text-ink-3 focus:ring-2 focus:ring-[var(--focus)]"
        />
      </div>
      <select value={group} onChange={(e) => setGroup(e.target.value as keyof typeof GROUPS)} aria-label="Grupo" className="h-8 rounded-[6px] bg-surface px-2.5 text-[14px] ring-1 ring-hairline-strong transition-colors hover:bg-hover">
        {Object.entries(GROUPS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <Button type="submit" variant="primary" loading={loading} icon={<UserPlus className="size-3.5" />}>
        Adicionar
      </Button>
    </form>
  );
}

export function AccountTable({ accounts }: { accounts: AccountStat[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const call = async (key: string, url: string, method: string, body?: unknown, ok?: string) => {
    setBusy(key);
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return toast.error(j.error ?? "Falhou");
    if (typeof j.message === "string") toast.success(j.message);
    else if (ok) toast.success(ok);
    router.refresh();
  };
  return (
    <Card className="divide-y divide-hairline">
      {accounts.map((a) => (
        <div key={a.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 transition-[background-color,opacity] hover:bg-hover", !a.active && "opacity-55")}>
          <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-[13px] font-semibold text-ink-2 ring-1 ring-hairline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {a.avatar ? <img src={a.avatar} alt="" className="size-full object-cover" /> : a.handle[0]?.toUpperCase()}
          </div>
          <div className="min-w-40 flex-1">
            <div className="flex items-center gap-1.5">
              <a href={`https://www.instagram.com/${a.handle}/`} target="_blank" rel="noreferrer" className="text-[13.5px] font-semibold text-ink link-underline">
                @{a.handle}
              </a>
              {a.isDemo && <Pill tone="warn">só demo</Pill>}
              {a.lastScrapeStatus === "error" && (
                <Tip content={a.lastError}>
                  <span>
                    <Pill tone="bad">erro na coleta</Pill>
                  </span>
                </Tip>
              )}
              {a.lastScrapeStatus === "running" && <Pill tone="accent">coletando…</Pill>}
            </div>
            <div className="text-[12px] text-ink-3">
              {a.followers ? `${fmtCompact(a.followers)} seguidores · ` : ""}
              {a.videos} vídeos · {a.lastScrapedAt ? `coletado ${fmtAgo(a.lastScrapedAt)}` : "nunca coletado"}
            </div>
          </div>
          <select
            value={a.group}
            onChange={(e) => call(`g${a.id}`, `/api/accounts/${a.id}`, "PATCH", { group: e.target.value }, "Grupo atualizado")}
            aria-label={`Grupo de @${a.handle}`}
            className="h-7.5 rounded-[6px] bg-accent-soft px-2 text-[13px] text-ink transition-colors hover:bg-active"
          >
            {Object.entries(GROUPS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2" title="Contas pausadas não entram na coleta automática">
            <input type="checkbox" checked={a.active} onChange={(e) => call(`a${a.id}`, `/api/accounts/${a.id}`, "PATCH", { active: e.target.checked }, e.target.checked ? "Conta ativada" : "Conta pausada")} className="accent-[var(--accent)]" />
            Ativa
          </label>
          <Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={busy === `s${a.id}`} onClick={() => call(`s${a.id}`, `/api/accounts/${a.id}/scrape`, "POST", undefined, `Coleta de @${a.handle} na fila`)}>
            Coletar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remover @${a.handle}`}
            loading={busy === `d${a.id}`}
            onClick={() => {
              if (window.confirm(`Remover @${a.handle} e todos os ${a.videos} vídeos coletados dela? Isso não pode ser desfeito.`)) call(`d${a.id}`, `/api/accounts/${a.id}`, "DELETE", undefined, `@${a.handle} removida`);
            }}
            icon={<Trash2 className="size-3.5" />}
          />
        </div>
      ))}
    </Card>
  );
}
