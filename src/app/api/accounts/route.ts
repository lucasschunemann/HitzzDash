import { addAccount, accountStats } from "@/server/accounts";
import type { AccountGroup } from "@/db/schema";
import { ownerOnly } from "@/server/role";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await accountStats());
}

export async function POST(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { handle?: string; group?: AccountGroup };
  const group: AccountGroup = body.group === "own" || body.group === "reference" ? body.group : "competitor";
  try {
    const r = await addAccount(body.handle ?? "", group);
    return Response.json({ ok: true, handle: r.account.handle, queued: r.queued, message: r.queued ? `@${r.account.handle} adicionada. Coleta iniciada.` : `@${r.account.handle} adicionada. Configure APIFY_TOKEN para coletar.` });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
