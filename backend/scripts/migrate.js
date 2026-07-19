const {
  createPoolFromEnv,
  loadBackendEnv,
  runPendingMigrations,
  sanitizeMessage,
} = require("./migrationRunner");

async function main() {
  loadBackendEnv();
  const pool = createPoolFromEnv();

  try {
    const result = await runPendingMigrations({ pool });

    if (result.applied.length === 0) {
      console.log("Tidak ada migration baru.");
      return;
    }

    console.log(`Migration selesai: ${result.applied.length} diterapkan, ${result.skipped} dilewati.`);
  } catch (error) {
    console.error(sanitizeMessage(error.message));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
