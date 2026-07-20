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
  agsts: 8,
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
  const fullYearMatch = normalized.match(/\b(20\d{2})\b/);
  const shortYearMatch = normalized.match(/\b(\d{2})\b/);
  const year = fullYearMatch
    ? Number(fullYearMatch[1])
    : shortYearMatch
      ? 2000 + Number(shortYearMatch[1])
      : null;

  if (!year) return null;

  const tokens = normalized.split(" ");
  const monthToken = tokens.find((token) => MONTH_ALIASES[token]);
  if (!monthToken) return null;

  return toPeriodDate(year, MONTH_ALIASES[monthToken]);
}

function normalizeHeader(value) {
  return normalizeProductName(value)
    .replace(/\brata\s*2\b/g, "rata rata")
    .replace(/\basset\b/g, "aset");
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

  let activeHeader = null;
  let activeCategory = null;
  const output = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const firstCellText = String(row[0] || "").trim();
    const normalizedFirstCell = normalizeProductName(firstCellText);
    if (normalizedFirstCell.startsWith("jenis ")) {
      activeCategory = firstCellText.replace(/^jenis\s*:\s*/i, "").trim() || null;
    }

    const header = findHeaderRow([row]);

    if (header) {
      activeHeader = header.columnIndexes;
      continue;
    }

    if (!activeHeader) continue;

    const sequenceIndex = Math.max(0, activeHeader.namaBarang - 1);
    const sequenceValue = row[sequenceIndex];
    const isProductRow = activeHeader.namaBarang === 0
      || typeof sequenceValue === "number"
      || /^\d+$/.test(String(sequenceValue || "").trim());
    if (!isProductRow) continue;

    const namaBarang = row[activeHeader.namaBarang];
    const namaBarangSumber = namaBarang === null || namaBarang === undefined
      ? ""
      : String(namaBarang).trim();

    if (!namaBarangSumber) continue;

    const stokAkhir = parseNumber(row[activeHeader.jml]);
    const hargaRataRata = parseNumber(row[activeHeader.hargaRataRata]);
    const nilaiAset = parseNumber(row[activeHeader.nilaiAset]);

    output.push({
      sheetName,
      rowNumber: index + 1,
      periode,
      nama_barang_sumber: namaBarangSumber,
      nama_normalisasi: normalizeProductName(namaBarangSumber),
      kategori_sumber: activeCategory,
      stok_akhir: stokAkhir,
      harga_rata_rata: hargaRataRata,
      nilai_aset: nilaiAset,
    });
  }

  if (!activeHeader) {
    throw new Error(`Kolom wajib tidak ditemukan pada sheet ${sheetName}`);
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

function normalizePeriodDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isProductActiveForPeriod(product, periode) {
  const period = normalizePeriodDate(periode);
  const activeFrom = normalizePeriodDate(product.active_from);
  const activeUntil = normalizePeriodDate(product.active_until);

  if (activeFrom && period < activeFrom) return false;
  if (activeUntil && period > activeUntil) return false;
  return true;
}

function classifyAbsentProductStatus(product, periode) {
  return isProductActiveForPeriod(product, periode)
    ? "not_listed"
    : "not_active";
}

function buildAliasMap(aliasRows) {
  const aliasMap = new Map();

  for (const row of aliasRows) {
    const key = normalizeProductName(row.nama_normalisasi);
    if (key) {
      aliasMap.set(key, {
        produk_id: Number(row.produk_id),
        nama_produk: row.nama_produk || null,
        is_active: row.is_active !== false,
        active_from: normalizePeriodDate(row.active_from),
        active_until: normalizePeriodDate(row.active_until),
      });
    }
  }

  return aliasMap;
}

function choosePreferredSnapshot(previous, candidate) {
  if (!previous) return candidate;
  if (previous.status_data === "missing" && candidate.status_data === "observed") {
    return candidate;
  }
  if (previous.status_data === "observed" && candidate.status_data === "missing") {
    return previous;
  }
  return candidate;
}

function buildImportPlan(parsedWorkbook, aliasRows, productRows) {
  const aliasMap = buildAliasMap(aliasRows);
  const unresolvedProducts = [];
  const duplicateObserved = [];
  const lifecycleConflicts = [];
  const snapshotsByPeriod = new Map();

  for (const row of parsedWorkbook.rows) {
    const alias = aliasMap.get(row.nama_normalisasi);
    if (!alias) {
      unresolvedProducts.push({
        sheet_name: row.sheetName,
        row_number: row.rowNumber,
        periode: row.periode,
        nama_barang_sumber: row.nama_barang_sumber,
        nama_normalisasi: row.nama_normalisasi,
        issue_type: "unresolved",
        reason: "alias_not_found",
      });
      continue;
    }

    const productPeriodMap = snapshotsByPeriod.get(row.periode) || new Map();
    const previous = productPeriodMap.get(alias.produk_id);

    if (previous) {
      duplicateObserved.push({
        sheet_name: row.sheetName,
        periode: row.periode,
        produk_id: alias.produk_id,
        first_row_number: previous.rowNumber,
        duplicate_row_number: row.rowNumber,
        nama_barang_sumber: row.nama_barang_sumber,
        nama_normalisasi: row.nama_normalisasi,
        issue_type: "collision",
        reason: "duplicate_product_in_same_period",
      });
    }

    const invalidStock = row.stok_akhir === null || row.stok_akhir < 0;
    const snapshot = {
      produk_id: alias.produk_id,
      periode: row.periode,
      stok_akhir: invalidStock ? null : row.stok_akhir,
      harga_rata_rata: row.harga_rata_rata,
      nilai_aset: row.nilai_aset,
      nama_barang_sumber: row.nama_barang_sumber,
      sumber_file: parsedWorkbook.sourceFile,
      status_data: invalidStock ? "missing" : "observed",
      rowNumber: row.rowNumber,
    };

    if (invalidStock) {
      unresolvedProducts.push({
        sheet_name: row.sheetName,
        row_number: row.rowNumber,
        periode: row.periode,
        produk_id: alias.produk_id,
        nama_barang_sumber: row.nama_barang_sumber,
        nama_normalisasi: row.nama_normalisasi,
        issue_type: "invalid_jml",
        reason: "invalid_jml",
      });
    }

    if (!isProductActiveForPeriod(alias, row.periode)) {
      lifecycleConflicts.push({
        sheet_name: row.sheetName,
        row_number: row.rowNumber,
        periode: row.periode,
        produk_id: alias.produk_id,
        nama_barang_sumber: row.nama_barang_sumber,
        nama_normalisasi: row.nama_normalisasi,
        issue_type: "lifecycle_conflict",
        reason: "source_row_outside_active_period",
        active_from: alias.active_from,
        active_until: alias.active_until,
      });
    }

    productPeriodMap.set(
      alias.produk_id,
      choosePreferredSnapshot(previous, snapshot),
    );
    snapshotsByPeriod.set(row.periode, productPeriodMap);
  }

  const observedSnapshots = [];
  const missingSnapshots = [];

  for (const periode of parsedWorkbook.periods) {
    const productPeriodMap = snapshotsByPeriod.get(periode) || new Map();

    for (const product of productRows) {
      const existingSnapshot = productPeriodMap.get(Number(product.id));
      if (existingSnapshot) {
        const { rowNumber, ...snapshot } = existingSnapshot;
        observedSnapshots.push(snapshot);
        continue;
      }

      missingSnapshots.push({
        produk_id: Number(product.id),
        periode,
        stok_akhir: null,
        harga_rata_rata: null,
        nilai_aset: null,
        nama_barang_sumber: null,
        sumber_file: parsedWorkbook.sourceFile,
        status_data: classifyAbsentProductStatus(product, periode),
      });
    }
  }

  const statusCounts = [...observedSnapshots, ...missingSnapshots].reduce(
    (counts, snapshot) => {
      counts[snapshot.status_data] = (counts[snapshot.status_data] || 0) + 1;
      return counts;
    },
    {},
  );
  const failedSourceRowKeys = new Set(
    unresolvedProducts.map((issue) => `${issue.sheet_name}|${issue.row_number}`),
  );
  const successfulRows = Math.max(0, parsedWorkbook.rows.length - failedSourceRowKeys.size);

  return {
    observedSnapshots,
    missingSnapshots,
    unresolvedProducts,
    duplicateObserved,
    lifecycleConflicts,
    summary: {
      file: parsedWorkbook.sourceFile,
      sheets: parsedWorkbook.sheetCount,
      periods: parsedWorkbook.periods.length,
      rows: parsedWorkbook.rows.length,
      matchedProducts: observedSnapshots.filter(
        (snapshot) => snapshot.status_data === "observed" || snapshot.status_data === "corrected",
      ).length,
      mappedSnapshots: observedSnapshots.length,
      successfulRows,
      failedRows: failedSourceRowKeys.size,
      unresolvedProducts: unresolvedProducts.length,
      missingSnapshots: missingSnapshots.length,
      duplicateObserved: duplicateObserved.length,
      lifecycleConflicts: lifecycleConflicts.length,
      statusCounts,
    },
  };
}

async function loadProductAliases(db) {
  const result = await db.query(
    `
      SELECT pa.produk_id,
             pa.nama_normalisasi,
             p.nama_produk,
             p.is_active,
             p.active_from,
             p.active_until
      FROM product_alias pa
      JOIN produk p ON p.id = pa.produk_id
    `,
  );

  return result.rows;
}

async function loadProducts(db) {
  const result = await db.query(
    `
      SELECT id, nama_produk, is_active, active_from, active_until
      FROM produk
      ORDER BY id
    `,
  );
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

async function insertMappingIssue(client, issue, sourceFile) {
  await client.query(
    `
      INSERT INTO product_mapping_issue (
        sumber_file,
        sheet_name,
        row_number,
        periode,
        nama_barang_sumber,
        nama_normalisasi,
        issue_type,
        detail
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT DO NOTHING
    `,
    [
      sourceFile,
      issue.sheet_name || null,
      issue.row_number || null,
      issue.periode || null,
      issue.nama_barang_sumber || null,
      issue.nama_normalisasi || null,
      issue.issue_type || "unresolved",
      JSON.stringify(issue),
    ],
  );
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
      plan.summary.successfulRows,
      plan.summary.failedRows,
      status,
      JSON.stringify({
        unresolved_products: plan.unresolvedProducts,
        duplicate_observed: plan.duplicateObserved,
        lifecycle_conflicts: plan.lifecycleConflicts,
        missing_snapshots: plan.summary.missingSnapshots,
        status_counts: plan.summary.statusCounts,
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

  if (options.dryRun) {
    return {
      dryRun: true,
      saved: false,
      unresolvedReportPath,
      ...plan.summary,
    };
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const batchId = await createImportBatch(client, parsedWorkbook, plan);

    for (const snapshot of plan.observedSnapshots) {
      await upsertSnapshot(client, snapshot);
    }

    for (const snapshot of plan.missingSnapshots) {
      await upsertSnapshot(client, snapshot);
    }

    for (const issue of plan.unresolvedProducts) {
      await insertMappingIssue(client, issue, parsedWorkbook.sourceFile);
    }

    for (const issue of plan.duplicateObserved) {
      await insertMappingIssue(client, issue, parsedWorkbook.sourceFile);
    }

    for (const issue of plan.lifecycleConflicts) {
      await insertMappingIssue(client, issue, parsedWorkbook.sourceFile);
    }

    const finalStatus = plan.unresolvedProducts.length > 0 ? "partial" : "success";
    await updateImportBatchStatus(client, batchId, finalStatus, {
      unresolved_products: plan.unresolvedProducts,
      duplicate_observed: plan.duplicateObserved,
      lifecycle_conflicts: plan.lifecycleConflicts,
      missing_snapshots: plan.summary.missingSnapshots,
      status_counts: plan.summary.statusCounts,
      unresolved_report_path: unresolvedReportPath,
    });
    await client.query("COMMIT");

    return {
      dryRun: false,
      saved: true,
      importBatchId: batchId,
      unresolvedReportPath,
      ...plan.summary,
    };
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
}

module.exports = {
  createExpectedPeriods,
  parseNumber,
  parseSheetPeriod,
  readMonthlyInventoryWorkbook,
  buildImportPlan,
  classifyAbsentProductStatus,
  importMonthlyInventory,
  isProductActiveForPeriod,
  toUnresolvedCsv,
  writeUnresolvedReport,
};
