import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings, setSettings, SETTING_DEFAULTS, type Settings } from "@/server/settings";
import { normalizeHandle } from "@/server/collect";
import { bump } from "@/server/events";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getSettings());
}

const clampInt = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined);

export async function PATCH(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Partial<Settings>;
  const patch: Partial<Settings> = {
    reelsPerAccount: clampInt(b.reelsPerAccount, 5, 200),
    baselineN: clampInt(b.baselineN, 5, 100),
    scheduleIntervalHours: clampInt(b.scheduleIntervalHours, 1, 168),
    scheduleHour: clampInt(b.scheduleHour, 0, 23),
    keepVideoDays: clampInt(b.keepVideoDays, 0, 90),
    scheduleEnabled: typeof b.scheduleEnabled === "boolean" ? b.scheduleEnabled : undefined,
    includeSharesCount: typeof b.includeSharesCount === "boolean" ? b.includeSharesCount : undefined,
  };
  if (typeof b.ownHandle === "string") {
    const h = normalizeHandle(b.ownHandle);
    if (!h) return Response.json({ error: "Handle inválido" }, { status: 400 });
    patch.ownHandle = h;
    // a conta própria passa a ser este handle: cria se não existir; a anterior vira referência
    const cur = await db.select().from(schema.accounts).where(eq(schema.accounts.group, "own")).all();
    const existing = await db.select().from(schema.accounts).where(eq(schema.accounts.handle, h)).get();
    for (const c of cur) if (c.handle !== h) await db.update(schema.accounts).set({ group: "reference" }).where(eq(schema.accounts.id, c.id)).run();
    if (existing) await db.update(schema.accounts).set({ group: "own" }).where(eq(schema.accounts.id, existing.id)).run();
    else await db.insert(schema.accounts).values({ handle: h, group: "own", createdAt: Date.now(), active: true }).run();
    await bump("accounts");
  }
  await setSettings(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<Settings>);
  await bump("accounts");
  void SETTING_DEFAULTS;
  return Response.json({ ok: true, settings: await getSettings() });
}
