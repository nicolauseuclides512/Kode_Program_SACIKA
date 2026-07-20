const {
  DEFAULT_MIGRATIONS_DIR,
  readMigrationFiles,
  sanitizeMessage,
} = require("../scripts/migrationRunner");
const {
  getQualitySummary,
} = require("./inventoryHistoryQualityService");

const REQUIRED_TABLES = [
  "pengguna",
  "kategori",
  "produk",
  "transaksi",
  "dataset_mingguan",
  "inventory_snapshot_monthly",
  "product_alias",
  "forecast_result",
  "import_batch",
  "penjualan_bulanan",
];

const REQUIRED_COLUMNS = {
  pengguna: [
    "id",
    "nama",
    "username",
    "password_hash",
    "is_active",
    "created_at",
    "updated_at",
  ],
  kategori: [
    "id",
    "nama_kategori",
    "created_at",
    "updated_at",
  ],
  produk: [
    "id",
    "kode_produk",
    "nama_produk",
    "kategori_id",
    "harga",
    "stok",
    "stok_minimum",
    "created_at",
    "updated_at",
  ],
  transaksi: [
    "id",
    "produk_id",
    "jenis_transaksi",
    "jumlah",
    "harga",
    "total",
    "tanggal",
    "created_at",
    "updated_at",
  ],
  dataset_mingguan: [
    "id",
    "produk_id",
    "tahun",
    "bulan",
    "minggu_ke",
    "period_label",
    "total_penjualan",
    "created_at",
    "updated_at",
  ],
  inventory_snapshot_monthly: [
    "id",
    "produk_id",
    "periode",
    "stok_akhir",
    "harga_rata_rata",
    "nilai_aset",
    "nama_barang_sumber",
    "sumber_file",
    "status_data",
    "created_at",
    "updated_at",
  ],
  product_alias: [
    "id",
    "produk_id",
    "nama_alias",
    "nama_normalisasi",
  ],
  forecast_result: [
    "id",
    "produk_id",
    "target",
    "model_used",
    "data_cutoff",
    "forecast_period",
    "forecast_value",
    "mae",
    "rmse",
    "wape",
    "observation_count",
    "warning",
    "created_at",
  ],
  import_batch: [
    "id",
    "nama_file",
    "jumlah_baris",
    "jumlah_berhasil",
    "jumlah_gagal",
    "status",
    "detail_error",
    "imported_at",
  ],
  penjualan_bulanan: [
    "id",
    "produk_id",
    "periode",
    "total_penjualan",
  ],
};

const REQUIRED_FOREIGN_KEYS = [
  {
    table: "produk",
    column: "kategori_id",
    foreignTable: "kategori",
    foreignColumn: "id",
  },
  {
    table: "transaksi",
    column: "produk_id",
    foreignTable: "produk",
    foreignColumn: "id",
  },
  {
    table: "dataset_mingguan",
    column: "produk_id",
    foreignTable: "produk",
    foreignColumn: "id",
  },
  {
    table: "inventory_snapshot_monthly",
    column: "produk_id",
    foreignTable: "produk",
    foreignColumn: "id",
  },
  {
    table: "product_alias",
    column: "produk_id",
    foreignTable: "produk",
    foreignColumn: "id",
  },
  {
    table: "forecast_result",
    column: "produk_id",
    foreignTable: "produk",
    foreignColumn: "id",
  },
  {
    table: "penjualan_bulanan",
    column: "produk_id",
    foreignTable: "produk",
    foreignColumn: "id",
  },
];

const REQUIRED_UNIQUE_INDEXES = [
  "uq_pengguna_username_normalized",
  "uq_kategori_nama_normalized",
  "uq_produk_nama_normalized",
  "uq_produk_kode_normalized",
  "uq_dataset_mingguan_produk_period_label",
  "uq_inventory_snapshot_monthly_produk_periode",
  "uq_product_alias_nama_normalisasi",
  "uq_forecast_result_produk_cutoff_period_model",
  "uq_penjualan_bulanan_produk_periode",
];

const INTEGRITY_COUNT_CHECKS = [
  {
    code: "integrity.products_without_category",
    passMessage: "Tidak ada produk tanpa kategori",
    failMessage: "Ditemukan produk tanpa kategori",
    sql: `
      SELECT COUNT(*)::int AS count
      FROM produk p
      LEFT JOIN kategori k ON k.id = p.kategori_id
      WHERE p.kategori_id IS NULL OR k.id IS NULL
    `,
  },
  {
    code: "integrity.transactions_without_product",
    passMessage: "Tidak ada transaksi tanpa produk",
    failMessage: "Ditemukan transaksi tanpa produk",
    sql: `
      SELECT COUNT(*)::int AS count
      FROM transaksi t
      LEFT JOIN produk p ON p.id = t.produk_id
      WHERE t.produk_id IS NULL OR p.id IS NULL
    `,
  },
  {
    code: "integrity.aliases_without_product",
    passMessage: "Tidak ada alias tanpa produk",
    failMessage: "Ditemukan alias tanpa produk",
    sql: `
      SELECT COUNT(*)::int AS count
      FROM product_alias a
      LEFT JOIN produk p ON p.id = a.produk_id
      WHERE a.produk_id IS NULL OR p.id IS NULL
    `,
  },
  {
    code: "integrity.snapshots_without_product",
    passMessage: "Tidak ada snapshot tanpa produk",
    failMessage: "Ditemukan snapshot tanpa produk",
    sql: `
      SELECT COUNT(*)::int AS count
      FROM inventory_snapshot_monthly s
      LEFT JOIN produk p ON p.id = s.produk_id
      WHERE s.produk_id IS NULL OR p.id IS NULL
    `,
  },
  {
    code: "integrity.forecasts_without_product",
    passMessage: "Tidak ada hasil forecast tanpa produk",
    failMessage: "Ditemukan hasil forecast tanpa produk",
    sql: `
      SELECT COUNT(*)::int AS count
      FROM forecast_result f
      LEFT JOIN produk p ON p.id = f.produk_id
      WHERE f.produk_id IS NULL OR p.id IS NULL
    `,
  },
  {
    code: "integrity.monthly_sales_without_product",
    passMessage: "Tidak ada penjualan bulanan tanpa produk",
    failMessage: "Ditemukan penjualan bulanan tanpa produk",
    sql: `
      SELECT COUNT(*)::int AS count
      FROM penjualan_bulanan pb
      LEFT JOIN produk p ON p.id = pb.produk_id
      WHERE pb.produk_id IS NULL OR p.id IS NULL
    `,
  },
  {
    code: "integrity.negative_product_stock",
    passMessage: "Tidak ada stok produk negatif",
    failMessage: "Ditemukan stok produk negatif",
    sql: `
      SELECT COUNT(*)::int AS count
      FROM produk
      WHERE stok < 0
    `,
  },
  {
    code: "integrity.invalid_transaction_quantity",
    passMessage: "Tidak ada transaksi dengan jumlah nol atau negatif",
    failMessage: "Ditemukan transaksi dengan jumlah nol atau negatif",
    sql: `
      SELECT COUNT(*)::int AS count
      FROM transaksi
      WHERE jumlah <= 0
    `,
  },
  {
    code: "integrity.observed_snapshot_null_stock",
    passMessage: "Tidak ada snapshot observed dengan stok null",
    failMessage: "Ditemukan snapshot observed dengan stok null",
    sql: `
      SELECT COUNT(*)::int AS count
      FROM inventory_snapshot_monthly
      WHERE status_data = 'observed'
        AND stok_akhir IS NULL
    `,
  },
  {
    code: "integrity.missing_snapshot_with_stock",
    passMessage: "Tidak ada snapshot missing dengan stok non-null",
    failMessage: "Ditemukan snapshot missing dengan stok non-null",
    sql: `
      SELECT COUNT(*)::int AS count
      FROM inventory_snapshot_monthly
      WHERE status_data = 'missing'
        AND stok_akhir IS NOT NULL
    `,
  },
];

function createCheck(status, code, message, details = {}) {
  return {
    status,
    code,
    message,
    details,
  };
}

function pass(code, message, details = {}) {
  return createCheck("PASS", code, message, details);
}

function warning(code, message, details = {}) {
  return createCheck("WARNING", code, message, details);
}

function fail(code, message, details = {}) {
  return createCheck("FAIL", code, message, details);
}

function toCount(row, key = "count") {
  return Number(row?.[key] || 0);
}

function buildDatabaseHealthReport(checks) {
  const summary = {
    pass: checks.filter((check) => check.status === "PASS").length,
    warning: checks.filter((check) => check.status === "WARNING").length,
    fail: checks.filter((check) => check.status === "FAIL").length,
  };

  return {
    ok: summary.fail === 0,
    exit_code: summary.fail === 0 ? 0 : 1,
    summary,
    checks,
  };
}

async function runSafeCheck(checks, fallbackCode, callback) {
  try {
    const result = await callback();
    if (Array.isArray(result)) {
      checks.push(...result);
    } else if (result) {
      checks.push(result);
    }
  } catch (error) {
    checks.push(fail(
      fallbackCode,
      sanitizeMessage(error.message),
    ));
  }
}

async function checkConnection(client) {
  await client.query("SELECT 1 AS ok");
  return pass("connection", "Koneksi PostgreSQL berhasil");
}

async function checkPostgresVersion(client) {
  const result = await client.query("SHOW server_version");
  const version = result.rows[0]?.server_version;

  if (!version) {
    return fail("postgres.version", "Versi PostgreSQL tidak dapat dibaca");
  }

  return pass("postgres.version", "Versi PostgreSQL dapat dibaca", { version });
}

async function checkMigrations(client, options = {}) {
  const migrationsDir = options.migrationsDir || DEFAULT_MIGRATIONS_DIR;
  const schemaResult = await client.query(
    "SELECT to_regclass($1) AS table_name",
    ["public.schema_migrations"],
  );

  if (!schemaResult.rows[0]?.table_name) {
    return fail("migrations.applied", "Tabel schema_migrations belum tersedia");
  }

  const localMigrations = readMigrationFiles(migrationsDir, "up");
  const appliedResult = await client.query(`
    SELECT migration_name, checksum
    FROM schema_migrations
    ORDER BY migration_name ASC
  `);
  const appliedByName = new Map(
    appliedResult.rows.map((row) => [row.migration_name, row]),
  );
  const localNames = new Set(localMigrations.map((migration) => migration.migrationName));

  const pending = [];
  const checksumChanged = [];
  const missingLocalFile = [];

  for (const migration of localMigrations) {
    const applied = appliedByName.get(migration.migrationName);

    if (!applied) {
      pending.push(migration.migrationName);
    } else if (applied.checksum !== migration.checksum) {
      checksumChanged.push(migration.migrationName);
    }
  }

  for (const applied of appliedResult.rows) {
    if (!localNames.has(applied.migration_name)) {
      missingLocalFile.push(applied.migration_name);
    }
  }

  if (pending.length > 0 || checksumChanged.length > 0) {
    return fail("migrations.applied", "Ada migration yang belum valid/diterapkan", {
      pending,
      checksum_changed: checksumChanged,
      applied_count: appliedResult.rows.length,
      local_count: localMigrations.length,
    });
  }

  if (missingLocalFile.length > 0) {
    return warning("migrations.applied", "Ada catatan migration tanpa file lokal", {
      missing_local_file: missingLocalFile,
      applied_count: appliedResult.rows.length,
      local_count: localMigrations.length,
    });
  }

  return pass("migrations.applied", "Seluruh migration lokal sudah diterapkan", {
    applied_count: appliedResult.rows.length,
    local_count: localMigrations.length,
  });
}

async function checkRequiredTables(client) {
  const result = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
    `,
    ["public", REQUIRED_TABLES],
  );
  const available = new Set(result.rows.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((tableName) => !available.has(tableName));

  if (missing.length > 0) {
    return fail("schema.tables", "Ada tabel wajib yang belum tersedia", { missing });
  }

  return pass("schema.tables", "Seluruh tabel wajib tersedia", {
    tables: REQUIRED_TABLES.length,
  });
}

async function checkRequiredColumns(client) {
  const result = await client.query(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
    `,
    ["public", REQUIRED_TABLES],
  );
  const columnsByTable = new Map();

  for (const row of result.rows) {
    const columns = columnsByTable.get(row.table_name) || new Set();
    columns.add(row.column_name);
    columnsByTable.set(row.table_name, columns);
  }

  const missing = [];
  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const availableColumns = columnsByTable.get(tableName) || new Set();

    for (const columnName of requiredColumns) {
      if (!availableColumns.has(columnName)) {
        missing.push(`${tableName}.${columnName}`);
      }
    }
  }

  if (missing.length > 0) {
    return fail("schema.columns", "Ada kolom wajib yang belum tersedia", { missing });
  }

  return pass("schema.columns", "Seluruh kolom wajib tersedia", {
    table_count: Object.keys(REQUIRED_COLUMNS).length,
  });
}

async function checkForeignKeys(client) {
  const result = await client.query(
    `
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.table_schema = $1
        AND tc.constraint_type = 'FOREIGN KEY'
    `,
    ["public"],
  );
  const available = new Set(result.rows.map((row) => {
    return [
      row.table_name,
      row.column_name,
      row.foreign_table_name,
      row.foreign_column_name,
    ].join(".");
  }));
  const missing = REQUIRED_FOREIGN_KEYS
    .filter((key) => !available.has([
      key.table,
      key.column,
      key.foreignTable,
      key.foreignColumn,
    ].join(".")))
    .map((key) => `${key.table}.${key.column}->${key.foreignTable}.${key.foreignColumn}`);

  if (missing.length > 0) {
    return fail("schema.foreign_keys", "Ada foreign key wajib yang belum tersedia", { missing });
  }

  return pass("schema.foreign_keys", "Seluruh foreign key wajib tersedia", {
    foreign_keys: REQUIRED_FOREIGN_KEYS.length,
  });
}

async function checkUniqueConstraints(client) {
  const result = await client.query(
    `
      SELECT tablename AS table_name, indexname AS index_name
      FROM pg_indexes
      WHERE schemaname = $1
        AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
    `,
    ["public"],
  );
  const available = new Set(result.rows.map((row) => row.index_name));
  const missing = REQUIRED_UNIQUE_INDEXES.filter((indexName) => !available.has(indexName));

  if (missing.length > 0) {
    return fail("schema.unique_constraints", "Ada unique constraint/index wajib yang belum tersedia", {
      missing,
    });
  }

  return pass("schema.unique_constraints", "Seluruh unique constraint/index wajib tersedia", {
    unique_constraints: REQUIRED_UNIQUE_INDEXES.length,
  });
}

async function runIntegrityCountCheck(client, definition) {
  const result = await client.query(definition.sql);
  const count = toCount(result.rows[0]);

  if (count > 0) {
    return fail(definition.code, definition.failMessage, { count });
  }

  return pass(definition.code, definition.passMessage, { count });
}

async function checkSnapshotRange(client) {
  const result = await client.query(`
    SELECT
      MIN(periode)::text AS min_period,
      MAX(periode)::text AS max_period,
      COUNT(*)::int AS snapshot_count,
      COUNT(*) FILTER (
        WHERE status_data IN ('observed', 'corrected')
          AND stok_akhir IS NOT NULL
      )::int AS valid_snapshot_count
    FROM inventory_snapshot_monthly
  `);
  const row = result.rows[0] || {};
  const snapshotCount = toCount(row, "snapshot_count");

  if (snapshotCount === 0) {
    return warning("snapshot.range", "Belum ada histori snapshot bulanan", {
      snapshot_count: 0,
      valid_snapshot_count: 0,
    });
  }

  return pass("snapshot.range", "Rentang histori snapshot dapat dibaca", {
    min_period: row.min_period,
    max_period: row.max_period,
    snapshot_count: snapshotCount,
    valid_snapshot_count: toCount(row, "valid_snapshot_count"),
  });
}

async function checkQualityStatusSummary(client) {
  const summary = await getQualitySummary(client);

  if (summary.total_products === 0) {
    return warning("inventory_quality.summary", "Belum ada produk untuk ringkasan kualitas", {
      total_products: 0,
      status_counts: summary.status_counts,
    });
  }

  return pass("inventory_quality.summary", "Jumlah produk berdasarkan status kualitas dapat ditampilkan", {
    total_products: summary.total_products,
    status_counts: summary.status_counts,
  });
}

async function checkAdministrator(client, env = process.env) {
  const adminUsername = String(env.ADMIN_USERNAME || "").trim();

  if (adminUsername) {
    const result = await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM pengguna
        WHERE LOWER(BTRIM(username)) = LOWER(BTRIM($1))
          AND is_active = TRUE
      `,
      [adminUsername],
    );
    const count = toCount(result.rows[0]);

    if (count === 0) {
      return fail("auth.admin_user", "Pengguna administrator aktif tidak ditemukan");
    }

    return pass("auth.admin_user", "Pengguna administrator aktif tersedia");
  }

  const result = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM pengguna
    WHERE is_active = TRUE
  `);
  const count = toCount(result.rows[0]);

  if (count === 0) {
    return fail("auth.admin_user", "Belum ada pengguna aktif untuk login administrator");
  }

  return warning("auth.admin_user", "ADMIN_USERNAME tidak diset; hanya memverifikasi pengguna aktif", {
    active_user_count: count,
  });
}

async function checkPasswordHashes(client) {
  const result = await client.query(`
    SELECT
      COUNT(*)::int AS total_users,
      COUNT(*) FILTER (
        WHERE password_hash !~ '^\\$2[aby]\\$[0-9]{2}\\$'
          OR LENGTH(password_hash) < 50
          OR password_hash = username
      )::int AS suspicious_count
    FROM pengguna
  `);
  const row = result.rows[0] || {};
  const totalUsers = toCount(row, "total_users");
  const suspiciousCount = toCount(row, "suspicious_count");

  if (totalUsers === 0) {
    return warning("auth.password_hashes", "Belum ada pengguna untuk pemeriksaan password hash");
  }

  if (suspiciousCount > 0) {
    return fail("auth.password_hashes", "Ada password pengguna yang tidak tampak sebagai hash bcrypt", {
      suspicious_count: suspiciousCount,
      total_users: totalUsers,
    });
  }

  return pass("auth.password_hashes", "Password pengguna tidak tampak sebagai plaintext", {
    total_users: totalUsers,
  });
}

async function runDatabaseHealthCheck(pool, options = {}) {
  const checks = [];
  let client;

  try {
    client = await pool.connect();
  } catch (error) {
    return buildDatabaseHealthReport([
      fail("connection", `Koneksi PostgreSQL gagal: ${sanitizeMessage(error.message)}`),
    ]);
  }

  try {
    await runSafeCheck(checks, "connection", () => checkConnection(client));
    await runSafeCheck(checks, "postgres.version", () => checkPostgresVersion(client));
    await runSafeCheck(checks, "migrations.applied", () => checkMigrations(client, options));
    await runSafeCheck(checks, "schema.tables", () => checkRequiredTables(client));
    await runSafeCheck(checks, "schema.columns", () => checkRequiredColumns(client));
    await runSafeCheck(checks, "schema.foreign_keys", () => checkForeignKeys(client));
    await runSafeCheck(checks, "schema.unique_constraints", () => checkUniqueConstraints(client));

    for (const definition of INTEGRITY_COUNT_CHECKS) {
      await runSafeCheck(checks, definition.code, () => runIntegrityCountCheck(client, definition));
    }

    await runSafeCheck(checks, "snapshot.range", () => checkSnapshotRange(client));
    await runSafeCheck(checks, "inventory_quality.summary", () => checkQualityStatusSummary(client));
    await runSafeCheck(checks, "auth.admin_user", () => checkAdministrator(client, options.env || process.env));
    await runSafeCheck(checks, "auth.password_hashes", () => checkPasswordHashes(client));
  } finally {
    client.release();
  }

  return buildDatabaseHealthReport(checks);
}

function formatHealthCheckLine(check) {
  const details = Object.keys(check.details || {}).length > 0
    ? ` ${JSON.stringify(check.details)}`
    : "";

  return `[${check.status}] ${check.code}: ${check.message}${details}`;
}

module.exports = {
  REQUIRED_COLUMNS,
  REQUIRED_FOREIGN_KEYS,
  REQUIRED_TABLES,
  REQUIRED_UNIQUE_INDEXES,
  buildDatabaseHealthReport,
  checkAdministrator,
  checkMigrations,
  formatHealthCheckLine,
  runDatabaseHealthCheck,
};
