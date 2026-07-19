const {
  createPoolFromEnv,
  loadBackendEnv,
  rollbackLastMigration,
  sanitizeMessage,
} = require("./migrationRunner");

async function main() {
  loadBackendEnv();
  const pool = createPoolFromEnv();

  try {
    const result = await rollbackLastMigration({ pool });

    if (!result.rolledBack) {
      console.log("Tidak ada migration yang dapat di-rollback.");
      return;
    }

    console.log(`Rollback selesai: ${result.rolledBack}`);
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
