/** Status das integrações. Nunca retorna o valor das chaves, só se existem. */
export type IntegrationKey = "apify" | "elevenlabs" | "anthropic" | "ffmpeg";

export const ENV_VARS: Record<Exclude<IntegrationKey, "ffmpeg">, { env: string; label: string; purpose: string }> = {
  apify: { env: "APIFY_TOKEN", label: "Apify", purpose: "Coleta de Reels e perfis do Instagram" },
  elevenlabs: { env: "ELEVENLABS_API_KEY", label: "ElevenLabs Scribe", purpose: "Transcrição da fala (opcional: sem ela usa o Whisper local)" },
  anthropic: { env: "ANTHROPIC_API_KEY", label: "Anthropic (Claude API)", purpose: "Análise automática (opcional: sem ela a análise é feita pelo Claude Code)" },
};

export function hasKey(k: Exclude<IntegrationKey, "ffmpeg">) {
  return Boolean(process.env[ENV_VARS[k].env]?.trim());
}

export function anthropicModel() {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";
}

/**
 * Quem transcreve: ElevenLabs quando há chave, senão o Whisper local (gratuito).
 * TRANSCRIBER=local|elevenlabs força um dos dois.
 */
export function transcriberMode(): "elevenlabs" | "local" {
  const forced = process.env.TRANSCRIBER?.trim();
  if (forced === "local" || forced === "elevenlabs") return forced;
  return hasKey("elevenlabs") ? "elevenlabs" : "local";
}

/**
 * Quem analisa e escreve roteiros: a API da Anthropic quando há chave, senão o Claude Code
 * (sessão manual com a assinatura do Claude, sem custo de API). ANALYZER=api|claude_code força.
 */
export function analyzerMode(): "api" | "claude_code" {
  const forced = process.env.ANALYZER?.trim();
  if (forced === "api" || forced === "claude_code") return forced;
  return hasKey("anthropic") ? "api" : "claude_code";
}
