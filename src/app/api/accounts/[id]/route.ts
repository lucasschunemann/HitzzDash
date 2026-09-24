import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteAccount } from "@/server/collect";
import { bump } from "@/server/events";
import { setSettings } from "@/server/settings";
import type { AccountGroup } from "@/db/schema";
import { ownerOnly } from "@/server/role";

export async function PATCH(req: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const body = (await req.json().catch(() => ({}))) as { group?: AccountGroup; active?: boolean };
  const acc = await db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get();
  if (!acc) return Response.json({ error: "Conta não encontrada" }, { status: 404 });
  const patch: Partial<typeof acc> = {};
  if (body.group && ["competitor", "reference", "own"].includes(body.group)) patch.group = body.group;
  if (typeof body.active === "boolean") patch.active = body.active;
  await db.update(schema.accounts).set(patch).where(eq(schema.accounts.id, id)).run();
  if (patch.group === "own") await setSettings({ ownHandle: acc.handle });
  await bump("accounts");
  await bump("videos");
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  await deleteAccount(id);
  return Response.json({ ok: true });
}
