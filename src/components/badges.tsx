import { Pill } from "./ui";
import { BAND_LABEL, type Band } from "@/lib/scoring";
import type { Evidence } from "@/lib/patterns";
import { cn } from "@/lib/cn";
import { fmtRatio } from "@/lib/format";

export const BAND_VAR: Record<Band, string> = {
  below: "var(--band-below)",
  normal: "var(--band-normal)",
  above: "var(--band-above)",
  breakout: "var(--band-breakout)",
  maturing: "var(--band-maturing)",
};

export function BandBadge({ band, ratio, compact, projected }: { band: Band | null | undefined; ratio?: number | null; compact?: boolean; projected?: boolean }) {
  if (!band) return <span className="text-ink-3">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-ink">
      <span aria-hidden className={cn("inline-block size-2 rounded-full", band === "maturing" && "ring-1 ring-ink-3/40")} style={{ background: BAND_VAR[band] }} />
      {!compact && BAND_LABEL[band]}
      {ratio !== undefined && ratio !== null && band !== "maturing" && <span className="tabular text-ink-2">{fmtRatio(ratio)}</span>}
      {projected && band !== "maturing" && <span className="text-[11px] text-ink-3">proj.</span>}
    </span>
  );
}

const EVIDENCE_TONE: Record<Evidence, "good" | "accent" | "neutral" | "outline"> = {
  forte: "good",
  moderada: "accent",
  fraca: "neutral",
  anedótica: "outline",
};

export function EvidenceBadge({ level, hint }: { level: Evidence; hint?: string }) {
  return (
    <Pill tone={EVIDENCE_TONE[level]} title={hint}>
      evidência {level}
    </Pill>
  );
}

export function DemoBadge() {
  return (
    <Pill tone="warn" title="Vídeo sintético de demonstração">
      demo
    </Pill>
  );
}
