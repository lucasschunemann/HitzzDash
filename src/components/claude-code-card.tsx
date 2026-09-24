"use client";

import { useState } from "react";
import { Terminal, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { fmtAgo } from "@/lib/format";

export const CC_MAIN_PHRASE = "processe os pendentes do Hitzz";

function Phrase({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1400);
        } catch {
          toast.error("Não foi possível copiar");
        }
      }}
      className="group inline-flex items-center gap-2 rounded-[6px] bg-surface px-2.5 py-1.5 text-left text-[13px] font-medium text-ink ring-1 ring-hairline-strong transition-[background-color,transform] hover:bg-hover active:scale-[0.97]"
      title="Copiar"
    >
      “{text}”
      {ok ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5 text-ink-3 transition-colors group-hover:text-ink-2" />}
    </button>
  );
}

/** Mostra o que está aguardando o Claude Code (modo gratuito) e a frase para pedir. */
export function ClaudeCodeCard({ videos, scripts, lastDigest }: { videos: number; scripts: number; lastDigest: { createdAt: number; generator: string } | null }) {
  const idle = videos === 0 && scripts === 0;
  return (
    <div className="rounded-[10px] bg-surface-2 p-5 md:px-6">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-surface text-ink ring-1 ring-hairline">
          <Terminal className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink">{idle ? "Claude Code em dia" : "Aguardando o Claude Code"}</div>
          <p className="mt-0.5 max-w-[80ch] text-[13.5px] leading-relaxed text-ink-2">
            Modo gratuito: análise, resumo e roteiros são feitos numa sessão do Claude Code, com a sua assinatura.{" "}
            {idle ? "Nada pendente agora." : [videos && `${videos} ${videos === 1 ? "vídeo" : "vídeos"} para analisar`, scripts && `${scripts} ${scripts === 1 ? "roteiro pedido" : "roteiros pedidos"}`].filter(Boolean).join(" e ") + "."}{" "}
            {lastDigest ? `Último resumo ${lastDigest.generator === "claude-code" ? "escrito pelo Claude Code" : "calculado sem IA"} ${fmtAgo(lastDigest.createdAt)}.` : ""}
          </p>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-ink-3">No Claude Code, diga:</span>
            <Phrase text={CC_MAIN_PHRASE} />
            <Phrase text="gere o resumo da semana do Hitzz" />
          </div>
        </div>
      </div>
    </div>
  );
}
