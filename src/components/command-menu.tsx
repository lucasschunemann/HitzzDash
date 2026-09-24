"use client";

import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, PenLine, UserPlus, Film, AtSign, ArrowRight, Sparkles } from "lucide-react";
import { NAV } from "./nav";
import { hookLabel } from "@/lib/taxonomy";

type SearchResult = { videos: { id: string; handle: string; title: string; hookType: string | null }[]; accounts: { id: number; handle: string }[] };

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResult>({ videos: [], accounts: [] });

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (r.ok) setRes(await r.json());
      } catch {}
    }, 120);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };
  const refreshAll = async () => {
    onOpenChange(false);
    const r = await fetch("/api/refresh", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) toast.success(j.message ?? `Coleta iniciada para ${j.accounts} contas`);
    else toast.error(j.error ?? "Não foi possível iniciar a coleta");
  };

  const item = "flex h-9 cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] text-ink aria-selected:bg-accent-soft aria-selected:text-accent-ink";
  const group = "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-3";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/20 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <Dialog.Content className="glass-strong fixed left-1/2 top-[14vh] z-[91] w-[min(620px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl shadow-lg ring-1 ring-hairline" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Menu de comandos</Dialog.Title>
          <Command shouldFilter={false} loop>
            <Command.Input
              value={q}
              onValueChange={setQ}
              autoFocus
              placeholder="Buscar vídeos, contas ou ações…"
              className="h-12 w-full border-b border-hairline bg-transparent px-4 text-[15px] text-ink outline-none placeholder:text-ink-3"
            />
            <Command.List className="scrollbar-thin max-h-[52vh] overflow-auto p-1.5">
              <Command.Empty className="py-8 text-center text-[13px] text-ink-3">Nada encontrado.</Command.Empty>
              {!q && (
                <Command.Group heading="Ações" className={group}>
                  <Command.Item className={item} onSelect={refreshAll}>
                    <RefreshCw className="size-4 text-ink-3" /> Atualizar todas as contas agora
                  </Command.Item>
                  <Command.Item className={item} onSelect={() => go("/scripts?new=1")}>
                    <PenLine className="size-4 text-ink-3" /> Gerar roteiro
                  </Command.Item>
                  <Command.Item className={item} onSelect={() => go("/accounts?add=1")}>
                    <UserPlus className="size-4 text-ink-3" /> Adicionar conta
                  </Command.Item>
                  <Command.Item className={item} onSelect={() => go("/videos?band=breakout")}>
                    <Sparkles className="size-4 text-ink-3" /> Ver só breakouts
                  </Command.Item>
                </Command.Group>
              )}
              {!q && (
                <Command.Group heading="Ir para" className={group}>
                  {NAV.map((n) => (
                    <Command.Item key={n.href} className={item} onSelect={() => go(n.href)}>
                      <n.icon className="size-4 text-ink-3" /> {n.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {res.accounts.length > 0 && (
                <Command.Group heading="Contas" className={group}>
                  {res.accounts.map((a) => (
                    <Command.Item key={a.id} className={item} value={`acc-${a.id}`} onSelect={() => go(`/videos?account=${a.id}`)}>
                      <AtSign className="size-4 text-ink-3" /> {a.handle}
                      <ArrowRight className="ml-auto size-3.5 text-ink-3" />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {res.videos.length > 0 && (
                <Command.Group heading="Vídeos" className={group}>
                  {res.videos.map((v) => (
                    <Command.Item key={v.id} className={item} value={`vid-${v.id}`} onSelect={() => go(`/videos/${encodeURIComponent(v.id)}`)}>
                      <Film className="size-4 shrink-0 text-ink-3" />
                      <span className="truncate">{v.title}</span>
                      <span className="ml-auto shrink-0 text-[11.5px] text-ink-3">
                        @{v.handle}
                        {v.hookType ? ` · ${hookLabel(v.hookType)}` : ""}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
