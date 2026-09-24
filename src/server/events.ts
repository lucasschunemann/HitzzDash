import { desc } from "drizzle-orm";
import { db, schema } from "@/db";

export type Topic = "videos" | "accounts" | "jobs" | "scripts" | "notifications" | "patterns";

/** Registra uma mudança; o SSE (/api/events) avisa os navegadores abertos. */
export async function bump(topic: Topic) {
  await db.insert(schema.changeLog).values({ topic, createdAt: Date.now() }).run();
}

export async function latestChange() {
  const row = await db.select().from(schema.changeLog).orderBy(desc(schema.changeLog.id)).limit(1).get();
  return row ?? null;
}

export async function notify(n: { kind: string; title: string; body?: string; videoId?: string }) {
  await db.insert(schema.notifications).values({ ...n, createdAt: Date.now() }).run();
  await bump("notifications");
}
