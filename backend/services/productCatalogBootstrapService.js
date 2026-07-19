const fs = require("fs");
const path = require("path");

const { readMonthlyInventoryWorkbook } = require("./monthlyInventoryImporter");
const { normalizeProductName } = require("./productNameMapper");

const DEFAULT_CATEGORY_NAME = "Belum Dikategorikan";
const DEFAULT_STOCK_MINIMUM = 5;

function normalizeMapKey(value) {
  return normalizeProductName(value);
}

function toPeriodSortValue(periode) {
  return String(periode || "");
}

function formatNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function punctuationAwareSignature(value) {
  if (value === undefined || value === null) return "";

  return String(value)
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/(\d+(?:[.,]\d+)?)\s*(m\s*l|ml)\b/gi, "$1 ml")
    .replace(/(\d+(?:[.,]\d+)?)\s*(gr|gram|grams|g)\b/gi, "$1 g")
    .replace(/\s+/g, "")
    .trim();
}

function sortRowsChronologically(rows) {
  return [...rows].sort((a, b) => {
    const periodCompare = toPeriodSortValue(a.periode).localeCompare(toPeriodSortValue(b.periode));
    if (periodCompare !== 0) return periodCompare;
    return Number(a.rowNumber || 0) - Number(b.rowNumber || 0);
  });
}

function chooseDisplayName(rows) {
  const stats = new Map();

  for (const row of rows) {
    const name = String(row.nama_barang_sumber || "").trim();
    if (!name) continue;

    const current = stats.get(name) || {
      name,
      count: 0,
      latestPeriod: "",
      latestRowNumber: 0,
    };

    current.count += 1;
    if (
      toPeriodSortValue(row.periode) > current.latestPeriod
      || (
        toPeriodSortValue(row.periode) === current.latestPeriod
        && Number(row.rowNumber || 0) >= current.latestRowNumber
      )
    ) {
      current.latestPeriod = toPeriodSortValue(row.periode);
      current.latestRowNumber = Number(row.rowNumber || 0);
    }

    stats.set(name, current);
  }

  const ranked = [...stats.values()].sort((a, b) => {
    return b.count - a.count
      || b.latestPeriod.localeCompare(a.latestPeriod)
      || b.latestRowNumber - a.latestRowNumber
      || a.name.localeCompare(b.name);
  });

  return ranked[0]?.name || "";
}

function chooseLatestValidObservation(rows) {
  const ordered = sortRowsChronologically(rows);
  const latestStock = [...ordered].reverse().find((row) => {
    return row.stok_akhir !== null && Number.isFinite(Number(row.stok_akhir)) && Number(row.stok_akhir) >= 0;
  });
  const latestPrice = [...ordered].reverse().find((row) => {
    return row.harga_rata_rata !== null
      && Number.isFinite(Number(row.harga_rata_rata))
      && Number(row.harga_rata_rata) >= 0;
  });

  return {
    stok: formatNumber(latestStock?.stok_akhir, 0),
    harga: formatNumber(latestPrice?.harga_rata_rata, 0),
    latest_stock_period: latestStock?.periode || null,
    latest_price_period: latestPrice?.periode || null,
  };
}

function detectCollision(rows) {
  const signatures = new Map();

  for (const row of rows) {
    const signature = punctuationAwareSignature(row.nama_barang_sumber);
    if (!signature) continue;

    const names = signatures.get(signature) || new Set();
    names.add(row.nama_barang_sumber);
    signatures.set(signature, names);
  }

  if (signatures.size <= 1) return null;

  return {
    reason: "punctuation_or_spacing_could_merge_distinct_products",
    signature_count: signatures.size,
    signatures: [...signatures.entries()].map(([signature, names]) => ({
      signature,
      source_names: [...names].sort(),
    })),
  };
}

function groupWorkbookRows(rows) {
  const groups = new Map();
  const invalidRows = [];

  for (const row of rows) {
    const namaNormalisasi = normalizeProductName(row.nama_barang_sumber);

    if (!namaNormalisasi) {
      invalidRows.push({
        sheet_name: row.sheetName,
        row_number: row.rowNumber,
        periode: row.periode,
        nama_barang_sumber: row.nama_barang_sumber || null,
        reason: "missing_product_name",
      });
      continue;
    }

    if (row.stok_akhir === null || !Number.isFinite(Number(row.stok_akhir)) || Number(row.stok_akhir) < 0) {
      invalidRows.push({
        sheet_name: row.sheetName,
        row_number: row.rowNumber,
        periode: row.periode,
        nama_barang_sumber: row.nama_barang_sumber,
        nama_normalisasi: namaNormalisasi,
        reason: "invalid_stock",
      });
      continue;
    }

    if (row.harga_rata_rata !== null && (!Number.isFinite(Number(row.harga_rata_rata)) || Number(row.harga_rata_rata) < 0)) {
      invalidRows.push({
        sheet_name: row.sheetName,
        row_number: row.rowNumber,
        periode: row.periode,
        nama_barang_sumber: row.nama_barang_sumber,
        nama_normalisasi: namaNormalisasi,
        reason: "invalid_price",
      });
      continue;
    }

    const group = groups.get(namaNormalisasi) || [];
    group.push({ ...row, nama_normalisasi: namaNormalisasi });
    groups.set(namaNormalisasi, group);
  }

  return { groups, invalidRows };
}

function loadCategoryMap(categoryMapPath) {
  if (!categoryMapPath) return new Map();

  const raw = fs.readFileSync(categoryMapPath, "utf8");
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed)
    ? parsed.map((item) => [item.nama_normalisasi || item.nama_produk || item.product || item.name, item.kategori || item.category || item.nama_kategori])
    : Object.entries(parsed);

  const map = new Map();
  for (const [productName, categoryName] of entries) {
    const productKey = normalizeMapKey(productName);
    const categoryValue = String(categoryName || "").trim();
    if (productKey && categoryValue) {
      map.set(productKey, categoryValue);
    }
  }

  return map;
}

function buildCategoryLookup(categoryRows = []) {
  const map = new Map();
  for (const category of categoryRows) {
    map.set(normalizeMapKey(category.nama_kategori), category);
  }
  return map;
}

function buildExistingProductLookup(productRows = []) {
  const map = new Map();
  for (const product of productRows) {
    const key = normalizeProductName(product.nama_produk);
    if (key && !map.has(key)) map.set(key, product);
  }
  return map;
}

function buildExistingAliasLookup(aliasRows = []) {
  const map = new Map();
  for (const alias of aliasRows) {
    const key = normalizeProductName(alias.nama_normalisasi || alias.nama_alias);
    if (key && !map.has(key)) map.set(key, alias);
  }
  return map;
}

function buildProductCatalogPlan(parsedWorkbook, state, options = {}) {
  const categoryMap = options.categoryMap || new Map();
  const categoryLookup = buildCategoryLookup(state.categoryRows || []);
  const existingProducts = buildExistingProductLookup(state.productRows || []);
  const existingAliases = buildExistingAliasLookup(state.aliasRows || []);
  const defaultCategory = categoryLookup.get(normalizeMapKey(options.defaultCategoryName || DEFAULT_CATEGORY_NAME));
  const { groups, invalidRows } = groupWorkbookRows(parsedWorkbook.rows || []);

  const candidates = [];
  const productsToCreate = [];
  const existingProductRows = [];
  const aliasesToCreate = [];
  const collisionReview = [];
  const invalid = [...invalidRows];

  for (const [namaNormalisasi, rows] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sourceNames = [...new Set(rows.map((row) => row.nama_barang_sumber))].sort();
    const collision = detectCollision(rows);
    const observation = chooseLatestValidObservation(rows);
    const namaProduk = chooseDisplayName(rows);
    const requestedCategoryName = categoryMap.get(namaNormalisasi) || options.defaultCategoryName || DEFAULT_CATEGORY_NAME;
    const category = categoryLookup.get(normalizeMapKey(requestedCategoryName));

    const candidate = {
      nama_normalisasi: namaNormalisasi,
      nama_produk: namaProduk,
      source_names: sourceNames,
      observation_count: rows.length,
      harga: observation.harga,
      stok: observation.stok,
      stok_minimum: DEFAULT_STOCK_MINIMUM,
      kategori_nama: requestedCategoryName,
      kategori_id: category?.id || null,
      latest_stock_period: observation.latest_stock_period,
      latest_price_period: observation.latest_price_period,
    };

    candidates.push(candidate);

    if (collision) {
      collisionReview.push({
        ...candidate,
        collision,
      });
      continue;
    }

    if (!category) {
      invalid.push({
        nama_normalisasi: namaNormalisasi,
        nama_barang_sumber: namaProduk,
        reason: "category_not_found",
        kategori_nama: requestedCategoryName,
      });
      continue;
    }

    const existingProduct = existingProducts.get(namaNormalisasi);
    const existingAlias = existingAliases.get(namaNormalisasi);

    if (existingProduct) {
      existingProductRows.push({
        ...candidate,
        produk_id: existingProduct.id,
        existing_source: "produk",
      });
    } else if (existingAlias) {
      existingProductRows.push({
        ...candidate,
        produk_id: existingAlias.produk_id,
        existing_source: "product_alias",
      });
    } else {
      productsToCreate.push(candidate);
    }

    if (!existingAlias) {
      aliasesToCreate.push({
        nama_normalisasi: namaNormalisasi,
        nama_alias: namaProduk,
        source_names: sourceNames,
        produk_id: existingProduct?.id || existingAlias?.produk_id || null,
      });
    }
  }

  return {
    candidates,
    products_to_create: productsToCreate,
    existing_products: existingProductRows,
    aliases_to_create: aliasesToCreate,
    collision_review: collisionReview,
    invalid_rows: invalid,
    summary: {
      file: parsedWorkbook.sourceFile,
      sheets: parsedWorkbook.sheetCount,
      rows: parsedWorkbook.rows.length,
      unique_normalized_products: candidates.length,
      products_to_create: productsToCreate.length,
      existing_products: existingProductRows.length,
      aliases_to_create: aliasesToCreate.length,
      collisions: collisionReview.length,
      invalid_rows: invalid.length,
    },
  };
}

async function loadBootstrapState(db) {
  const [categoryResult, productResult, aliasResult] = await Promise.all([
    db.query("SELECT id, nama_kategori FROM kategori ORDER BY id"),
    db.query("SELECT id, nama_produk FROM produk ORDER BY id"),
    db.query("SELECT id, produk_id, nama_alias, nama_normalisasi FROM product_alias ORDER BY id"),
  ]);

  return {
    categoryRows: categoryResult.rows,
    productRows: productResult.rows,
    aliasRows: aliasResult.rows,
  };
}

async function insertProduct(client, candidate) {
  const result = await client.query(
    `
      INSERT INTO produk (nama_produk, kategori_id, harga, stok, stok_minimum)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (LOWER(BTRIM(nama_produk)))
      DO UPDATE SET
        nama_produk = produk.nama_produk
      RETURNING id, nama_produk
    `,
    [
      candidate.nama_produk,
      candidate.kategori_id,
      candidate.harga,
      candidate.stok,
      candidate.stok_minimum,
    ],
  );

  return result.rows[0];
}

async function insertAlias(client, alias) {
  const result = await client.query(
    `
      INSERT INTO product_alias (produk_id, nama_alias, nama_normalisasi)
      VALUES ($1, $2, $3)
      ON CONFLICT (nama_normalisasi)
      DO NOTHING
      RETURNING id, produk_id, nama_alias, nama_normalisasi
    `,
    [alias.produk_id, alias.nama_alias, alias.nama_normalisasi],
  );

  return result.rows[0] || null;
}

async function commitProductCatalogPlan(db, plan) {
  const client = await db.connect();
  const createdProducts = [];
  const createdAliases = [];
  const productIdsByNormalizedName = new Map(
    plan.existing_products.map((product) => [product.nama_normalisasi, product.produk_id]),
  );

  try {
    await client.query("BEGIN");

    for (const candidate of plan.products_to_create) {
      const product = await insertProduct(client, candidate);
      productIdsByNormalizedName.set(candidate.nama_normalisasi, product.id);
      createdProducts.push({
        produk_id: product.id,
        nama_normalisasi: candidate.nama_normalisasi,
        nama_produk: product.nama_produk || candidate.nama_produk,
      });
    }

    for (const alias of plan.aliases_to_create) {
      const produkId = alias.produk_id || productIdsByNormalizedName.get(alias.nama_normalisasi);
      if (!produkId) continue;

      const createdAlias = await insertAlias(client, { ...alias, produk_id: produkId });
      if (createdAlias) createdAliases.push(createdAlias);
    }

    await client.query("COMMIT");

    return { createdProducts, createdAliases };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function toCsv(rows) {
  if (!rows.length) return "\n";

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(headers.map((header) => {
      const value = row[header] === undefined || row[header] === null ? "" : String(row[header]);
      return `"${value.replace(/"/g, '""')}"`;
    }).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function writeBootstrapReport(report, outputPath, format = "json") {
  if (!outputPath) return null;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (format === "csv") {
    const rows = [
      ...report.candidates.map((row) => ({ section: "candidate", ...row })),
      ...report.products_to_create.map((row) => ({ section: "product_to_create", ...row })),
      ...report.existing_products.map((row) => ({ section: "existing_product", ...row })),
      ...report.aliases_to_create.map((row) => ({ section: "alias_to_create", ...row })),
      ...report.collision_review.map((row) => ({ section: "collision_review", ...row })),
      ...report.invalid_rows.map((row) => ({ section: "invalid_row", ...row })),
    ];
    fs.writeFileSync(outputPath, toCsv(rows));
  } else {
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  }

  return outputPath;
}

async function bootstrapProductsFromWorkbook(db, filePath, options = {}) {
  const parsedWorkbook = readMonthlyInventoryWorkbook(filePath, options);
  const categoryMap = options.categoryMap || loadCategoryMap(options.categoryMapPath);
  const state = options.state || await loadBootstrapState(db);
  const plan = buildProductCatalogPlan(parsedWorkbook, state, {
    categoryMap,
    defaultCategoryName: options.defaultCategoryName || DEFAULT_CATEGORY_NAME,
  });

  const commit = options.commit === true;
  let commitResult = { createdProducts: [], createdAliases: [] };

  if (commit) {
    commitResult = await commitProductCatalogPlan(db, plan);
  }

  const report = {
    mode: commit ? "commit" : "dry-run",
    saved: commit,
    ...plan,
    created_products: commitResult.createdProducts,
    created_aliases: commitResult.createdAliases,
  };

  const reportPath = writeBootstrapReport(
    report,
    options.reportOutputPath,
    options.reportFormat || "json",
  );

  return {
    ...report,
    report_path: reportPath,
  };
}

module.exports = {
  DEFAULT_CATEGORY_NAME,
  DEFAULT_STOCK_MINIMUM,
  buildProductCatalogPlan,
  bootstrapProductsFromWorkbook,
  chooseDisplayName,
  chooseLatestValidObservation,
  commitProductCatalogPlan,
  detectCollision,
  groupWorkbookRows,
  loadCategoryMap,
  loadBootstrapState,
  punctuationAwareSignature,
  writeBootstrapReport,
};
