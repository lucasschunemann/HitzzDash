import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/shell";
import { ScriptStudio, type ScriptRow, type ScriptRequestRow } from "@/components/script-studio";
import { listScripts } from "@/server/scriptgen";
import { loadVideos, toClientRow, type ClientVideoRow } from "@/server/data";
import { getInsights } from "@/server/insights";
import { hasKey, analyzerMode } from "@/server/env";
import { pendingScriptRequests } from "@/server/claude-code";
import { THEMES, HOOK_TYPES } from "@/lib/taxonomy";

export const metadata: Metadata = { title: "Roteiros" };

export default async function ScriptsPage({ searchParams }: PageProps<"/scripts">) {
  await connection();
  const sp = await searchParams;
  const scripts = await listScripts() as unknown as ScriptRow[];
  const id = Number(sp.id);
  const selected = (Number.isFinite(id) ? scripts.find((s) => s.id === id) : null) ?? (sp.new ? null : scripts[0] ?? null);
  const { byId } = await loadVideos();
  const rows: Record<string, ClientVideoRow> = {};
  if (selected) {
    const ids = new Set<string>([...(selected.evidence?.items.map((e) => e.videoId) ?? []), ...(selected.plan?.decisions.flatMap((d) => d.evidenceIds) ?? [])]);
    for (const vid of ids) {
      const r = byId.get(vid);
      if (r) rows[vid] = toClientRow(r);
    }
  }
  const seedTheme = typeof sp.theme === "string" && sp.theme in THEMES ? sp.theme : undefined;
  const seedHook = typeof sp.hook === "string" && sp.hook in HOOK_TYPES ? sp.hook : undefined;
  const ins = await getInsights();
  return (
    <div className="mx-auto max-w-[1280px] pb-20">
      <PageHeader title="Roteiros" subtitle="Roteiros originais de Reels, escolhidos e justificados com os dados coletados." />
      <ScriptStudio
        key={selected?.id ?? "new"}
        scripts={scripts}
        selected={selected}
        rows={rows}
        initial={{ open: Boolean(sp.new), seedTheme, seedHook }}
        aiEnabled={hasKey("anthropic")}
        canGenerate={ins.totals.analyzed >= 3}
        mode={analyzerMode()}
        requests={await pendingScriptRequests() as unknown as ScriptRequestRow[]}
      />
    </div>
  );
}
