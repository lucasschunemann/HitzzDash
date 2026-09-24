import { db, schema } from "@/db";
import { bump } from "@/server/events";

export async function POST() {
  await db.update(schema.notifications).set({ read: true }).run();
  await bump("notifications");
  return Response.json({ ok: true });
}
