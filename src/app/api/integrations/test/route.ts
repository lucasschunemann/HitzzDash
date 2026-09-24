import Anthropic from "@anthropic-ai/sdk";
import { hasKey, anthropicModel, ENV_VARS, transcriberMode, analyzerMode } from "@/server/env";
import { hasWhisper, WHISPER_MODEL_NAME } from "@/server/whisper";
import { ccSummary } from "@/server/claude-code";
import { db, isRemoteDb } from "@/db";
import { getSettings } from "@/server/settings";
import { sql } from "drizzle-orm";
import { hasFfmpeg, run } from "@/server/media";
import { ownerOnly } from "@/server/role";
import { fmtNextWeeklyUpdate } from "@/lib/schedule";

/** Testa cada integração com uma chamada barata. Nunca devolve o valor da chave. */
export async function POST(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  let { key } = (await req.json().catch(() => ({}))) as { key?: string };
  try {
    if (key === "ffmpeg") {
      if (!(await hasFfmpeg())) return Response.json({ ok: false, message: "ffmpeg/ffprobe não encontrados no PATH." });
      const { stdout } = await run("ffmpeg", ["-version"], 10_000);
      return Response.json({ ok: true, message: stdout.split("\n")[0] });
    }
    if (key === "database") {
      await db.run(sql`select 1`);
      return Response.json({ ok: isRemoteDb(), message: isRemoteDb() ? "Conectado ao banco na nuvem." : "Usando o arquivo local (DATABASE_URL não definida)." });
    }
    if (key === "images") {
      const r = await db.run(sql`select count(*) as n, coalesce(sum(bytes), 0) as b from media`);
      const row = r.rows[0] as unknown as { n: number; b: number };
      return Response.json({ ok: Number(row.n) > 0, message: `${row.n} imagens no banco (${(Number(row.b) / 1_048_576).toFixed(1)} MB).` });
    }
    if (key === "password") return Response.json({ ok: Boolean(process.env.DASHBOARD_PASSWORD), message: process.env.DASHBOARD_PASSWORD ? "Senha definida." : "DASHBOARD_PASSWORD ausente." });
    if (key === "worker") {
      const s = await getSettings();
      return Response.json({ ok: Boolean(s.workerLastSeenAt), message: s.workerLastSeenAt ? `Última atualização em ${new Date(s.workerLastSeenAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Próxima: ${fmtNextWeeklyUpdate()}.` : `Ainda não rodou. Próxima: ${fmtNextWeeklyUpdate()}.` });
    }
    if (key === "transcriber") {
      if (transcriberMode() === "local") {
        const ok = await hasWhisper();
        return Response.json({ ok, message: ok ? `Whisper local pronto (${WHISPER_MODEL_NAME}).` : "Whisper não encontrado: rode npm run setup:whisper." });
      }
      key = "elevenlabs";
    }
    if (key === "analyzer") {
      if (analyzerMode() === "claude_code") {
        const s = await ccSummary();
        return Response.json({ ok: true, message: `Modo Claude Code ativo. ${s.videos} vídeo(s) e ${s.scripts} roteiro(s) aguardando.` });
      }
      key = "anthropic";
    }
    if (key !== "apify" && key !== "elevenlabs" && key !== "anthropic") return Response.json({ ok: false, message: "Integração desconhecida" }, { status: 400 });
    if (!hasKey(key)) return Response.json({ ok: false, message: `${ENV_VARS[key].env} não está definida no .env.` });
    if (key === "apify") {
      const r = await fetch("https://api.apify.com/v2/users/me", { headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}` } });
      if (!r.ok) return Response.json({ ok: false, message: `Apify respondeu ${r.status}. Confira o token.` });
      const j = await r.json();
      return Response.json({ ok: true, message: `Conectado como ${j.data?.username ?? "usuário"} (plano ${j.data?.plan?.id ?? "?"}).` });
    }
    if (key === "elevenlabs") {
      const r = await fetch("https://api.elevenlabs.io/v1/models", { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } });
      if (!r.ok) return Response.json({ ok: false, message: `ElevenLabs respondeu ${r.status}. Confira a chave.` });
      return Response.json({ ok: true, message: "Chave aceita. Transcrição com scribe_v2 (pt)." });
    }
    const m = await new Anthropic().models.retrieve(anthropicModel());
    return Response.json({ ok: true, message: `Modelo ${m.id} disponível.` });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message.slice(0, 200) });
  }
}
