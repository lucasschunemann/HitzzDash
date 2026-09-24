/**
 * Transcrição local e gratuita com whisper.cpp (whisper-cli) + detecção de voz (Silero VAD).
 * O VAD é o que separa fala de trilha: áudio só com música volta sem segmentos, em vez de
 * o Whisper "inventar" texto. Modelos em ./models (ver scripts/setup-whisper.sh).
 */
import fs from "node:fs";
import path from "node:path";
import type { TranscriptWord } from "@/db/schema";
import { run } from "./media";
import { TMP_DIR } from "@/lib/paths";

const MODELS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "models");
export const WHISPER_MODEL_FILE = process.env.WHISPER_MODEL?.trim() || path.join(MODELS_DIR, "ggml-large-v3-turbo-q5_0.bin");
const VAD_MODEL_FILE = path.join(MODELS_DIR, "ggml-silero-v5.1.2.bin");
export const WHISPER_MODEL_NAME = `whisper.cpp ${path.basename(WHISPER_MODEL_FILE).replace(/^ggml-|\.bin$/g, "")}`;

export class WhisperError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

let available: boolean | null = null;
/** whisper-cli instalado e modelo baixado. */
export async function hasWhisper() {
  if (available !== null) return available;
  if (!fs.existsSync(/*turbopackIgnore: true*/ WHISPER_MODEL_FILE)) return (available = false);
  try {
    await run("whisper-cli", ["--help"], 10_000);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

// Frases que o Whisper costuma alucinar em trechos sem fala (legendas de YouTube etc.).
const HALLUCINATIONS = [/legendas? pela comunidade/i, /amara\.org/i, /obrigad[oa] por assistir/i, /inscreva-se no canal/i, /^\s*tchau\.?\s*$/i];

type WhisperJson = { transcription?: { offsets: { from: number; to: number }; text: string }[] };

export async function transcribeLocal(audioFile: string) {
  if (!(await hasWhisper())) throw new WhisperError("Whisper local não configurado. Rode npm run setup:whisper.", false);
  const base = path.join(TMP_DIR, `whisper-${path.basename(audioFile, path.extname(audioFile))}-${Date.now()}`);
  const wav = `${base}.wav`;
  try {
    await run("ffmpeg", ["-y", "-v", "error", "-i", audioFile, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], 60_000);
    const args = ["-m", WHISPER_MODEL_FILE, "-f", wav, "-l", "pt", "-oj", "-of", base, "-ml", "1", "-sow", "-np"];
    if (fs.existsSync(VAD_MODEL_FILE)) args.push("--vad", "-vm", VAD_MODEL_FILE);
    await run("whisper-cli", args, 5 * 60_000);
    const j = JSON.parse(fs.readFileSync(`${base}.json`, "utf8")) as WhisperJson;
    const words: TranscriptWord[] = [];
    const events = new Set<string>();
    for (const seg of j.transcription ?? []) {
      const text = seg.text.trim();
      if (!text) continue;
      const ev = text.match(/^[[(](.+)[\])]$/);
      if (ev) {
        events.add(ev[1].toLowerCase());
        words.push({ text, start: seg.offsets.from / 1000, end: seg.offsets.to / 1000, type: "audio_event" });
        continue;
      }
      words.push({ text, start: seg.offsets.from / 1000, end: seg.offsets.to / 1000, type: "word" });
    }
    let spoken = words.filter((w) => w.type === "word");
    if (HALLUCINATIONS.some((h) => h.test(spoken.map((w) => w.text).join(" "))) && spoken.length < 12) spoken = [];
    const joined = spoken.map((w) => w.text).join(" ");
    const speechSeconds = spoken.reduce((s, w) => s + Math.max(0, w.end - w.start), 0);
    return {
      text: joined.replace(/\s+([,.!?])/g, "$1").trim(),
      words: [...spoken, ...words.filter((w) => w.type === "audio_event")].sort((a, b) => a.start - b.start),
      audioEvents: [...events],
      languageCode: "pt",
      speechSeconds,
      wordCount: spoken.length,
    };
  } finally {
    for (const f of [wav, `${base}.json`]) fs.rmSync(f, { force: true });
  }
}
