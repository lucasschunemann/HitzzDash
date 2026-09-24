import { refreshAll } from "@/server/boot";
import { hasKey } from "@/server/env";
import { isWorkerHost } from "@/server/host";
import { ownerOnly } from "@/server/role";

export async function POST() {
  const denied = await ownerOnly();
  if (denied) return denied;
  // Na Vercel a coleta só é enfileirada: quem executa é o Mac (npm run cc -- work).
  if (isWorkerHost() && !hasKey("apify")) return Response.json({ error: "Configure APIFY_TOKEN no .env para coletar dados reais." }, { status: 400 });
  const r = await refreshAll("manual");
  return Response.json({ ...r, message: isWorkerHost() ? `Coleta iniciada para ${r.accounts} contas` : `Coleta de ${r.accounts} contas na fila: roda na próxima vez que o Mac processar` });
}
