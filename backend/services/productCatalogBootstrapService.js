const fs = require("fs");
const path = require("path");

const {
  readMonthlyInventoryWorkbook,
} = require("./monthlyInventoryImporter");
const { normalizeProductName } = require("./productNameMapper");

const DEFAULT_CATEGORY_NAME = "Belum Dikategorikan";
const SOURCE_CATEGORY_MAP = {
  minuman: "Minuman",
  snack: "Snack",
  makanan: "Snack",
  atk: "ATK",
  dapur: "Dapur/Lain-lain/ART",
  "lain lain": "Dapur/Lain-lain/ART",
  art: "Dapur/Lain-lain/ART",
};

function toNumberOrDefault(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function periodToDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function chooseCanonicalVariant(rows) {
  const stats = new Map();

  for (const row of rows) {
    const variant = String(row.nama_barang_sumber || "").trim();
    if (!variant) continue;

    const current = stats.get(variant) || {
      value: variant,
      count: 0,
      lastPeriod: "",
      lastRowNumber: 0,
    };
    current.count += 1;

    if (
      row.periode > current.lastPeriod
      || (row.periode === current.lastPeriod && row.rowNumber > current.lastRowNumber)
    ) {
      current.lastPeriod = row.periode;
      current.lastRowNumber = row.rowNumber;
    }

    stats.set(variant, current);
  }

  return [...stats.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.lastPeriod !== a.lastPeriod) {
        return b.lastPeriod.localeCompare(a.lastPeriod);
      }
      return b.lastRowNumber - a.lastRowNumber;
    })[0]?.value || "";
}

function pickLatestValidRow(rows) {
  return [...rows]
    .filter((row) => {
      if (row.stok_akhir === null || row.stok_akhir === undefined || row.stok_akhir === "") {
        return false;
      }
      return Number.isFinite(Number(row.stok_akhir)) && Number(row.stok_akhir) >= 0;
    })
    .sort((a, b) => {
      if (a.periode !== b.periode) return b.periode.localeCompare(a.periode);
      return b.rowNumber - a.rowNumber;
    })[0] || null;
}

function buildNormalizedProductMap(products = []) {
  const map = new Map();

  for (const product of products) {
    const key = normalizeProductName(product.nama_produk);
    if (!key) continue;
    const items = map.get(key) || [];
    items.push(product);
    map.set(key, items);
  }

  return map;
}

function buildAliasProductMap(aliases = []) {
  const map = new Map();

  for (const alias of aliases) {
    const key = normalizeProductName(alias.nama_normalisasi || alias.nama_alias);
    if (!key) continue;
    const items = map.get(key) || [];
    items.push(alias);
    map.set(key, items);
  }

  return map;
}

function mapSourceCategory(value) {
  const normalized = normalizeProductName(value);
  if (!normalized) return null;

  if (SOURCE_CATEGORY_MAP[normalized]) return SOURCE_CATEGORY_MAP[normalized];

  const matchingKey = Object.keys(SOURCE_CATEGORY_MAP).find(
    (key) => normalized.includes(key),
  );
  return matchingKey ? SOURCE_CATEGORY_MAP[matchingKey] : null;
}

function resolveCategoryName(
  categoryMap,
  normalizedName,
  canonicalName,
  sourceCategories = [],
) {
  const configured = categoryMap && typeof categoryMap === "object"
    ? categoryMap[normalizedName]
      || categoryMap[canonicalName]
      || categoryMap[canonicalName.toLowerCase()]
    : null;

  if (configured) return configured;

  const mappedSourceCategories = [...new Set(
    sourceCategories.map(mapSourceCategory).filter(Boolean),
  )];

  return mappedSourceCategories.length === 1
    ? mappedSourceCategories[0]
    : DEFAULT_CATEGORY_NAME;
}

function buildProductCatalogPlan(parsedWorkbook, context = {}, options = {}) {
  const existingProducts = context.existingProducts || [];
  const existingAliases = context.existingAliases || [];
  const categoryMap = options.categoryMap || {};
  const productMap = buildNormalizedProductMap(existingProducts);
  const aliasMap = buildAliasProductMap(existingAliases);
  const groupedRows = new Map();
  const invalidRows = [];

  for (const row of parsedWorkbook.rows) {
    const normalizedName = normalizeProductName(row.nama_normalisasi || row.nama_barang_sumber);

    if (!normalizedName) {
      invalidRows.push({
        sheet_name: row.sheetName,
        row_number: row.rowNumber,
        periode: row.periode,
        nama_barang_sumber: row.nama_barang_sumber || null,
        nama_normalisasi: null,
        issue_type: "invalid_name",
        reason: "normalized_name_empty",
      });
      continue;
    }

    const rows = groupedRows.get(normalizedName) || [];
    rows.push({ ...row, nama_normalisasi: normalizedName });
    groupedRows.set(normalizedName, rows);
  }

  const candidates = [];
  const existing = [];
  const aliasesToCreate = [];
  const collisions = [];

  for (const [normalizedName, rows] of groupedRows.entries()) {
    const canonicalName = chooseCanonicalVariant(rows);
    const sourceVariants = [...new Set(rows.map((row) => row.nama_barang_sumber).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const periods = [...new Set(rows.map((row) => row.periode))].sort();
    const sourceCategories = [...new Set(
      rows.map((row) => row.kategori_sumber).filter(Boolean),
    )].sort((a, b) => a.localeCompare(b));
    const mappedSourceCategories = [...new Set(
      sourceCategories.map(mapSourceCategory).filter(Boolean),
    )];
    const latestValidRow = pickLatestValidRow(rows);
    const duplicatePeriods = [];
    const rowsByPeriod = new Map();

    for (const row of rows) {
      const periodRows = rowsByPeriod.get(row.periode) || [];
      periodRows.push(row);
      rowsByPeriod.set(row.periode, periodRows);
    }

    for (const [period, periodRows] of rowsByPeriod.entries()) {
      if (periodRows.length > 1) {
        duplicatePeriods.push({
          periode: period,
          row_numbers: periodRows.map((row) => row.rowNumber),
          source_names: [...new Set(periodRows.map((row) => row.nama_barang_sumber))],
          stock_values: [...new Set(periodRows.map((row) => row.stok_akhir))],
          price_values: [...new Set(periodRows.map((row) => row.harga_rata_rata))],
        });
      }
    }

    const matchedProducts = productMap.get(normalizedName) || [];
    const matchedAliases = aliasMap.get(normalizedName) || [];
    const aliasProductIds = [...new Set(matchedAliases.map((row) => Number(row.produk_id)))];
    const directProductIds = [...new Set(matchedProducts.map((row) => Number(row.id)))];
    const combinedProductIds = [...new Set([...aliasProductIds, ...directProductIds])];

    const collisionReasons = [];
    if (duplicatePeriods.length > 0) collisionReasons.push("duplicate_product_in_same_period");
    if (directProductIds.length > 1) collisionReasons.push("multiple_existing_products_same_normalized_name");
    if (aliasProductIds.length > 1) collisionReasons.push("alias_points_to_multiple_products");
    if (combinedProductIds.length > 1) collisionReasons.push("existing_product_and_alias_disagree");
    if (mappedSourceCategories.length > 1) collisionReasons.push("multiple_source_categories");

    const baseItem = {
      nama_produk: canonicalName,
      nama_normalisasi: normalizedName,
      source_variants: sourceVariants,
      source_categories: sourceCategories,
      occurrence_count: rows.length,
      period_start: periods[0] || null,
      period_end: periods[periods.length - 1] || null,
      latest_stock: latestValidRow ? toNumberOrDefault(latestValidRow.stok_akhir) : 0,
      latest_price: latestValidRow ? toNumberOrDefault(latestValidRow.harga_rata_rata) : 0,
      category_name: resolveCategoryName(
        categoryMap,
        normalizedName,
        canonicalName,
        sourceCategories,
      ),
      is_active: true,
      active_from: periods[0] || null,
      active_until: null,
    };

    if (collisionReasons.length > 0) {
      collisions.push({
        ...baseItem,
        issue_type: "collision",
        reasons: collisionReasons,
        duplicate_periods: duplicatePeriods,
        existing_product_ids: directProductIds,
        alias_product_ids: aliasProductIds,
      });
      continue;
    }

    const existingProductId = combinedProductIds[0] || null;
    if (existingProductId) {
      const product = existingProducts.find((row) => Number(row.id) === existingProductId);
      const aliasExists = matchedAliases.some(
        (row) => Number(row.produk_id) === existingProductId,
      );

      existing.push({
        ...baseItem,
        produk_id: existingProductId,
        existing_name: product?.nama_produk || null,
      });

      if (!aliasExists) {
        aliasesToCreate.push({
          produk_id: existingProductId,
          nama_alias: canonicalName,
          nama_normalisasi: normalizedName,
        });
      }
      continue;
    }

    candidates.push(baseItem);
  }

  return {
    candidates,
    existing,
    aliasesToCreate,
    collisions,
    invalidRows,
    summary: {
      source_file: parsedWorkbook.sourceFile,
      sheet_count: parsedWorkbook.sheetCount,
      row_count: parsedWorkbook.rows.length,
      unique_normalized_names: groupedRows.size,
      candidates_to_create: candidates.length,
      existing_products: existing.length,
      aliases_to_create_for_existing: aliasesToCreate.length,
      collisions: collisions.length,
      invalid_rows: invalidRows.length,
    },
  };
}

async function loadBootstrapContext(db) {
  const [productResult, aliasResult, categoryResult] = await Promise.all([
    db.query(
      `
        SELECT id, nama_produk, kategori_id, harga, stok, stok_minimum,
               is_active, active_from, active_until
        FROM produk
        ORDER BY id
      `,
    ),
    db.query(
      `
        SELECT id, produk_id, nama_alias, nama_normalisasi
        FROM product_alias
        ORDER BY id
      `,
    ),
    db.query("SELECT id, nama_kategori FROM kategori ORDER BY id"),
  ]);

  return {
    existingProducts: productResult.rows,
    existingAliases: aliasResult.rows,
    categories: categoryResult.rows,
  };
}

function buildCategoryIdMap(categories) {
  return new Map(
    categories.map((row) => [String(row.nama_kategori).trim().toLowerCase(), Number(row.id)]),
  );
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
      issue.periode || issue.period_start || null,
      issue.nama_barang_sumber || issue.nama_produk || null,
      issue.nama_normalisasi || null,
      issue.issue_type,
      JSON.stringify(issue),
    ],
  );
}

async function executeProductCatalogPlan(db, parsedWorkbook, plan, context) {
  const client = await db.connect();
  const categoryIds = buildCategoryIdMap(context.categories);
  const createdProducts = [];
  const createdAliases = [];

  try {
    await client.query("BEGIN");

    for (const candidate of plan.candidates) {
      const categoryId = categoryIds.get(candidate.category_name.toLowerCase());
      if (!categoryId) {
        throw new Error(`Kategori tidak ditemukan: ${candidate.category_name}`);
      }

      const result = await client.query(
        `
          INSERT INTO produk (
            nama_produk,
            kategori_id,
            harga,
            stok,
            stok_minimum,
            is_active,
            active_from,
            active_until
          )
          VALUES ($1, $2, $3, $4, 5, $5, $6, $7)
          ON CONFLICT DO NOTHING
          RETURNING id, nama_produk
        `,
        [
          candidate.nama_produk,
          categoryId,
          candidate.latest_price,
          candidate.latest_stock,
          candidate.is_active,
          candidate.active_from,
          candidate.active_until,
        ],
      );

      let product = result.rows[0];
      if (!product) {
        const existingResult = await client.query(
          `
            SELECT id, nama_produk
            FROM produk
            WHERE LOWER(BTRIM(nama_produk)) = LOWER(BTRIM($1))
            LIMIT 1
          `,
          [candidate.nama_produk],
        );
        product = existingResult.rows[0];
      }

      if (!product) {
        throw new Error(`Produk gagal dibuat atau ditemukan: ${candidate.nama_produk}`);
      }
      createdProducts.push({
        produk_id: Number(product.id),
        nama_produk: product.nama_produk,
        nama_normalisasi: candidate.nama_normalisasi,
      });

      const aliasResult = await client.query(
        `
          INSERT INTO product_alias (
            produk_id,
            nama_alias,
            nama_normalisasi
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (nama_normalisasi)
          DO UPDATE SET
            nama_alias = EXCLUDED.nama_alias
          WHERE product_alias.produk_id = EXCLUDED.produk_id
          RETURNING id, produk_id, nama_alias, nama_normalisasi
        `,
        [product.id, candidate.nama_produk, candidate.nama_normalisasi],
      );

      if (aliasResult.rows[0]) createdAliases.push(aliasResult.rows[0]);
    }

    for (const alias of plan.aliasesToCreate) {
      const aliasResult = await client.query(
        `
          INSERT INTO product_alias (
            produk_id,
            nama_alias,
            nama_normalisasi
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (nama_normalisasi)
          DO NOTHING
          RETURNING id, produk_id, nama_alias, nama_normalisasi
        `,
        [alias.produk_id, alias.nama_alias, alias.nama_normalisasi],
      );

      if (aliasResult.rows[0]) createdAliases.push(aliasResult.rows[0]);
    }

    for (const collision of plan.collisions) {
      await insertMappingIssue(client, collision, parsedWorkbook.sourceFile);
    }

    for (const invalidRow of plan.invalidRows) {
      await insertMappingIssue(client, invalidRow, parsedWorkbook.sourceFile);
    }

    await client.query("COMMIT");

    return {
      createdProducts,
      createdAliases,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function writeBootstrapReport(report, outputPath) {
  if (!outputPath) return null;
  const absolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
  return absolutePath;
}

async function bootstrapProductsFromWorkbook(db, filePath, options = {}) {
  const parsedWorkbook = readMonthlyInventoryWorkbook(filePath, options);
  const context = await loadBootstrapContext(db);
  const plan = buildProductCatalogPlan(parsedWorkbook, context, options);
  const dryRun = options.commit !== true;

  let execution = {
    createdProducts: [],
    createdAliases: [],
  };

  if (!dryRun) {
    execution = await executeProductCatalogPlan(db, parsedWorkbook, plan, context);
  }

  const report = {
    dry_run: dryRun,
    committed: !dryRun,
    generated_at: new Date().toISOString(),
    summary: {
      ...plan.summary,
      products_created: execution.createdProducts.length,
      aliases_created: execution.createdAliases.length,
    },
    candidates: plan.candidates,
    existing: plan.existing,
    aliases_to_create: plan.aliasesToCreate,
    collisions: plan.collisions,
    invalid_rows: plan.invalidRows,
    created_products: execution.createdProducts,
    created_aliases: execution.createdAliases,
  };

  const reportPath = writeBootstrapReport(report, options.outputPath);
  return {
    ...report,
    report_path: reportPath,
  };
}

module.exports = {
  DEFAULT_CATEGORY_NAME,
  SOURCE_CATEGORY_MAP,
  bootstrapProductsFromWorkbook,
  buildProductCatalogPlan,
  chooseCanonicalVariant,
  executeProductCatalogPlan,
  loadBootstrapContext,
  mapSourceCategory,
  pickLatestValidRow,
  writeBootstrapReport,
};
