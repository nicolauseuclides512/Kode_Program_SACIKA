const path = require("node:path");
const { createScriptPool, backendRoot } = require("./lib/database");
const {
  acquireMigrationLock,
  applyMigration,
  ensureSchemaMigrations,
  listUpMigrations,
  readAppliedMigrations,
  releaseMigrationLock,
} = require("./lib/migrationUtils");

async function main() {
  const migrationsDir = path.join(backendRoot, "migrations");
  const migrations = listUpMigrations(migrationsDir);

  if (migrations.length === 0) {
    throw new Error("Tidak ada file migration .up.sql yang ditemukan.");
  }

  const pool = createScriptPool();
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await acquireMigrationLock(client);
    lockAcquired = true;
    await ensureSchemaMigrations(client);

    const appliedRows = await readAppliedMigrations(client);
    const appliedByName = new Map(
      appliedRows.map((row) => [row.migration_name, row]),
    );

    let appliedCount = 0;

    for (const migration of migrations) {
      const existing = appliedByName.get(migration.name);

      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(
            `Checksum migration berubah: ${migration.filename}. ` +
              "Jangan mengubah migration yang sudah diterapkan; buat migration baru.",
          );
        }

        console.log(`[SKIP] ${migration.filename}`);
        continue;
      }

      console.log(`[RUN ] ${migration.filename}`);
      await applyMigration(client, migration);
      appliedCount += 1;
      console.log(`[ OK ] ${migration.filename}`);
    }

    console.log(
      appliedCount === 0
        ? "Database sudah menggunakan migration terbaru."
        : `${appliedCount} migration berhasil diterapkan.`,
    );
  } finally {
    if (lockAcquired) {
      await releaseMigrationLock(client).catch((error) => {
        console.error("Gagal melepaskan migration lock:", error.message);
      });
    }

    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration gagal:", error.message);
  process.exitCode = 1;
});
