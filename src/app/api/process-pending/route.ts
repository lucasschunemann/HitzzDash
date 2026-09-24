import { enqueuePendingProcessing } from "@/server/boot";

/** Enfileira todos os vídeos com etapas pendentes, bloqueadas (se a chave já existir) ou com falha. */
export async function POST() {
  const n = await enqueuePendingProcessing({ includeFailed: true });
  return Response.json({ ok: true, queued: n });
}
