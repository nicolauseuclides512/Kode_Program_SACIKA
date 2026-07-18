const { createExpectedPeriods } = require("./monthlyInventoryImporter");

const DEFAULT_MIN_OBSERVATION_COUNT = 18;
const DEFAULT_HIGH_ZERO_RATIO_THRESHOLD = 0.5;

function formatPeriod(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = String(value);
  return text.includes("T") ? text.slice(0, 10) : text.slice(0, 10);
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMetric(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function calculateStandardDeviation(values, average) {
  if (values.length === 0) return null;

  const variance = values.reduce((sum, value) => {
    return sum + ((value - average) ** 2);
  }, 0) / values.length;

  return Math.sqrt(variance);
}

function normalizeDuplicatePeriods(duplicatePeriods = []) {
  return duplicatePeriods.map((row) => ({
    periode: formatPeriod(row.periode),
    jumlah: Number(row.jumlah || row.count || 0),
  }));
}

function getLatestValidObservationByPeriod(rows = []) {
  const byPeriod = new Map();

  for (const row of rows) {
    const periode = formatPeriod(row.periode);
    const stokAkhir = toNumberOrNull(row.stok_akhir);
    const statusData = row.status_data || "observed";

    if (!periode || statusData === "missing" || stokAkhir === null) continue;

    byPeriod.set(periode, {
      ...row,
      periode,
      stok_akhir: stokAkhir,
    });
  }

  return Array.from(byPeriod.values())
    .sort((a, b) => a.periode.localeCompare(b.periode));
}

function countStockChanges(observations) {
  let changes = 0;

  for (let index = 1; index < observations.length; index += 1) {
    if (observations[index].stok_akhir !== observations[index - 1].stok_akhir) {
      changes += 1;
    }
  }

  return changes;
}

function calculateProductQuality(product, rows = [], duplicatePeriods = [], options = {}) {
  const expectedPeriods = options.expectedPeriods || createExpectedPeriods();
  const minObservationCount = options.minObservationCount || DEFAULT_MIN_OBSERVATION_COUNT;
  const highZeroRatioThreshold = options.highZeroRatioThreshold
    ?? DEFAULT_HIGH_ZERO_RATIO_THRESHOLD;

  const validObservations = getLatestValidObservationByPeriod(rows);
  const observedPeriodSet = new Set(validObservations.map((row) => row.periode));
  const missingMonths = expectedPeriods.filter((periode) => !observedPeriodSet.has(periode));
  const values = validObservations.map((row) => row.stok_akhir);

  const observationCount = validObservations.length;
  const zeroMonthCount = values.filter((value) => value === 0).length;
  const zeroRatio = observationCount > 0 ? zeroMonthCount / observationCount : 0;
  const averageStock = observationCount > 0
    ? values.reduce((sum, value) => sum + value, 0) / observationCount
    : null;
  const stddevStock = averageStock === null
    ? null
    : calculateStandardDeviation(values, averageStock);

  const normalizedDuplicatePeriods = normalizeDuplicatePeriods(duplicatePeriods);
  const hasDuplicatePeriods = normalizedDuplicatePeriods.length > 0;
  const messages = [];
  let status = "eligible";

  if (observationCount < minObservationCount) {
    status = "not_eligible";
    messages.push(`Observasi valid kurang dari ${minObservationCount} bulan`);
  } else if (missingMonths.length > 0 || zeroRatio >= highZeroRatioThreshold) {
    status = "warning";
  }

  if (observationCount === 0) {
    messages.push("Belum ada observasi valid");
  }

  if (missingMonths.length > 0) {
    messages.push(`${missingMonths.length} bulan hilang`);
  }

  if (zeroRatio >= highZeroRatioThreshold && observationCount > 0) {
    messages.push(`Rasio stok nol tinggi (${roundMetric(zeroRatio * 100, 2)}%)`);
  }

  if (hasDuplicatePeriods) {
    messages.push("Terdapat periode duplikat");
  }

  if (messages.length === 0) {
    messages.push("Data layak untuk analisis awal");
  }

  return {
    produk_id: Number(product.id || product.produk_id),
    nama_produk: product.nama_produk || null,
    observation_count: observationCount,
    period_start: validObservations[0]?.periode || null,
    period_end: validObservations[validObservations.length - 1]?.periode || null,
    missing_month_count: missingMonths.length,
    missing_months: missingMonths,
    zero_month_count: zeroMonthCount,
    zero_ratio: roundMetric(zeroRatio),
    average_stock: roundMetric(averageStock),
    stddev_stock: roundMetric(stddevStock),
    min_stock: observationCount > 0 ? Math.min(...values) : null,
    max_stock: observationCount > 0 ? Math.max(...values) : null,
    stock_change_count: countStockChanges(validObservations),
    has_duplicate_periods: hasDuplicatePeriods,
    duplicate_periods: normalizedDuplicatePeriods,
    eligible: observationCount >= minObservationCount,
    status,
    messages,
  };
}

async function getProductQuality(db, produkId, options = {}) {
  const productResult = await db.query(
    "SELECT id, nama_produk FROM produk WHERE id=$1",
    [produkId],
  );

  if (productResult.rows.length === 0) return null;

  const historyResult = await db.query(
    `
      SELECT id, produk_id, periode, stok_akhir, status_data, updated_at
      FROM snapshot_persediaan_bulanan
      WHERE produk_id=$1
      ORDER BY periode ASC, updated_at ASC, id ASC
    `,
    [produkId],
  );

  const duplicateResult = await db.query(
    `
      SELECT periode, COUNT(*)::int AS jumlah
      FROM snapshot_persediaan_bulanan
      WHERE produk_id=$1
      GROUP BY periode
      HAVING COUNT(*) > 1
      ORDER BY periode ASC
    `,
    [produkId],
  );

  return calculateProductQuality(
    productResult.rows[0],
    historyResult.rows,
    duplicateResult.rows,
    options,
  );
}

async function getQualitySummary(db, options = {}) {
  const productResult = await db.query(
    "SELECT id, nama_produk FROM produk ORDER BY id",
  );
  const historyResult = await db.query(
    `
      SELECT id, produk_id, periode, stok_akhir, status_data, updated_at
      FROM snapshot_persediaan_bulanan
      ORDER BY produk_id ASC, periode ASC, updated_at ASC, id ASC
    `,
  );
  const duplicateResult = await db.query(
    `
      SELECT produk_id, periode, COUNT(*)::int AS jumlah
      FROM snapshot_persediaan_bulanan
      GROUP BY produk_id, periode
      HAVING COUNT(*) > 1
      ORDER BY produk_id ASC, periode ASC
    `,
  );

  const rowsByProduct = new Map();
  for (const row of historyResult.rows) {
    const productRows = rowsByProduct.get(row.produk_id) || [];
    productRows.push(row);
    rowsByProduct.set(row.produk_id, productRows);
  }

  const duplicatesByProduct = new Map();
  for (const row of duplicateResult.rows) {
    const productDuplicates = duplicatesByProduct.get(row.produk_id) || [];
    productDuplicates.push(row);
    duplicatesByProduct.set(row.produk_id, productDuplicates);
  }

  const products = productResult.rows.map((product) => {
    return calculateProductQuality(
      product,
      rowsByProduct.get(product.id) || [],
      duplicatesByProduct.get(product.id) || [],
      options,
    );
  });

  const statusCounts = {
    eligible: 0,
    warning: 0,
    not_eligible: 0,
  };

  for (const product of products) {
    statusCounts[product.status] += 1;
  }

  return {
    total_products: products.length,
    status_counts: statusCounts,
    products: products.map((product) => ({
      produk_id: product.produk_id,
      nama_produk: product.nama_produk,
      observation_count: product.observation_count,
      missing_month_count: product.missing_month_count,
      zero_ratio: product.zero_ratio,
      eligible: product.eligible,
      status: product.status,
      messages: product.messages,
    })),
  };
}

module.exports = {
  calculateProductQuality,
  getProductQuality,
  getQualitySummary,
};
