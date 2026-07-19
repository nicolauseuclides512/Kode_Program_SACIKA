const bcrypt = require("bcryptjs");

const {
  createPoolFromEnv,
  loadBackendEnv,
  sanitizeMessage,
} = require("./migrationRunner");

const INITIAL_CATEGORIES = [
  "Minuman",
  "Snack",
  "ATK",
  "Dapur/Lain-lain/ART",
  "Belum Dikategorikan",
];

const BCRYPT_ROUNDS = 10;

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function readAdminConfig(env = process.env) {
  const password = env.ADMIN_PASSWORD;

  if (!password) {
    return {
      shouldSeed: false,
      reason: "ADMIN_PASSWORD tidak tersedia; seed administrator dilewati.",
    };
  }

  const username = normalizeUsername(env.ADMIN_USERNAME);
  const name = String(env.ADMIN_NAME || "").trim();

  if (!username) {
    throw new Error("ADMIN_USERNAME wajib diisi saat ADMIN_PASSWORD tersedia");
  }

  if (!name) {
    throw new Error("ADMIN_NAME wajib diisi saat ADMIN_PASSWORD tersedia");
  }

  return {
    shouldSeed: true,
    name,
    username,
    password,
  };
}

async function seedCategories(client, categories = INITIAL_CATEGORIES) {
  const seeded = [];

  for (const categoryName of categories) {
    const normalizedName = String(categoryName || "").trim();
    if (!normalizedName) continue;

    const result = await client.query(
      `
        INSERT INTO kategori (nama_kategori)
        VALUES ($1)
        ON CONFLICT (LOWER(BTRIM(nama_kategori)))
        DO UPDATE SET
          nama_kategori = EXCLUDED.nama_kategori,
          updated_at = NOW()
        RETURNING id, nama_kategori
      `,
      [normalizedName],
    );

    seeded.push(result.rows[0]);
  }

  return seeded;
}

async function seedAdministrator(client, adminConfig, bcryptLib = bcrypt) {
  if (!adminConfig.shouldSeed) {
    return {
      skipped: true,
      reason: adminConfig.reason,
    };
  }

  const existingResult = await client.query(
    `
      SELECT id, password_hash
      FROM pengguna
      WHERE LOWER(BTRIM(username)) = LOWER(BTRIM($1))
      LIMIT 1
    `,
    [adminConfig.username],
  );

  const existing = existingResult.rows[0] || null;
  let passwordHash = existing?.password_hash || null;

  if (!passwordHash || !(await bcryptLib.compare(adminConfig.password, passwordHash))) {
    passwordHash = await bcryptLib.hash(adminConfig.password, BCRYPT_ROUNDS);
  }

  if (existing) {
    const result = await client.query(
      `
        UPDATE pengguna
        SET nama=$1,
            username=$2,
            password_hash=$3,
            is_active=TRUE,
            updated_at=NOW()
        WHERE id=$4
        RETURNING id, nama, username, is_active
      `,
      [adminConfig.name, adminConfig.username, passwordHash, existing.id],
    );

    return {
      skipped: false,
      action: "updated",
      user: result.rows[0],
    };
  }

  const result = await client.query(
    `
      INSERT INTO pengguna (nama, username, password_hash, is_active)
      VALUES ($1, $2, $3, TRUE)
      RETURNING id, nama, username, is_active
    `,
    [adminConfig.name, adminConfig.username, passwordHash],
  );

  return {
    skipped: false,
    action: "created",
    user: result.rows[0],
  };
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Rollback seed gagal:", sanitizeMessage(rollbackError.message));
  }
}

async function runSeed({ pool, env = process.env, logger = console } = {}) {
  if (!pool) throw new Error("Pool database wajib diberikan");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const categories = await seedCategories(client);
    const admin = await seedAdministrator(client, readAdminConfig(env));

    await client.query("COMMIT");

    return {
      categories_count: categories.length,
      admin,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  loadBackendEnv();
  const pool = createPoolFromEnv();

  try {
    const result = await runSeed({ pool });
    console.log(`Seed kategori selesai: ${result.categories_count} kategori dipastikan tersedia.`);

    if (result.admin.skipped) {
      console.log(result.admin.reason);
    } else {
      console.log(`Seed administrator selesai: ${result.admin.action}.`);
    }
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

module.exports = {
  BCRYPT_ROUNDS,
  INITIAL_CATEGORIES,
  normalizeUsername,
  readAdminConfig,
  runSeed,
  seedAdministrator,
  seedCategories,
};
