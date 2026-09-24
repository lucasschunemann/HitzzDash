import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FRAMES_DIR, TMP_DIR, mediaRel } from "@/lib/paths";
import type { FrameRef } from "@/db/schema";

export class MediaError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

export function run(cmd: string, args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new MediaError(`${cmd} passou do tempo limite`, true));
    }, timeoutMs);
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(new MediaError(`${cmd} não encontrado ou falhou ao iniciar: ${e.message}`, false));
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new MediaError(`${cmd} saiu com código ${code}: ${stderr.split("\n").slice(-4).join(" ").slice(0, 400)}`, false));
    });
  });
}

let ffmpegOk: boolean | null = null;
export async function hasFfmpeg() {
  if (ffmpegOk !== null) return ffmpegOk;
  try {
    await run("ffmpeg", ["-version"], 10_000);
    await run("ffprobe", ["-version"], 10_000);
    ffmpegOk = true;
  } catch {
    ffmpegOk = false;
  }
  return ffmpegOk;
}

/** Baixa um arquivo (URLs do Instagram expiram, então isso roda logo após a coleta). */
export async function download(url: string, dest: string, expect: "image" | "video", timeoutMs = 90_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (Macintosh) HitzzDash/1.0" } });
    if (res.status === 403 || res.status === 410) throw new MediaError(`URL da mídia expirou (${res.status}). Recolete a conta para renovar.`, false);
    if (!res.ok || !res.body) throw new MediaError(`Download falhou (${res.status})`, res.status >= 500 || res.status === 429);
    const type = res.headers.get("content-type") ?? "";
    if (type && !type.startsWith(expect) && !type.includes("octet-stream")) throw new MediaError(`Tipo inesperado no download: ${type}`, false);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 512) throw new MediaError("Arquivo baixado vazio", true);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return dest;
  } catch (e) {
    if (e instanceof MediaError) throw e;
    throw new MediaError(`Download falhou: ${(e as Error).message}`, true);
  } finally {
    clearTimeout(t);
  }
}

export async function probe(file: string) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file], 30_000);
  const j = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type: string }[] };
  return {
    duration: j.format?.duration ? Number(j.format.duration) : null,
    hasAudio: Boolean(j.streams?.some((s) => s.codec_type === "audio")),
    hasVideo: Boolean(j.streams?.some((s) => s.codec_type === "video")),
  };
}

/** Extrai o áudio em MP3 mono 16 kHz (suficiente para fala e bem menor para upload). */
export async function extractAudio(videoFile: string, id: string) {
  const out = path.join(TMP_DIR, `${id}.mp3`);
  await run("ffmpeg", ["-y", "-v", "error", "-i", videoFile, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", out], 120_000);
  return out;
}

/** Mede a fração do áudio acima do limiar de silêncio (ajuda a separar "só música" de "sem áudio"). */
export async function loudness(file: string) {
  const { stderr } = await run("ffmpeg", ["-v", "info", "-i", file, "-af", "volumedetect", "-f", "null", "-"], 60_000);
  const m = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  return m ? Number(m[1]) : null;
}

async function sceneChanges(videoFile: string, threshold = 0.3): Promise<number[]> {
  try {
    const { stderr } = await run(
      "ffmpeg",
      ["-v", "info", "-i", videoFile, "-vf", `scale=320:-2,select='gt(scene,${threshold})',showinfo`, "-an", "-f", "null", "-"],
      120_000,
    );
    return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  } catch {
    return [];
  }
}

/**
 * Distribui os quadros depois do hook por faixas de tempo iguais até o fim do vídeo: em cada faixa
 * usa o primeiro corte de cena detectado; sem corte, o meio da faixa. Assim cortes concentrados no
 * começo não deixam o final do vídeo sem cobertura.
 */
export function spreadPicks(dur: number, cuts: number[], maxRest = 7) {
  if (dur <= 3.3) return [];
  const slots = Math.min(maxRest, Math.max(3, Math.ceil((dur - 3) / 4)));
  const size = (dur - 3) / slots;
  const out: number[] = [];
  for (let k = 0; k < slots; k++) {
    const a = 3 + k * size;
    const b = a + size;
    const cut = cuts.find((t) => t >= a && t < b);
    out.push(Math.round((cut !== undefined ? Math.min(cut + 0.15, dur - 0.2) : Math.min(a + size / 2, dur - 0.2)) * 10) / 10);
  }
  return [...new Set(out)];
}

/**
 * Frames-chave: 3 frames nos primeiros 3 segundos (o hook) + cortes de cena detectados,
 * completando com amostragem uniforme. Máximo de 10 frames, 540px de largura.
 */
export async function extractFrames(videoFile: string, id: string, duration: number | null): Promise<FrameRef[]> {
  const dur = duration && duration > 0 ? duration : 15;
  const hook = [0.2, 1.2, 2.6].filter((t) => t < dur);
  const cuts = (await sceneChanges(videoFile)).filter((t) => t > 3 && t < dur - 0.3);
  const times = [...hook, ...spreadPicks(dur, cuts)];
  const dir = path.join(FRAMES_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const out: FrameRef[] = [];
  for (const t of times) {
    const f = path.join(dir, `${t.toFixed(1).replace(".", "_")}.jpg`);
    try {
      await run("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", videoFile, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", f], 30_000);
      if (fs.existsSync(f) && fs.statSync(f).size > 0) out.push({ path: mediaRel(f), t });
    } catch {
      // frame isolado com falha não derruba o lote
    }
  }
  if (!out.length) throw new MediaError("Não foi possível extrair frames do vídeo", false);
  return out;
}

/** Thumbnail a partir do próprio vídeo, quando a URL da capa falhar. */
export async function thumbFromVideo(videoFile: string, dest: string) {
  await run("ffmpeg", ["-y", "-v", "error", "-ss", "0.5", "-i", videoFile, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", dest], 30_000);
  return dest;
}
