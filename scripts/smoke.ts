/**
 * Smoke test do pipeline SEM as APIs pagas: gera um Reel sintético com ffmpeg, serve por HTTP
 * (simulando a CDN do Instagram), passa pelo mesmo caminho da coleta (normalizeReel → upsertReels)
 * e roda o job process_video pela fila: download → áudio → frames → (transcrição/análise se houver chave).
 * Usa uma pasta de dados temporária; não toca no banco do app.
 *   npm run smoke
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const keep = process.argv.includes("--keep");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hitzz-smoke-"));
process.env.DATA_DIR = path.join(dir, "data");
// isolado: nunca usa o banco da nuvem nem chaves pagas, mesmo que estejam no ambiente
for (const k of ["DATABASE_URL", "TURSO_DATABASE_URL", "DATABASE_AUTH_TOKEN", "TURSO_AUTH_TOKEN", "BLOB_READ_WRITE_TOKEN", "ELEVENLABS_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[k];

async function main() {
  const { db, schema, migrateDb } = await import("../src/db");
  await migrateDb();
  const { eq } = await import("drizzle-orm");
  const { normalizeReel } = await import("../src/server/apify");
  const { upsertReels } = await import("../src/server/collect");
  const { registerHandlers } = await import("../src/server/boot");
  const { startWorker, enqueue } = await import("../src/server/queue");
  const { loadVideos } = await import("../src/server/data");

  // 1. vídeo 9:16 de 12s com 3 cenas; áudio = fala em português (voz do macOS) + trilha baixa
  const mp4 = path.join(dir, "reel.mp4");
  const jpg = path.join(dir, "cover.jpg");
  const speech = path.join(dir, "fala.aiff");
  let hasSpeech = false;
  try {
    execFileSync("say", ["-v", "Luciana", "-o", speech, "Chegou a nova bota da coleção inverno. De duzentos e noventa e nove por cento e noventa e nove, só até domingo. Corre no link da bio."]);
    hasSpeech = true;
  } catch {}
  const audioIn = hasSpeech ? ["-i", speech] : ["-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono"];
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=540x960:rate=30:duration=4", "-f", "lavfi", "-i", "smptebars=size=540x960:rate=30:duration=4", "-f", "lavfi", "-i", "mandelbrot=size=540x960:rate=30", ...audioIn, "-f", "lavfi", "-i", "sine=frequency=330:duration=12", "-filter_complex", "[2:v]trim=duration=4,setpts=PTS-STARTPTS[m];[0:v][1:v][m]concat=n=3:v=1:a=0[v];[3:a]apad=whole_dur=12[s];[4:a]volume=0.08[b];[s][b]amix=inputs=2:duration=first[a]", "-map", "[v]", "-map", "[a]", "-t", "12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", mp4]);
  execFileSync("ffmpeg", ["-v", "error", "-i", mp4, "-frames:v", "1", jpg]);
  console.log("✓ vídeo sintético gerado", (fs.statSync(mp4).size / 1024).toFixed(0), "KB");

  // 2. "CDN" local
  const server = http.createServer((req, res) => {
    const f = req.url === "/v.mp4" ? mp4 : req.url === "/c.jpg" ? jpg : null;
    if (!f) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": f.endsWith(".mp4") ? "video/mp4" : "image/jpeg" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;

  // 3. mesmo caminho da coleta real
  const acc = await db.insert(schema.accounts).values({ handle: "smoke.test", group: "competitor", createdAt: Date.now(), followers: 10000 }).returning().get();
  const base = { type: "Video", caption: "Teste #smoke", hashtags: ["smoke"], likesCount: 100, commentsCount: 5, videoDuration: 12, musicInfo: { uses_original_audio: true } };
  const items = Array.from({ length: 6 }, (_, i) => ({
    ...base,
    id: `smoke${i}`,
    shortCode: `SMK${i}`,
    videoPlayCount: 1000 + i * 150,
    timestamp: new Date(Date.now() - (i + 3) * 86_400_000).toISOString(),
    displayUrl: `http://localhost:${port}/c.jpg`,
    videoUrl: `http://localhost:${port}/v.mp4`,
  }));
  items[0].videoPlayCount = 9000; // um outlier
  const fresh = await upsertReels(acc.id, items.map(normalizeReel).filter((x): x is NonNullable<typeof x> => !!x), 10000);
  const again = await upsertReels(acc.id, items.map(normalizeReel).filter((x): x is NonNullable<typeof x> => !!x), 10000);
  console.log(`✓ ${fresh.length} Reels inseridos; segunda coleta inseriu ${again.length} (deduplicação por ID)`);

  // 4. fila
  registerHandlers();
  await startWorker();
  const job = await enqueue("process_video", "process:smoke0", { videoId: "smoke0" });
  const t0 = Date.now();
  let j = job;
  while (Date.now() - t0 < 120_000) {
    await new Promise((r) => setTimeout(r, 500));
    j = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id)).get())!;
    if (j.status === "done" || j.status === "failed") break;
  }
  const p = (await db.select().from(schema.processing).where(eq(schema.processing.videoId, "smoke0")).get())!;
  const fr = await db.select().from(schema.frames).where(eq(schema.frames.videoId, "smoke0")).get();
  const v = (await db.select().from(schema.videos).where(eq(schema.videos.id, "smoke0")).get())!;
  const sc = (await loadVideos()).byId.get("smoke0")!.score!;
  const tr = await db.select().from(schema.transcripts).where(eq(schema.transcripts.videoId, "smoke0")).get();
  console.log(`✓ job ${j.status} em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("  etapas:", { media: p.media, transcript: p.transcript, frames: p.frames, analysis: p.analysis });
  console.log("  aviso:", p.lastError ?? "—");
  console.log("  capa:", v.thumbnailPath, "| vídeo:", v.videoPath);
  console.log("  frames:", fr?.items.map((f) => f.t).join("s, ") + "s");
  console.log(`  transcrição (${tr?.model ?? "—"}): ${tr?.speechKind ?? "—"} · "${tr?.text ?? ""}"`);
  console.log(`  score: ${sc.ratio?.toFixed(2)}× a mediana → ${sc.band} (score ${sc.score?.toFixed(2)})`);
  const transcriptOk = p.transcript === "done" ? (!hasSpeech || tr?.speechKind === "speech") : p.transcript === "blocked";
  const ok = p.media === "done" && p.frames === "done" && transcriptOk && (fr?.items.length ?? 0) >= 3 && Boolean(v.thumbnailPath) && sc.band === "breakout";
  server.close();
  if (keep) console.log(`\nDados mantidos em DATA_DIR=${process.env.DATA_DIR}`);
  else fs.rmSync(dir, { recursive: true, force: true });
  console.log(ok ? "\nSMOKE OK" : "\nSMOKE FALHOU");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
