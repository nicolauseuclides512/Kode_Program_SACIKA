const DEFAULT_MIN_OBSERVATION_COUNT = 18;
const DEFAULT_HIGH_ZERO_RATIO_THRESHOLD = 0.5;
const VALID_OBSERVATION_STATUSES = new Set(["observed", "corrected"]);
const NULL_VALUE_STATUSES = new Set(["missing", "not_listed", "not_active"]);

function formatPeriod(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = String(value).trim();
  if (!text) return null;

  const match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return null;

  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  return `${match[1]}-${match[2]}-01`;
}

function formatMonth(value) {
  const period = formatPeriod(value);
  return period ? period.slice(0, 7) : null;
}

function parsePeriodParam(value, fieldName) {
  if (!value) return null;

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) {
    throw new Error(`${fieldName} harus berformat YYYY-MM atau YYYY-MM-DD`);
  }

  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`${fieldName} memiliki bulan tidak valid`);
  }

  return `${match[1]}-${match[2]}-01`;
}

function addMonth(period) {
  const normalized = formatPeriod(period);
  if (!normalized) return null;

  const [year, month] = normalized.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

function subtractMonths(period, count) {
  const normalized = formatPeriod(period);
  if (!normalized || !Number.isInteger(count) || count < 0) return null;

  const [year, month] = normalized.split("-").map(Number);
  const absoluteMonth = (year * 12) + (month - 1) - count;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = (absoluteMonth % 12) + 1;

  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
}

function createMonthRange(startPeriod, endPeriod) {
  const start = formatPeriod(startPeriod);
  const end = formatPeriod(endPeriod);
  if (!start || !end || start > end) return [];

  const periods = [];
  let current = start;

  while (current <= end) {
    periods.push(current);
    current = addMonth(current);
  }

  return periods;
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRows(rows = []) {
  return rows
    .map((row) => ({
      ...row,
      periode: formatPeriod(row.periode),
      stok_akhir: toNumberOrNull(row.stok_akhir),
      status_data: row.status_data || "observed",
    }))
    .filter((row) => row.periode)
    .sort((a, b) => a.periode.localeCompare(b.periode));
}

function isValidObservation(row) {
  return Boolean(
    row
    && VALID_OBSERVATION_STATUSES.has(row.status_data || "observed")
    && toNumberOrNull(row.stok_akhir) !== null,
  );
}

function findContiguousSegments(periods = [], values = []) {
  if (periods.length !== values.length) {
    throw new Error("Panjang periods dan values harus sama");
  }

  const segments = [];
  let current = null;

  for (let index = 0; index < periods.length; index += 1) {
    const period = formatMonth(periods[index]);
    const value = toNumberOrNull(values[index]);
    const previousPeriod = index > 0 ? formatMonth(periods[index - 1]) : null;
    const expectedCurrent = previousPeriod ? formatMonth(addMonth(`${previousPeriod}-01`)) : null;
    const monthIsConsecutive = index === 0 || period === expectedCurrent;

    if (period && value !== null && monthIsConsecutive) {
      if (!current) {
        current = {
          start_index: index,
          end_index: index,
          periods: [],
          values: [],
        };
      }

      current.periods.push(period);
      current.values.push(value);
      current.end_index = index;
      continue;
    }

    if (current) {
      segments.push(current);
      current = null;
    }

    if (period && value !== null) {
      current = {
        start_index: index,
        end_index: index,
        periods: [period],
        values: [value],
      };
    }
  }

  if (current) segments.push(current);

  return segments.map((segment) => ({
    ...segment,
    observation_count: segment.values.length,
    period_start: segment.periods[0] || null,
    period_end: segment.periods[segment.periods.length - 1] || null,
  }));
}

function findLatestContiguousSegment(periods = [], values = []) {
  const segments = findContiguousSegments(periods, values);
  return segments.length > 0
    ? segments[segments.length - 1]
    : {
      start_index: null,
      end_index: null,
      periods: [],
      values: [],
      observation_count: 0,
      period_start: null,
      period_end: null,
    };
}

function findLongestContiguousSegment(periods = [], values = []) {
  const segments = findContiguousSegments(periods, values);
  if (segments.length === 0) return findLatestContiguousSegment([], []);

  return segments.reduce((best, candidate) => {
    if (candidate.observation_count > best.observation_count) return candidate;
    if (
      candidate.observation_count === best.observation_count
      && candidate.end_index > best.end_index
    ) {
      return candidate;
    }
    return best;
  });
}

function buildInventoryHistoryResponse(product, rows, filters = {}) {
  const normalizedRows = normalizeRows(rows);
  if (normalizedRows.length === 0) return null;

  const startPeriod = filters.startPeriod || normalizedRows[0].periode;
  const endPeriod = filters.endPeriod || normalizedRows[normalizedRows.length - 1].periode;
  const monthRange = createMonthRange(startPeriod, endPeriod);
  const rowByPeriod = new Map();

  for (const row of normalizedRows) {
    rowByPeriod.set(row.periode, row);
  }

  const periods = [];
  const values = [];
  const missingPeriods = [];
  const statuses = [];
  let observationCount = 0;

  for (const periode of monthRange) {
    const row = rowByPeriod.get(periode);
    const status = row?.status_data || "missing";
    const isMissing = !row || NULL_VALUE_STATUSES.has(status) || !isValidObservation(row);

    periods.push(formatMonth(periode));
    values.push(isMissing ? null : row.stok_akhir);
    statuses.push(status);

    if (isMissing) {
      missingPeriods.push(formatMonth(periode));
    } else {
      observationCount += 1;
    }
  }

  const latestSegment = findLatestContiguousSegment(periods, values);
  const longestSegment = findLongestContiguousSegment(periods, values);

  return {
    produk: {
      id: Number(product.id),
      nama: product.nama_produk,
      stok_saat_ini: toNumberOrNull(product.stok),
      stok_minimum: toNumberOrNull(product.stok_minimum),
      is_active: product.is_active !== false,
      active_from: formatMonth(product.active_from),
      active_until: formatMonth(product.active_until),
    },
    target: "ending_inventory",
    frequency: "monthly",
    periods,
    values,
    statuses,
    observation_count: observationCount,
    missing_periods: missingPeriods,
    latest_contiguous_segment: latestSegment,
    longest_contiguous_segment: longestSegment,
  };
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

function getLatestValidObservationByPeriod(rows = [], expectedPeriodSet = null) {
  const byPeriod = new Map();

  for (const row of normalizeRows(rows)) {
    if (expectedPeriodSet && !expectedPeriodSet.has(row.periode)) continue;
    if (!isValidObservation(row)) continue;

    byPeriod.set(row.periode, row);
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

function normalizeLifecyclePeriod(value) {
  return formatPeriod(value);
}

function filterPeriodsByLifecycle(periods, product = {}) {
  const activeFrom = normalizeLifecyclePeriod(product.active_from);
  const activeUntil = normalizeLifecyclePeriod(product.active_until);

  return periods.filter((periodeInput) => {
    const periode = formatPeriod(periodeInput);
    if (!periode) return false;
    if (activeFrom && periode < activeFrom) return false;
    if (activeUntil && periode > activeUntil) return false;
    return true;
  });
}

function deriveExpectedPeriods(product, rows, options = {}) {
  if (Array.isArray(options.expectedPeriods)) {
    return filterPeriodsByLifecycle(
      options.expectedPeriods.map(formatPeriod).filter(Boolean),
      product,
    );
  }

  const normalizedPeriods = normalizeRows(rows).map((row) => row.periode);
  const firstObservedPeriod = normalizedPeriods[0] || null;
  const lastObservedPeriod = normalizedPeriods[normalizedPeriods.length - 1] || null;
  const activeFrom = normalizeLifecyclePeriod(product.active_from);
  const activeUntil = normalizeLifecyclePeriod(product.active_until);
  const requestedStart = formatPeriod(options.startPeriod || options.start_period);
  const requestedEnd = formatPeriod(options.endPeriod || options.end_period);

  let startPeriod = requestedStart || activeFrom || firstObservedPeriod;
  let endPeriod = requestedEnd || activeUntil || lastObservedPeriod;

  if (activeFrom && (!startPeriod || startPeriod < activeFrom)) startPeriod = activeFrom;
  if (activeUntil && (!endPeriod || endPeriod > activeUntil)) endPeriod = activeUntil;

  const windowMonths = Number(options.windowMonths || options.window_months);
  if (Number.isInteger(windowMonths) && windowMonths > 0 && endPeriod) {
    const rollingStart = subtractMonths(endPeriod, windowMonths - 1);
    if (!startPeriod || rollingStart > startPeriod) startPeriod = rollingStart;
  }

  if (!startPeriod || !endPeriod || startPeriod > endPeriod) return [];
  return createMonthRange(startPeriod, endPeriod);
}

function countStatusPeriods(rows, status) {
  const periods = new Set();

  for (const row of normalizeRows(rows)) {
    if (row.status_data === status) periods.add(row.periode);
  }

  return [...periods].sort();
}

function buildTimeline(expectedPeriods, rows) {
  const rowByPeriod = new Map();
  for (const row of normalizeRows(rows)) rowByPeriod.set(row.periode, row);

  const periods = expectedPeriods.map(formatMonth);
  const values = expectedPeriods.map((periode) => {
    const row = rowByPeriod.get(periode);
    return isValidObservation(row) ? row.stok_akhir : null;
  });

  return { periods, values };
}

function calculateProductQuality(product, rows = [], duplicatePeriods = [], options = {}) {
  const expectedPeriods = deriveExpectedPeriods(product, rows, options);
  const expectedPeriodSet = new Set(expectedPeriods);
  const minObservationCount = Number(options.minObservationCount)
    || DEFAULT_MIN_OBSERVATION_COUNT;
  const highZeroRatioThreshold = options.highZeroRatioThreshold
    ?? DEFAULT_HIGH_ZERO_RATIO_THRESHOLD;

  const validObservations = getLatestValidObservationByPeriod(rows, expectedPeriodSet);
  const explicitMissingMonths = countStatusPeriods(rows, "missing")
    .filter((period) => expectedPeriodSet.has(period));
  const notListedMonths = countStatusPeriods(rows, "not_listed")
    .filter((period) => expectedPeriodSet.has(period));
  const notActiveMonths = countStatusPeriods(rows, "not_active");
  const rowPeriodSet = new Set(normalizeRows(rows).map((row) => row.periode));
  const implicitMissingMonths = expectedPeriods.filter((periode) => !rowPeriodSet.has(periode));
  const missingMonths = [...new Set([...explicitMissingMonths, ...implicitMissingMonths])].sort();
  const values = validObservations.map((row) => row.stok_akhir);
  const timeline = buildTimeline(expectedPeriods, rows);
  const latestSegment = findLatestContiguousSegment(timeline.periods, timeline.values);
  const longestSegment = findLongestContiguousSegment(timeline.periods, timeline.values);

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
  const productIsActive = product.is_active !== false;
  const hasEnoughContinuousHistory = latestSegment.observation_count >= minObservationCount;
  let status = "eligible";

  if (!productIsActive) {
    status = "not_eligible";
    messages.push("Produk berstatus tidak aktif");
  } else if (!hasEnoughContinuousHistory) {
    status = "not_eligible";
    messages.push(
      `Segmen kontinu terbaru kurang dari ${minObservationCount} bulan`,
    );
  } else if (
    missingMonths.length > 0
    || notListedMonths.length > 0
    || zeroRatio >= highZeroRatioThreshold
    || hasDuplicatePeriods
  ) {
    status = "warning";
  }

  if (observationCount === 0) messages.push("Belum ada observasi valid");
  if (missingMonths.length > 0) {
    messages.push(`${missingMonths.length} bulan memiliki nilai stok yang hilang`);
  }
  if (notListedMonths.length > 0) {
    messages.push(`${notListedMonths.length} bulan produk tidak tercantum pada sumber`);
  }
  if (notActiveMonths.length > 0) {
    messages.push(`${notActiveMonths.length} bulan berada di luar periode aktif produk`);
  }
  if (zeroRatio >= highZeroRatioThreshold && observationCount > 0) {
    messages.push(`Rasio stok nol tinggi (${roundMetric(zeroRatio * 100, 2)}%)`);
  }
  if (hasDuplicatePeriods) messages.push("Terdapat periode duplikat");
  if (messages.length === 0) messages.push("Data layak untuk analisis awal");

  return {
    produk_id: Number(product.id || product.produk_id),
    nama_produk: product.nama_produk || null,
    observation_count: observationCount,
    period_start: validObservations[0]?.periode || null,
    period_end: validObservations[validObservations.length - 1]?.periode || null,
    quality_window_start: expectedPeriods[0] || null,
    quality_window_end: expectedPeriods[expectedPeriods.length - 1] || null,
    is_active: productIsActive,
    active_from: normalizeLifecyclePeriod(product.active_from),
    active_until: normalizeLifecyclePeriod(product.active_until),
    expected_period_count: expectedPeriods.length,
    missing_month_count: missingMonths.length,
    missing_months: missingMonths,
    not_listed_month_count: notListedMonths.length,
    not_listed_months: notListedMonths,
    not_active_month_count: notActiveMonths.length,
    not_active_months: notActiveMonths,
    zero_month_count: zeroMonthCount,
    zero_ratio: roundMetric(zeroRatio),
    average_stock: roundMetric(averageStock),
    stddev_stock: roundMetric(stddevStock),
    min_stock: observationCount > 0 ? Math.min(...values) : null,
    max_stock: observationCount > 0 ? Math.max(...values) : null,
    stock_change_count: countStockChanges(validObservations),
    has_duplicate_periods: hasDuplicatePeriods,
    duplicate_periods: normalizedDuplicatePeriods,
    latest_contiguous_observation_count: latestSegment.observation_count,
    latest_contiguous_period_start: latestSegment.period_start
      ? `${latestSegment.period_start}-01`
      : null,
    latest_contiguous_period_end: latestSegment.period_end
      ? `${latestSegment.period_end}-01`
      : null,
    longest_contiguous_observation_count: longestSegment.observation_count,
    longest_contiguous_period_start: longestSegment.period_start
      ? `${longestSegment.period_start}-01`
      : null,
    longest_contiguous_period_end: longestSegment.period_end
      ? `${longestSegment.period_end}-01`
      : null,
    eligible: productIsActive && hasEnoughContinuousHistory,
    status,
    messages,
  };
}

async function getProductQuality(db, produkId, options = {}) {
  const productResult = await db.query(
    "SELECT id, nama_produk, is_active, active_from, active_until FROM produk WHERE id=$1",
    [produkId],
  );

  if (productResult.rows.length === 0) return null;

  const historyResult = await db.query(
    `
      SELECT id, produk_id, periode, stok_akhir, status_data, updated_at
      FROM inventory_snapshot_monthly
      WHERE produk_id=$1
      ORDER BY periode ASC, updated_at ASC, id ASC
    `,
    [produkId],
  );

  const duplicateResult = await db.query(
    `
      SELECT periode, COUNT(*)::int AS jumlah
      FROM inventory_snapshot_monthly
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

async function getInventoryHistory(db, produkId, filters = {}) {
  const startPeriod = parsePeriodParam(filters.start_period, "start_period");
  const endPeriod = parsePeriodParam(filters.end_period, "end_period");

  if (startPeriod && endPeriod && startPeriod > endPeriod) {
    throw new Error("start_period tidak boleh lebih besar dari end_period");
  }

  const productResult = await db.query(
    `
      SELECT id, nama_produk, stok, stok_minimum,
             is_active, active_from, active_until
      FROM produk
      WHERE id=$1
    `,
    [produkId],
  );

  if (productResult.rows.length === 0) {
    return { status: "product_not_found" };
  }

  const params = [produkId];
  const where = ["produk_id=$1"];

  if (startPeriod) {
    params.push(startPeriod);
    where.push(`periode >= $${params.length}`);
  }

  if (endPeriod) {
    params.push(endPeriod);
    where.push(`periode <= $${params.length}`);
  }

  const historyResult = await db.query(
    `
      SELECT DISTINCT ON (periode)
        id,
        produk_id,
        periode,
        stok_akhir,
        status_data,
        updated_at
      FROM inventory_snapshot_monthly
      WHERE ${where.join(" AND ")}
      ORDER BY periode ASC, updated_at DESC, id DESC
    `,
    params,
  );

  const response = buildInventoryHistoryResponse(productResult.rows[0], historyResult.rows, {
    startPeriod,
    endPeriod,
  });

  if (!response) return { status: "history_not_found" };
  return { status: "ok", data: response };
}

async function getQualitySummary(db, options = {}) {
  const productResult = await db.query(
    `
      SELECT id, nama_produk, is_active, active_from, active_until
      FROM produk
      ORDER BY id
    `,
  );
  const historyResult = await db.query(
    `
      SELECT id, produk_id, periode, stok_akhir, status_data, updated_at
      FROM inventory_snapshot_monthly
      ORDER BY produk_id ASC, periode ASC, updated_at ASC, id ASC
    `,
  );
  const duplicateResult = await db.query(
    `
      SELECT produk_id, periode, COUNT(*)::int AS jumlah
      FROM inventory_snapshot_monthly
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

  const products = productResult.rows.map((product) => calculateProductQuality(
    product,
    rowsByProduct.get(product.id) || [],
    duplicatesByProduct.get(product.id) || [],
    options,
  ));

  const statusCounts = { eligible: 0, warning: 0, not_eligible: 0 };
  for (const product of products) statusCounts[product.status] += 1;

  return {
    total_products: products.length,
    status_counts: statusCounts,
    quality_window: {
      start_period: formatMonth(options.startPeriod || options.start_period),
      end_period: formatMonth(options.endPeriod || options.end_period),
      window_months: Number(options.windowMonths || options.window_months) || null,
    },
    products: products.map((product) => ({
      produk_id: product.produk_id,
      nama_produk: product.nama_produk,
      observation_count: product.observation_count,
      latest_contiguous_observation_count: product.latest_contiguous_observation_count,
      latest_contiguous_period_start: product.latest_contiguous_period_start,
      latest_contiguous_period_end: product.latest_contiguous_period_end,
      is_active: product.is_active,
      active_from: product.active_from,
      active_until: product.active_until,
      quality_window_start: product.quality_window_start,
      quality_window_end: product.quality_window_end,
      missing_month_count: product.missing_month_count,
      not_listed_month_count: product.not_listed_month_count,
      zero_ratio: product.zero_ratio,
      eligible: product.eligible,
      status: product.status,
      messages: product.messages,
    })),
  };
}

module.exports = {
  buildInventoryHistoryResponse,
  calculateProductQuality,
  createMonthRange,
  deriveExpectedPeriods,
  filterPeriodsByLifecycle,
  findContiguousSegments,
  findLatestContiguousSegment,
  findLongestContiguousSegment,
  getProductQuality,
  getInventoryHistory,
  getQualitySummary,
  parsePeriodParam,
};
