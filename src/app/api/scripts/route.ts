import { enqueue } from "@/server/queue";
import { listScripts } from "@/server/scriptgen";
import { SCRIPT_CATEGORIES, TONES, THEMES, HOOK_TYPES } from "@/lib/taxonomy";
import type { ScriptInput } from "@/server/scriptgen";
import { analyzerMode } from "@/server/env";
import { createScriptRequest } from "@/server/claude-code";
import { generateScript } from "@/server/scriptgen";
import { ownerOnly } from "@/server/role";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await listScripts());
}

/** Enfileira a geração de um roteiro; o cliente acompanha pelo /api/jobs/[id]. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Partial<ScriptInput> & { via?: "heuristic" };
  // gerar roteiro (com ou sem IA) é só do administrador; a equipe recebe o lote semanal
  const denied = await ownerOnly();
  if (denied) return denied;
  const mode = b.mode === "theme" || b.mode === "category" ? b.mode : "auto";
  if (mode === "theme" && !b.theme?.trim()) return Response.json({ error: "Descreva o tema do roteiro." }, { status: 400 });
  const input: ScriptInput = {
    mode,
    theme: mode === "theme" ? b.theme!.trim().slice(0, 300) : undefined,
    category: mode === "category" && b.category && b.category in SCRIPT_CATEGORIES ? b.category : undefined,
    tone: b.tone && b.tone in TONES ? b.tone : "natural",
    notes: b.notes?.trim().slice(0, 800) || undefined,
    durationSec: b.durationSec && b.durationSec > 3 && b.durationSec < 180 ? Math.round(b.durationSec) : null,
    seedTheme: b.seedTheme && b.seedTheme in THEMES ? b.seedTheme : undefined,
    seedHook: b.seedHook && b.seedHook in HOOK_TYPES ? b.seedHook : undefined,
  };
  // Sem API: o pedido fica aguardando o Claude Code (a menos que peçam o esqueleto heurístico)
  if (b.via !== "heuristic" && analyzerMode() === "claude_code") {
    const r = await createScriptRequest(input);
    return Response.json({ ok: true, requestId: r.id });
  }
  // O esqueleto heurístico é só cálculo: gera na hora (inclusive na Vercel, sem depender do Mac).
  if (b.via === "heuristic") {
    try {
      const row = await generateScript(input, { heuristic: true });
      return Response.json({ ok: true, scriptId: row.id });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  const job = await enqueue("generate_script", `script:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`, { input }, { maxAttempts: 2 });
  return Response.json({ ok: true, jobId: job.id });
}
