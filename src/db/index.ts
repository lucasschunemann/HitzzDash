import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";
import { DATA_DIR, ensureDirs } from "@/lib/paths";

/**
 * Banco: Turso (SQLite na nuvem) quando DATABASE_URL está definida, senão o arquivo local
 * data/hitzz.db. O mesmo banco é usado pelo dashboard na Vercel e pelo seu Mac (worker).
 */
type DB = LibSQLDatabase<typeof schema> & { $client: Client };

const g = globalThis as unknown as { __hitzzDb?: DB; __hitzzMigrated?: Promise<void> };

export function databaseUrl() {
  // TURSO_* são os nomes criados pela integração do Turso no marketplace da Vercel
  return process.env.DATABASE_URL?.trim() || process.env.TURSO_DATABASE_URL?.trim() || `file:${path.join(DATA_DIR, "hitzz.db")}`;
}

export function isRemoteDb() {
  return !databaseUrl().startsWith("file:");
}

function open(): DB {
  if (!isRemoteDb()) ensureDirs();
  const client = createClient({ url: databaseUrl(), authToken: (process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN)?.trim() || undefined });
  return drizzle(client, { schema }) as DB;
}

export function getDb(): DB {
  if (!g.__hitzzDb) g.__hitzzDb = open();
  return g.__hitzzDb;
}

/** Aplica as migrações (idempotente). Roda no boot local e no CLI; na Vercel use npm run db:setup. */
export function migrateDb() {
  g.__hitzzMigrated ??= (async () => {
    const db = getDb();
    if (!isRemoteDb()) {
      await db.$client.execute("PRAGMA journal_mode = WAL");
      await db.$client.execute("PRAGMA busy_timeout = 5000");
    }
    await migrate(db, { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle") });
  })();
  return g.__hitzzMigrated;
}

export const db = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export { schema };
