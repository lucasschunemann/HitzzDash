/**
 * CLI do modo Claude Code. Usado pela skill .claude/skills/hitzz (não precisa decorar).
 *
 *   npm run cc -- work                       roda a fila no Mac: coletas pedidas/agendadas, download, Whisper, frames
 *   npm run cc -- pack [--n 8]               reserva N vídeos e imprime guia + insumos compactos (analista)
 *   npm run cc -- save-batch <arq.jsonl>     valida e grava um lote no formato compacto
 *   npm run cc -- status                     o que está aguardando
 *   npm run cc -- guides                     escreve os guias e schemas em data/claude-code/
 *   npm run cc -- videos [--limit 10]        prepara os vídeos pendentes (folha de frames + input.json)
 *   npm run cc -- save-analysis <id> <arq>   valida e grava a análise de um vídeo
 *   npm run cc -- digest                     prepara o resumo semanal
 *   npm run cc -- save-digest <arq>          valida e grava o resumo
 *   npm run cc -- scripts                    prepara os pedidos de roteiro pendentes
 *   npm run cc -- new-script [--category launch|promotion|...] [--theme "texto"] [--tone natural] [--notes "..."]
 *   npm run cc -- save-script <pedido> <arq> valida e grava um roteiro
 */
import { loadEnvConfig } from "@next/env";

// Mesmas variáveis que o Next usa (.env, .env.local)
loadEnvConfig(process.cwd());
import { SCRIPT_CATEGORIES, TONES, type ScriptCategory, type Tone } from "../src/lib/taxonomy";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  await (await import("../src/db")).migrateDb();
  const cc = await import("../src/server/claude-code");
  const [cmd, a1, a2] = process.argv.slice(2).filter((x, i, arr) => !x.startsWith("--") && !(arr[i - 1] ?? "").startsWith("--"));
  const out = (x: unknown) => console.log(typeof x === "string" ? x : JSON.stringify(x, null, 2));

  switch (cmd) {
    case "work": {
      const boot = await import("../src/server/boot");
      const queue = await import("../src/server/queue");
      const { syncMediaToDb } = await import("../src/server/pipeline");
      boot.registerHandlers();
      await boot.schedulerTick();
      const pending = await boot.enqueuePendingProcessing({});
      if (pending) console.log(`${pending} vídeo(s) com etapas pendentes voltaram para a fila`);
      const res = await queue.drainQueue((m) => console.log(`[fila] ${m}`), { maxMinutes: Number(arg("minutes") ?? 60) });
      await syncMediaToDb((m) => console.log(m));
      const s = await cc.ccSummary();
      out({ jobs_concluidos: res.done, falhas: res.failed, para_depois: res.retryLater, videos_aguardando_analise: s.videos, pedidos_de_roteiro: s.scripts });
      break;
    }
    case "sync-media": {
      const { syncMediaToDb } = await import("../src/server/pipeline");
      out(await syncMediaToDb((m) => console.log(m)));
      break;
    }
    case "status": {
      const s = await cc.ccSummary();
      out({ videos_aguardando_analise: s.videos, pedidos_de_roteiro: s.scripts, ultimo_resumo: s.lastDigest ? { quando: new Date(s.lastDigest.createdAt).toLocaleString("pt-BR"), por: s.lastDigest.generator } : null });
      break;
    }
    case "guides":
      cc.writeGuides();
      console.log((await import("../src/lib/analysis-compact")).COMPACT_GUIDE);
      break;
    case "videos": {
      cc.writeGuides();
      const limit = Number(arg("limit") ?? 10);
      const list = await cc.awaitingAnalysis();
      const batch = list.slice(0, limit);
      const prepared = [];
      for (const v of batch) prepared.push({ id: v.id, conta: `@${v.handle}`, ...(await await cc.prepareVideo(v.id)) });
      out({ total_aguardando: list.length, preparados: prepared.length, videos: prepared });
      break;
    }
    case "pack": {
      // reserva e imprime um lote compacto (guia + insumos) para um analista
      const r = await cc.packVideos({ limit: Number(arg("n") ?? 8) });
      console.log(r.text);
      break;
    }
    case "save-batch": {
      if (!a1) throw new Error("uso: save-batch <arquivo.jsonl>");
      const r = await cc.saveBatch(a1);
      console.log(`${r.ok}/${r.total} gravados\n${r.text}`);
      break;
    }
    case "save-analysis":
      if (!a1 || !a2) throw new Error("uso: save-analysis <id> <arquivo.json>");
      out({ ok: true, video: a1, ...await cc.saveAnalysis(a1, a2) });
      break;
    case "digest":
      cc.writeGuides();
      out(await cc.prepareDigest());
      break;
    case "save-digest":
      if (!a1) throw new Error("uso: save-digest <arquivo.json>");
      out({ ok: true, ...await cc.saveDigest(a1) });
      break;
    case "scripts": {
      cc.writeGuides();
      const reqs = await cc.pendingScriptRequests();
      const pedidos = [];
      for (const r of reqs) pedidos.push({ pedido: r.id, tipo: r.kind, ...(await cc.prepareScriptRequest(r.id)) });
      out({ pedidos });
      break;
    }
    case "new-script": {
      const category = arg("category") as ScriptCategory | undefined;
      const theme = arg("theme");
      const tone = (arg("tone") as Tone) ?? "natural";
      if (category && !(category in SCRIPT_CATEGORIES)) throw new Error(`categoria inválida: ${Object.keys(SCRIPT_CATEGORIES).join(", ")}`);
      if (!(tone in TONES)) throw new Error(`tom inválido: ${Object.keys(TONES).join(", ")}`);
      const req = await cc.createScriptRequest({ mode: theme ? "theme" : category ? "category" : "auto", theme, category, tone, notes: arg("notes") });
      out({ pedido: req.id, ...await cc.prepareScriptRequest(req.id) });
      break;
    }
    case "save-script":
      if (!a1 || !a2) throw new Error("uso: save-script <pedido> <arquivo.json>");
      out({ ok: true, ...await cc.saveScriptRequest(Number(a1), a2) });
      break;
    default:
      out("Comandos: work, sync-media, status, guides, videos, save-analysis, digest, save-digest, scripts, new-script, save-script");
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`ERRO: ${(e as Error).message}`);
    process.exit(1);
  },
);
