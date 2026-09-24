import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { enqueue } from "@/server/queue";
import { getInsights } from "@/server/insights";
import { generateDigest } from "@/server/digest";
import { analyzerMode } from "@/server/env";

export async function POST() {
  if ((await getInsights()).totals.analyzed < 3) return Response.json({ error: "Poucos vídeos analisados para um resumo." }, { status: 400 });
  if (analyzerMode() === "claude_code") {
    // não troca um resumo escrito pelo Claude Code (desta semana) por um calculado sem IA
    const last = await db.select().from(schema.digests).orderBy(desc(schema.digests.createdAt)).limit(1).get();
    if (last?.generator === "claude-code" && Date.now() - last.createdAt < 7 * 86_400_000) {
      return Response.json({ ok: true, message: "O resumo atual foi escrito pelo Claude Code nesta semana. Para atualizá-lo, peça no Claude Code: “gere o resumo da semana do Hitzz”." });
    }
    await generateDigest();
    return Response.json({ ok: true, message: "Resumo recalculado pelos números. Para a versão escrita, peça ao Claude Code." });
  }
  const job = await enqueue("weekly_digest", `digest:manual:${Date.now()}`);
  return Response.json({ ok: true, jobId: job.id, message: "Resumo na fila; aparece aqui quando ficar pronto" });
}
