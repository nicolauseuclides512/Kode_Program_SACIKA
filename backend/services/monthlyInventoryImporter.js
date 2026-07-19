const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const { normalizeProductName } = require("./productNameMapper");

const MONTH_ALIASES = {
  januari: 1,
  jan: 1,
  februari: 2,
  pebruari: 2,
  feb: 2,
  maret: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mei: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  agustus: 8,
  agst: 8,
  agu: 8,
  september: 9,
  sept: 9,
  sep: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  desember: 12,
  des: 12,
};

const REQUIRED_COLUMNS = {
  namaBarang: "nama barang",
  jml: "jml",
  hargaRataRata: "harga rata rata",
  nilaiAset: "nilai aset",
};

function toPeriodDate(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function createExpectedPeriods(startYear = 2024, endYear = 2025) {
  const periods = [];

  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      periods.push(toPeriodDate(year, month));
    }
  }

  return periods;
}

function parseSheetPeriod(sheetName) {
  const normalized = normalizeProductName(sheetName);
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  if (!yearMatch) return null;

  const tokens = normalized.split(" ");
  const monthToken = tokens.find((token) => MONTH_ALIASES[token]);
  if (!monthToken) return null;

  return toPeriodDate(Number(yearMatch[1]), MONTH_ALIASES[monthToken]);
}

function normalizeHeader(value) {
  return normalizeProductName(value).replace(/\brata rata\b/g, "rata rata");
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let text = String(value).trim();
  if (!text) return null;

  text = text.replace(/[^\d,.-]/g, "");
  if (!text || text === "-" || text === "," || text === ".") return null;

  if (text.includes(",") && text.includes(".")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function findHeaderRow(rows) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const headers = rows[rowIndex].map(normalizeHeader);
    const columnIndexes = {};

    for (const [key, requiredHeader] of Object.entries(REQUIRED_COLUMNS)) {
      const index = headers.findIndex((header) => header === requiredHeader);
      if (index >= 0) columnIndexes[key] = index;
    }

    if (Object.keys(columnIndexes).length === Object.keys(REQUIRED_COLUMNS).length) {
      return { rowIndex, columnIndexes };
    }
  }

  return null;
}

function readRowsFromSheet(sheet, periode, sheetName) {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  const header = findHeaderRow(rows);
  if (!header) {
    throw new Error(`Kolom wajib tidak ditemukan pada sheet ${sheetName}`);
  }

  const output = [];

  for (let index = header.rowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const namaBarang = row[header.columnIndexes.namaBarang];
    const namaBarangSumber = namaBarang === null || namaBarang === undefined
      ? ""
      : String(namaBarang).trim();

    if (!namaBarangSumber) continue;

    const stokAkhir = parseNumber(row[header.columnIndexes.jml]);
    const hargaRataRata = parseNumber(row[header.columnIndexes.hargaRataRata]);
    const nilaiAset = parseNumber(row[header.columnIndexes.nilaiAset]);

    output.push({
      sheetName,
      rowNumber: index + 1,
      periode,
      nama_barang_sumber: namaBarangSumber,
      nama_normalisasi: normalizeProductName(namaBarangSumber),
      stok_akhir: stokAkhir,
      harga_rata_rata: hargaRataRata,
      nilai_aset: nilaiAset,
    });
  }

  return output;
}

function readMonthlyInventoryWorkbook(filePath, options = {}) {
  if (!filePath) {
    throw new Error("Path file wajib diisi melalui argumen --file atau environment variable");
  }

  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const expectedPeriods = options.expectedPeriods || createExpectedPeriods();
  const expectedPeriodSet = new Set(expectedPeriods);
  const sheetByPeriod = new Map();

  for (const sheetName of workbook.SheetNames) {
    const periode = parseSheetPeriod(sheetName);
    if (periode && expectedPeriodSet.has(periode)) {
      sheetByPeriod.set(periode, sheetName);
    }
  }

  const missingSheets = expectedPeriods.filter((periode) => !sheetByPeriod.has(periode));
  if (missingSheets.length > 0) {
    throw new Error(`Sheet periode belum lengkap: ${missingSheets.join(", ")}`);
  }

  const rows = [];
  for (const periode of expectedPeriods) {
    const sheetName = sheetByPeriod.get(periode);
    rows.push(
      ...readRowsFromSheet(workbook.Sheets[sheetName], periode, sheetName),
    );
  }

  return {
    filePath,
    sourceFile: path.basename(filePath),
    periods: expectedPeriods,
    sheetCount: expectedPeriods.length,
    rows,
  };
}

function buildAliasMap(aliasRows) {
  const aliasMap = new Map();

  for (const row of aliasRows) {
    const key = normalizeProductName(row.nama_normalisasi);
    if (key) {
      aliasMap.set(key, {
        produk_id: row.produk_id,
        nama_produk: row.nama_produk || null,
      });
    }
  }

  return aliasMap;
}

function buildImportPlan(parsedWorkbook, aliasRows, productRows) {
  const aliasMap = buildAliasMap(aliasRows);
  const observedSnapshots = [];
  const unresolvedProducts = [];
  const seenByPeriod = new Map();
  const duplicateObserved = [];

  for (const row of parsedWorkbook.rows) {
    if (row.stok_akhir === null || row.stok_akhir < 0) {
      unresolvedProducts.push({
        sheet_name: row.sheetName,
        row_number: row.rowNumber,
        periode: row.periode,
        nama_barang_sumber: row.nama_barang_sumber,
        nama_normalisasi: row.nama_normalisasi,
        reason: "invalid_jml",
      });
      continue;
    }

    const alias = aliasMap.get(row.nama_normalisasi);
    if (!alias) {
      unresolvedProducts.push({
        sheet_name: row.sheetName,
        row_number: row.rowNumber,
        periode: row.periode,
        nama_barang_sumber: row.nama_barang_sumber,
        nama_normalisasi: row.nama_normalisasi,
        reason: "alias_not_found",
      });
      continue;
    }

    const periodMap = seenByPeriod.get(row.periode) || new Map();
    const previous = periodMap.get(alias.produk_id);
    if (previous) {
      duplicateObserved.push({
        periode: row.periode,
        produk_id: alias.produk_id,
        first_row_number: previous.rowNumber,
        duplicate_row_number: row.rowNumber,
        nama_barang_sumber: row.nama_barang_sumber,
      });
    }
    periodMap.set(alias.produk_id, row);
    seenByPeriod.set(row.periode, periodMap);

    observedSnapshots.push({
      produk_id: alias.produk_id,
      periode: row.periode,
      stok_akhir: row.stok_akhir,
      harga_rata_rata: row.harga_rata_rata,
      nilai_aset: row.nilai_aset,
      nama_barang_sumber: row.nama_barang_sumber,
      sumber_file: parsedWorkbook.sourceFile,
      status_data: "observed",
    });
  }

  const missingSnapshots = [];
  for (const periode of parsedWorkbook.periods) {
    const observedProductIds = seenByPeriod.get(periode) || new Map();

    for (const product of productRows) {
      if (!observedProductIds.has(product.id)) {
        missingSnapshots.push({
          produk_id: product.id,
          periode,
          stok_akhir: null,
          harga_rata_rata: null,
          nilai_aset: null,
          nama_barang_sumber: null,
          sumber_file: parsedWorkbook.sourceFile,
          status_data: "missing",
        });
      }
    }
  }

  return {
    observedSnapshots,
    missingSnapshots,
    unresolvedProducts,
    duplicateObserved,
    summary: {
      file: parsedWorkbook.sourceFile,
      sheets: parsedWorkbook.sheetCount,
      periods: parsedWorkbook.periods.length,
      rows: parsedWorkbook.rows.length,
      matchedProducts: observedSnapshots.length,
      unresolvedProducts: unresolvedProducts.length,
      missingSnapshots: missingSnapshots.length,
      duplicateObserved: duplicateObserved.length,
    },
  };
}

async function loadProductAliases(db) {
  const result = await db.query(
    `
      SELECT pa.produk_id, pa.nama_normalisasi, p.nama_produk
      FROM product_alias pa
      JOIN produk p ON p.id = pa.produk_id
    `,
  );

  return result.rows;
}

async function loadProducts(db) {
  const result = await db.query("SELECT id, nama_produk FROM produk ORDER BY id");
  return result.rows;
}

async function upsertSnapshot(client, snapshot) {
  await client.query(
    `
      INSERT INTO inventory_snapshot_monthly (
        produk_id,
        periode,
        stok_akhir,
        harga_rata_rata,
        nilai_aset,
        nama_barang_sumber,
        sumber_file,
        status_data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (produk_id, periode)
      DO UPDATE SET
        stok_akhir = EXCLUDED.stok_akhir,
        harga_rata_rata = EXCLUDED.harga_rata_rata,
        nilai_aset = EXCLUDED.nilai_aset,
        nama_barang_sumber = EXCLUDED.nama_barang_sumber,
        sumber_file = EXCLUDED.sumber_file,
        status_data = EXCLUDED.status_data,
        updated_at = NOW()
    `,
    [
      snapshot.produk_id,
      snapshot.periode,
      snapshot.stok_akhir,
      snapshot.harga_rata_rata,
      snapshot.nilai_aset,
      snapshot.nama_barang_sumber,
      snapshot.sumber_file,
      snapshot.status_data,
    ],
  );
}

function toUnresolvedCsv(unresolvedProducts) {
  const headers = [
    "sheet_name",
    "row_number",
    "periode",
    "nama_barang_sumber",
    "nama_normalisasi",
    "reason",
  ];

  const lines = [headers.join(",")];
  for (const row of unresolvedProducts) {
    lines.push(
      headers
        .map((header) => {
          const value = row[header] === undefined || row[header] === null
            ? ""
            : String(row[header]);
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

function writeUnresolvedReport(unresolvedProducts, outputPath, format = "json") {
  if (!outputPath) return null;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (format === "csv") {
    fs.writeFileSync(outputPath, toUnresolvedCsv(unresolvedProducts));
  } else {
    fs.writeFileSync(outputPath, JSON.stringify(unresolvedProducts, null, 2));
  }

  return outputPath;
}

async function createImportBatch(client, parsedWorkbook, plan) {
  const status = plan.unresolvedProducts.length > 0 ? "partial" : "processing";
  const result = await client.query(
    `
      INSERT INTO import_batch (
        nama_file,
        jumlah_baris,
        jumlah_berhasil,
        jumlah_gagal,
        status,
        detail_error
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
    [
      parsedWorkbook.sourceFile,
      plan.summary.rows,
      plan.summary.matchedProducts,
      plan.summary.unresolvedProducts,
      status,
      JSON.stringify({
        unresolved_products: plan.unresolvedProducts,
        duplicate_observed: plan.duplicateObserved,
        missing_snapshots: plan.summary.missingSnapshots,
      }),
    ],
  );

  return result.rows[0].id;
}

async function updateImportBatchStatus(client, batchId, status, detail) {
  await client.query(
    `
      UPDATE import_batch
      SET status = $1,
          detail_error = $2
      WHERE id = $3
    `,
    [status, JSON.stringify(detail), batchId],
  );
}

function formatPeriodValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = String(value);
  return text.includes("T") ? text.slice(0, 10) : text.slice(0, 10);
}

function toInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function classifyImportQualityRow(row, expectedPeriodCount) {
  const observationCount = toInteger(row.observation_count);
  const zeroCount = toInteger(row.zero_count);
  const missingCount = Math.max(expectedPeriodCount - observationCount, 0);
  const zeroRatio = observationCount > 0 ? zeroCount / observationCount : 0;

  if (observationCount < 18) return "not_eligible";
  if (missingCount > 0 || zeroRatio >= 0.5) return "warning";
  return "eligible";
}

async function getInventoryImportValidationSummary(db, options = {}) {
  const expectedPeriods = options.expectedPeriods || createExpectedPeriods();
  const expectedPeriodCount = expectedPeriods.length;

  const productCountResult = await db.query("SELECT COUNT(*)::int AS jumlah FROM produk");
  const aliasCountResult = await db.query("SELECT COUNT(*)::int AS jumlah FROM product_alias");
  const snapshotCountResult = await db.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status_data = 'observed')::int AS observed_count,
        COUNT(*) FILTER (WHERE status_data = 'missing')::int AS missing_count
      FROM inventory_snapshot_monthly
    `,
  );
  const periodRangeResult = await db.query(
    `
      SELECT MIN(periode)::date AS periode_min,
             MAX(periode)::date AS periode_max
      FROM inventory_snapshot_monthly
    `,
  );
  const qualityRowsResult = await db.query(
    `
      SELECT
        p.id,
        COUNT(DISTINCT CASE
          WHEN ism.status_data IN ('observed', 'corrected')
            AND ism.stok_akhir IS NOT NULL
          THEN ism.periode
        END)::int AS observation_count,
        COUNT(DISTINCT CASE
          WHEN ism.status_data IN ('observed', 'corrected')
            AND ism.stok_akhir = 0
          THEN ism.periode
        END)::int AS zero_count
      FROM produk p
      LEFT JOIN inventory_snapshot_monthly ism
        ON ism.produk_id = p.id
      GROUP BY p.id
      ORDER BY p.id
    `,
  );

  const statusCounts = {
    eligible: 0,
    warning: 0,
    not_eligible: 0,
  };

  for (const row of qualityRowsResult.rows) {
    statusCounts[classifyImportQualityRow(row, expectedPeriodCount)] += 1;
  }

  const snapshotCounts = snapshotCountResult.rows[0] || {};
  const periodRange = periodRangeResult.rows[0] || {};

  return {
    product_count: toInteger(productCountResult.rows[0]?.jumlah),
    alias_count: toInteger(aliasCountResult.rows[0]?.jumlah),
    observed_snapshot_count: toInteger(snapshotCounts.observed_count),
    missing_snapshot_count: toInteger(snapshotCounts.missing_count),
    unresolved_count: toInteger(options.unresolvedCount),
    periode_min: formatPeriodValue(periodRange.periode_min),
    periode_max: formatPeriodValue(periodRange.periode_max),
    eligible_count: statusCounts.eligible,
    warning_count: statusCounts.warning,
    not_eligible_count: statusCounts.not_eligible,
  };
}
async function importMonthlyInventory(db, filePath, options = {}) {
  const parsedWorkbook = readMonthlyInventoryWorkbook(filePath, options);
  const aliasRows = await loadProductAliases(db);
  const productRows = await loadProducts(db);
  const plan = buildImportPlan(parsedWorkbook, aliasRows, productRows);
  const unresolvedReportPath = writeUnresolvedReport(
    plan.unresolvedProducts,
    options.unresolvedOutputPath,
    options.unresolvedFormat || "json",
  );
  const details = {
    unresolved_products: plan.unresolvedProducts,
    duplicate_observed: plan.duplicateObserved,
  };

  if (options.dryRun) {
    return {
      dryRun: true,
      saved: false,
      unresolvedReportPath,
      ...plan.summary,
      periodsVerified: parsedWorkbook.periods.length,
      details,
    };
  }

  const client = await db.connect();
  let batchId = null;

  try {
    await client.query("BEGIN");
    batchId = await createImportBatch(client, parsedWorkbook, plan);

    for (const snapshot of plan.observedSnapshots) {
      await upsertSnapshot(client, snapshot);
    }

    for (const snapshot of plan.missingSnapshots) {
      await upsertSnapshot(client, snapshot);
    }

    const finalStatus = plan.unresolvedProducts.length > 0 ? "partial" : "success";
    await updateImportBatchStatus(client, batchId, finalStatus, {
      unresolved_products: plan.unresolvedProducts,
      duplicate_observed: plan.duplicateObserved,
      missing_snapshots: plan.summary.missingSnapshots,
      unresolved_report_path: unresolvedReportPath,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    await db.query(
      `
        INSERT INTO import_batch (
          nama_file,
          jumlah_baris,
          jumlah_berhasil,
          jumlah_gagal,
          status,
          detail_error
        )
        VALUES ($1, $2, 0, $3, 'failed', $4)
      `,
      [
        parsedWorkbook.sourceFile,
        plan.summary.rows,
        plan.summary.rows,
        JSON.stringify({ error: error.message }),
      ],
    );

    throw error;
  } finally {
    client.release();
  }

  const postImportValidation = await getInventoryImportValidationSummary(db, {
    expectedPeriods: parsedWorkbook.periods,
    unresolvedCount: plan.summary.unresolvedProducts,
  });

  return {
    dryRun: false,
    saved: true,
    importBatchId: batchId,
    unresolvedReportPath,
    ...plan.summary,
    periodsVerified: parsedWorkbook.periods.length,
    details,
    postImportValidation,
  };
}
module.exports = {
  createExpectedPeriods,
  parseNumber,
  parseSheetPeriod,
  readMonthlyInventoryWorkbook,
  buildImportPlan,
  getInventoryImportValidationSummary,
  importMonthlyInventory,
  toUnresolvedCsv,
  writeUnresolvedReport,
};

