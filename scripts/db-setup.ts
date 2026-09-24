/**
 * Prepara o banco (local ou Turso, conforme DATABASE_URL): aplica as migrações e, se estiver vazio,
 * carrega os dados de demonstração. Rode uma vez antes do primeiro deploy e após mudar o schema.
 *   npm run db:setup
 */
import { loadEnvConfig } from "@next/env";

// Mesmas variáveis que o Next usa (.env, .env.local)
loadEnvConfig(process.cwd());
async function main() {
  const { migrateDb, databaseUrl, isRemoteDb } = await import("../src/db");
  console.log(`Banco: ${isRemoteDb() ? databaseUrl().replace(/\/\/([^.]+)/, "//***") : databaseUrl()}`);
  await migrateDb();
  console.log("✓ migrações aplicadas");
  const { seedIfEmpty } = await import("../src/server/seed");
  const seeded = await seedIfEmpty();
  console.log(seeded ? "✓ banco vazio: dados de demonstração carregados" : "✓ banco já tinha dados (demo não recarregada)");
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error("ERRO:", (e as Error).message);
    process.exit(1);
  },
);
