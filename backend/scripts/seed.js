const bcrypt = require("bcryptjs");
const { createScriptPool } = require("./lib/database");

const INITIAL_CATEGORIES = [
  "Minuman",
  "Snack",
  "ATK",
  "Dapur/Lain-lain/ART",
  "Belum Dikategorikan",
];

function readRequiredAdminConfig() {
  const config = {
    name: process.env.ADMIN_NAME?.trim(),
    username: process.env.ADMIN_USERNAME?.trim(),
    password: process.env.ADMIN_PASSWORD,
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Konfigurasi administrator belum lengkap: ${missing.join(", ")}. ` +
        "Isi ADMIN_NAME, ADMIN_USERNAME, dan ADMIN_PASSWORD pada backend/.env.",
    );
  }

  if (config.password.length < 10) {
    throw new Error("ADMIN_PASSWORD minimal 10 karakter.");
  }

  return config;
}

async function assertCoreSchemaExists(client) {
  const result = await client.query(`
    SELECT
      TO_REGCLASS('public.pengguna') AS pengguna,
      TO_REGCLASS('public.kategori') AS kategori
  `);

  if (!result.rows[0].pengguna || !result.rows[0].kategori) {
    throw new Error(
      "Tabel inti belum tersedia. Jalankan npm run db:migrate terlebih dahulu.",
    );
  }
}

async function seedCategories(client) {
  for (const categoryName of INITIAL_CATEGORIES) {
    await client.query(
      `
        INSERT INTO kategori (nama_kategori)
        SELECT $1
        WHERE NOT EXISTS (
          SELECT 1
          FROM kategori
          WHERE LOWER(BTRIM(nama_kategori)) = LOWER(BTRIM($1))
        )
      `,
      [categoryName],
    );
  }
}

async function seedAdministrator(client, config) {
  const existingResult = await client.query(
    `
      SELECT id, password_hash
      FROM pengguna
      WHERE LOWER(BTRIM(username)) = LOWER(BTRIM($1))
      FOR UPDATE
    `,
    [config.username],
  );

  let passwordHash;

  if (existingResult.rows.length > 0) {
    const existing = existingResult.rows[0];
    const passwordMatches = await bcrypt.compare(
      config.password,
      existing.password_hash,
    );

    passwordHash = passwordMatches
      ? existing.password_hash
      : await bcrypt.hash(config.password, 12);

    await client.query(
      `
        UPDATE pengguna
        SET
          nama = $1,
          username = $2,
          password_hash = $3,
          role = 'admin',
          is_active = TRUE
        WHERE id = $4
      `,
      [config.name, config.username, passwordHash, existing.id],
    );

    return { action: "updated", id: existing.id };
  }

  passwordHash = await bcrypt.hash(config.password, 12);

  const insertResult = await client.query(
    `
      INSERT INTO pengguna
        (nama, username, password_hash, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE)
      RETURNING id
    `,
    [config.name, config.username, passwordHash],
  );

  return { action: "created", id: insertResult.rows[0].id };
}

async function main() {
  const adminConfig = readRequiredAdminConfig();
  const pool = createScriptPool();
  const client = await pool.connect();

  try {
    await assertCoreSchemaExists(client);
    await client.query("BEGIN");

    await seedCategories(client);
    const adminResult = await seedAdministrator(client, adminConfig);

    await client.query("COMMIT");

    console.log(`${INITIAL_CATEGORIES.length} kategori awal tersedia.`);
    console.log(
      `Administrator berhasil ${
        adminResult.action === "created" ? "dibuat" : "diperbarui"
      } (ID ${adminResult.id}).`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Seed database gagal:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  INITIAL_CATEGORIES,
  readRequiredAdminConfig,
  seedAdministrator,
  seedCategories,
};
