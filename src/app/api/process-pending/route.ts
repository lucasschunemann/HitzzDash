import { enqueuePendingProcessing } from "@/server/boot";
import { ownerOnly } from "@/server/role";

/** Enfileira todos os vídeos com etapas pendentes, bloqueadas (se a chave já existir) ou com falha. */
export async function POST() {
  const denied = await ownerOnly();
  if (denied) return denied;
  const n = await enqueuePendingProcessing({ includeFailed: true });
  return Response.json({ ok: true, queued: n });
}
