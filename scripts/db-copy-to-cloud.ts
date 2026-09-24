/**
 * Copia o banco local (data/hitzz.db) para o banco na nuvem (DATABASE_URL/TURSO_DATABASE_URL).
 * Não apaga nada no destino: linhas que já existem (mesma chave) são mantidas.
 * Depois rode `npm run cc -- work` para gravar as capas e os frames comprimidos no banco.
 *   npm run db:copy-to-cloud
 */
import { loadEnvConfig } from "@next/env";

// Mesmas variáveis que o Next usa (.env, .env.local)
loadEnvConfig(process.cwd());
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { BatchItem } from "drizzle-orm/batch";
import { getTableColumns } from "drizzle-orm";

async function main() {
  const schema = await import("../src/db/schema");
  const { DATA_DIR } = await import("../src/lib/paths");
  const { migrateDb, db: remote, isRemoteDb } = await import("../src/db");
  if (!isRemoteDb()) throw new Error("Defina DATABASE_URL (ou TURSO_DATABASE_URL) no .env apontando para o Turso.");
  await migrateDb();
  const local = drizzle(createClient({ url: `file:${path.join(DATA_DIR, "hitzz.db")}` }), { schema });
  const tables = [
    ["accounts", schema.accounts],
    ["account_snapshots", schema.accountSnapshots],
    ["videos", schema.videos],
    ["video_snapshots", schema.videoSnapshots],
    ["processing", schema.processing],
    ["transcripts", schema.transcripts],
    ["frames", schema.frames],
    ["analyses", schema.analyses],
    ["scripts", schema.scripts],
    ["script_requests", schema.scriptRequests],
    ["digests", schema.digests],
    ["notifications", schema.notifications],
    ["settings", schema.settings],
  ] as const;
  for (const [name, table] of tables) {
    const rows = (await local.select().from(table).all()) as Record<string, unknown>[];
    void getTableColumns;
    let n = 0;
    for (let i = 0; i < rows.length; i += 40) {
      const chunk = rows.slice(i, i + 40);
      const ops = chunk.map((r) => remote.insert(table).values(r as never).onConflictDoNothing()) as unknown as BatchItem<"sqlite">[];
      if (ops.length) await remote.batch(ops as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
      n += chunk.length;
    }
    console.log(`✓ ${name}: ${n} linha(s)`);
  }
  console.log("Pronto. Agora rode: npm run cc -- work (grava as imagens no banco)");
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error("ERRO:", (e as Error).message);
    process.exit(1);
  },
);
