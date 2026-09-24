import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { anthropicModel } from "./env";

export class LlmError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new LlmError("ANTHROPIC_API_KEY não configurada.", false);
  client ??= new Anthropic({ maxRetries: 3 });
  return client;
}

type Content = Anthropic.Beta.Messages.BetaContentBlockParam[];

/**
 * Chamada com saída estruturada (JSON validado por schema Zod). Usa streaming para não
 * esbarrar em timeout de HTTP e fallback do lado do servidor caso o modelo recuse.
 */
export async function structured<S extends z.ZodType>(opts: {
  system: string;
  content: Content | string;
  schema: S;
  effort?: "low" | "medium" | "high" | "xhigh";
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; model: string; usage: { input: number; output: number } }> {
  const c = getClient();
  const model = anthropicModel();
  try {
    const stream = c.beta.messages.stream({
      model,
      max_tokens: opts.maxTokens ?? 32000,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.content }],
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new LlmError("O modelo recusou a solicitação.", false);
    if (msg.stop_reason === "max_tokens") throw new LlmError("Resposta cortada por limite de tokens.", true);
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new LlmError("Resposta da IA não é JSON válido.", true);
    }
    const res = opts.schema.safeParse(parsed);
    if (!res.success) throw new LlmError(`JSON da IA fora do schema: ${res.error.message.slice(0, 300)}`, true);
    return { data: res.data, model: msg.model ?? model, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new LlmError("Anthropic recusou a chave (401). Confira ANTHROPIC_API_KEY.", false);
    if (e instanceof Anthropic.PermissionDeniedError) throw new LlmError("Sem permissão para este modelo na Anthropic (403).", false);
    if (e instanceof Anthropic.NotFoundError) throw new LlmError(`Modelo ${model} não encontrado. Ajuste ANTHROPIC_MODEL.`, false);
    if (e instanceof Anthropic.BadRequestError) throw new LlmError(`Requisição inválida para a Anthropic: ${e.message.slice(0, 300)}`, false);
    if (e instanceof Anthropic.RateLimitError) throw new LlmError("Limite de uso da Anthropic atingido (429). Tentaremos de novo.", true);
    if (e instanceof Anthropic.APIConnectionError) throw new LlmError("Falha de conexão com a Anthropic.", true);
    if (e instanceof Anthropic.APIError) throw new LlmError(`Erro da Anthropic (${e.status}): ${e.message.slice(0, 200)}`, (e.status ?? 500) >= 500);
    throw e;
  }
}
