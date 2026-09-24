"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui";

/** Botão que chama uma rota da API, mostra carregamento e um toast com o resultado. */
export function ApiButton({
  url,
  method = "POST",
  body,
  children,
  icon,
  variant = "secondary",
  size = "md",
  success,
  confirm,
  className,
}: {
  url: string;
  method?: string;
  body?: unknown;
  children: ReactNode;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  /** Mensagem de sucesso; {chave} é substituído pelo campo da resposta JSON. */
  success?: string;
  confirm?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  return (
    <Button
      variant={variant}
      size={size}
      icon={icon}
      loading={loading}
      className={className}
      onClick={async () => {
        if (confirm && !window.confirm(confirm)) return;
        setLoading(true);
        try {
          const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
          const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
          if (!r.ok) throw new Error((j.error as string) ?? `Erro ${r.status}`);
          if (typeof j.message === "string") toast.success(j.message);
          else if (success) toast.success(success.replace(/\{(\w+)\}/g, (_, k) => String(j[k] ?? "")));
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      {children}
    </Button>
  );
}
