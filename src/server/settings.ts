import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const SETTING_DEFAULTS = {
  ownHandle: "usehitzz",
  reelsPerAccount: 30,
  baselineN: 30,
  scheduleEnabled: true,
  /** Intervalo entre coletas automáticas (horas). */
  scheduleIntervalHours: 24,
  /** Hora local preferida para a coleta diária (0-23). */
  scheduleHour: 7,
  includeSharesCount: false,
  keepVideoDays: 1,
  lastScheduledRunAt: 0,
  /** Última vez que um worker (Mac) processou a fila. */
  workerLastSeenAt: 0,
};
export type Settings = typeof SETTING_DEFAULTS;

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(schema.settings).all();
  const s: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.key in SETTING_DEFAULTS) s[r.key] = r.value;
  return s as Settings;
}

export async function setSettings(patch: Partial<Settings>) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in SETTING_DEFAULTS) || value === undefined) continue;
    await db.insert(schema.settings)
      .values({ key, value: value as never })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: value as never } })
      .run();
  }
}

export async function deleteSetting(key: string) {
  await db.delete(schema.settings).where(eq(schema.settings.key, key)).run();
}
