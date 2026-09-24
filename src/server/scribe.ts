/**
 * ElevenLabs Speech-to-Text (Scribe). Endpoint e parâmetros conferidos na documentação:
 * POST https://api.elevenlabs.io/v1/speech-to-text, header xi-api-key, multipart com
 * model_id=scribe_v2, file, language_code, tag_audio_events, timestamps_granularity.
 */
import fs from "node:fs";
import path from "node:path";
import type { TranscriptWord } from "@/db/schema";

export const SCRIBE_MODEL = "scribe_v2";

export class ScribeError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

type ScribeResponse = {
  language_code?: string;
  language_probability?: number;
  text?: string;
  words?: { text: string; type: string; start?: number; end?: number }[];
};

export async function transcribe(audioFile: string, keyterms: string[] = []) {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new ScribeError("ELEVENLABS_API_KEY não configurada.", false);
  const form = new FormData();
  form.append("model_id", SCRIBE_MODEL);
  form.append("language_code", "pt");
  form.append("tag_audio_events", "true");
  form.append("timestamps_granularity", "word");
  form.append("diarize", "false");
  for (const k of keyterms.slice(0, 50)) form.append("keyterms", k);
  form.append("file", new Blob([fs.readFileSync(audioFile)], { type: "audio/mpeg" }), path.basename(audioFile));

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401) throw new ScribeError("ElevenLabs recusou a chave (401).", false);
    if (res.status === 422 || res.status === 400) {
      // keyterms pode não ser aceito em alguns planos: tenta de novo sem eles
      if (keyterms.length) return transcribe(audioFile, []);
      throw new ScribeError(`ElevenLabs rejeitou a requisição (${res.status}): ${body}`, false);
    }
    throw new ScribeError(`ElevenLabs ${res.status}: ${body}`, res.status === 429 || res.status >= 500);
  }
  const j = (await res.json()) as ScribeResponse;
  const words: TranscriptWord[] = (j.words ?? [])
    .filter((w) => w.type === "word" || w.type === "audio_event")
    .map((w) => ({ text: w.text, start: w.start ?? 0, end: w.end ?? 0, type: w.type }));
  const spoken = words.filter((w) => w.type === "word");
  const events = [...new Set(words.filter((w) => w.type === "audio_event").map((w) => w.text.replace(/[()[\]]/g, "").trim()))];
  const speechSeconds = spoken.reduce((s, w) => s + Math.max(0, w.end - w.start), 0);
  return {
    text: spoken.map((w) => w.text).join(" ").replace(/\s+([,.!?])/g, "$1").trim(),
    words,
    audioEvents: events,
    languageCode: j.language_code ?? null,
    speechSeconds,
    wordCount: spoken.length,
  };
}

/**
 * Decide se há fala de verdade. Reels de calçado costumam ter só trilha; letras de música
 * transcritas não contam como fala do criador.
 */
export function classifySpeech(r: { wordCount: number; speechSeconds: number; audioEvents: string[] }, music: { usesOriginalAudio?: boolean | null; song?: string | null } | null) {
  if (r.wordCount < 4 || r.speechSeconds < 1.2) return "none" as const;
  const musicy = r.audioEvents.some((e) => /m[uú]sica|music|singing|canto/i.test(e));
  const licensedSong = music && music.usesOriginalAudio === false && Boolean(music.song);
  if (licensedSong || (musicy && r.wordCount < 25)) return "lyrics" as const;
  return "speech" as const;
}
