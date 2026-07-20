const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agst", "Sept", "Okt", "Nov", "Des"];

function getWeekNumber(day) {
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

function getPeriodLabel(tahun, bulan, mingguKe) {
  const shortYear = tahun % 100;
  const monthName = MONTHS[bulan - 1];
  return `${monthName} ${shortYear}-W${mingguKe}`;
}

function parseDateParts(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() + 1 !== month
    || probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nextMonth(year, month) {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
}

function toMonthPeriod(tahun, bulan) {
  return `${tahun}-${String(bulan).padStart(2, "0")}-01`;
}

function aggregateWeeklySalesRows(transactions = []) {
  const aggregated = new Map();

  for (const row of transactions) {
    const date = parseDateParts(row.tanggal);
    const jumlah = Number(row.jumlah);

    if (!row.produk_id || !date || !Number.isFinite(jumlah)) continue;

    const mingguKe = getWeekNumber(date.day);
    const periodLabel = getPeriodLabel(date.year, date.month, mingguKe);
    const key = `${row.produk_id}-${periodLabel}`;
    const current = aggregated.get(key) || {
      produk_id: row.produk_id,
      tahun: date.year,
      bulan: date.month,
      minggu_ke: mingguKe,
      period_label: periodLabel,
      total_penjualan: 0,
    };

    current.total_penjualan += jumlah;
    aggregated.set(key, current);
  }

  return Array.from(aggregated.values()).sort((a, b) => (
    a.produk_id - b.produk_id
    || a.tahun - b.tahun
    || a.bulan - b.bulan
    || a.minggu_ke - b.minggu_ke
  ));
}

function aggregateMonthlySalesRows(transactions = []) {
  const aggregated = new Map();

  for (const row of transactions) {
    const date = parseDateParts(row.tanggal);
    const jumlah = Number(row.jumlah);

    if (!row.produk_id || !date || !Number.isFinite(jumlah)) continue;

    const periode = toMonthPeriod(date.year, date.month);
    const key = `${row.produk_id}-${periode}`;
    const current = aggregated.get(key) || {
      produk_id: row.produk_id,
      periode,
      total_penjualan: 0,
    };

    current.total_penjualan += jumlah;
    aggregated.set(key, current);
  }

  return Array.from(aggregated.values()).sort((a, b) => (
    a.produk_id - b.produk_id || a.periode.localeCompare(b.periode)
  ));
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Rollback agregasi penjualan gagal:", rollbackError);
  }
}

async function insertWeeklyRows(client, rows) {
  const insertQuery = `
    INSERT INTO dataset_mingguan
      (produk_id, tahun, bulan, minggu_ke, period_label, total_penjualan)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (produk_id, period_label)
    DO UPDATE SET total_penjualan = EXCLUDED.total_penjualan
  `;

  for (const row of rows) {
    await client.query(insertQuery, [
      row.produk_id,
      row.tahun,
      row.bulan,
      row.minggu_ke,
      row.period_label,
      row.total_penjualan,
    ]);
  }
}

async function insertMonthlyRows(client, rows) {
  const insertQuery = `
    INSERT INTO penjualan_bulanan
      (produk_id, periode, total_penjualan)
    VALUES ($1, $2, $3)
    ON CONFLICT (produk_id, periode)
    DO UPDATE SET total_penjualan = EXCLUDED.total_penjualan
  `;

  for (const row of rows) {
    await client.query(insertQuery, [
      row.produk_id,
      row.periode,
      row.total_penjualan,
    ]);
  }
}

function normalizeAffectedSalesPeriods(changes = []) {
  const weekly = new Map();
  const monthly = new Map();

  for (const change of changes) {
    const produkId = Number(change.produk_id);
    const date = parseDateParts(change.tanggal);
    if (!Number.isInteger(produkId) || produkId <= 0 || !date) continue;

    const mingguKe = getWeekNumber(date.day);
    const weeklyKey = `${produkId}-${date.year}-${date.month}-${mingguKe}`;
    const monthlyKey = `${produkId}-${date.year}-${date.month}`;

    weekly.set(weeklyKey, {
      produk_id: produkId,
      tahun: date.year,
      bulan: date.month,
      minggu_ke: mingguKe,
      period_label: getPeriodLabel(date.year, date.month, mingguKe),
    });
    monthly.set(monthlyKey, {
      produk_id: produkId,
      tahun: date.year,
      bulan: date.month,
      periode: toMonthPeriod(date.year, date.month),
    });
  }

  return {
    weekly: [...weekly.values()],
    monthly: [...monthly.values()],
  };
}

function getWeeklyDateRange(bucket) {
  const startDays = [1, 8, 15, 22];
  const startDay = startDays[bucket.minggu_ke - 1];
  const startDate = formatDate(bucket.tahun, bucket.bulan, startDay);

  if (bucket.minggu_ke < 4) {
    return {
      startDate,
      endDateExclusive: formatDate(
        bucket.tahun,
        bucket.bulan,
        startDays[bucket.minggu_ke],
      ),
    };
  }

  const next = nextMonth(bucket.tahun, bucket.bulan);
  return {
    startDate,
    endDateExclusive: formatDate(next.year, next.month, 1),
  };
}

async function refreshWeeklyBucket(client, bucket) {
  const range = getWeeklyDateRange(bucket);
  const result = await client.query(
    `
      SELECT COALESCE(SUM(jumlah), 0) AS total_penjualan
      FROM transaksi
      WHERE produk_id=$1
        AND jenis_transaksi='keluar'
        AND tanggal >= $2
        AND tanggal < $3
    `,
    [bucket.produk_id, range.startDate, range.endDateExclusive],
  );
  const total = Number(result.rows[0]?.total_penjualan || 0);

  if (total > 0) {
    await insertWeeklyRows(client, [{ ...bucket, total_penjualan: total }]);
  } else {
    await client.query(
      "DELETE FROM dataset_mingguan WHERE produk_id=$1 AND period_label=$2",
      [bucket.produk_id, bucket.period_label],
    );
  }

  return { ...bucket, total_penjualan: total };
}

async function refreshMonthlyBucket(client, bucket) {
  const next = nextMonth(bucket.tahun, bucket.bulan);
  const endDateExclusive = formatDate(next.year, next.month, 1);
  const result = await client.query(
    `
      SELECT COALESCE(SUM(jumlah), 0) AS total_penjualan
      FROM transaksi
      WHERE produk_id=$1
        AND jenis_transaksi='keluar'
        AND tanggal >= $2
        AND tanggal < $3
    `,
    [bucket.produk_id, bucket.periode, endDateExclusive],
  );
  const total = Number(result.rows[0]?.total_penjualan || 0);

  if (total > 0) {
    await insertMonthlyRows(client, [{ ...bucket, total_penjualan: total }]);
  } else {
    await client.query(
      "DELETE FROM penjualan_bulanan WHERE produk_id=$1 AND periode=$2",
      [bucket.produk_id, bucket.periode],
    );
  }

  return { ...bucket, total_penjualan: total };
}

async function refreshSalesAggregationForChanges(client, changes = []) {
  const affected = normalizeAffectedSalesPeriods(changes);
  const weekly = [];
  const monthly = [];

  for (const bucket of affected.weekly) {
    weekly.push(await refreshWeeklyBucket(client, bucket));
  }

  for (const bucket of affected.monthly) {
    monthly.push(await refreshMonthlyBucket(client, bucket));
  }

  return {
    weekly,
    monthly,
    affected_weekly_records: weekly.length,
    affected_monthly_records: monthly.length,
  };
}

async function runMonthlySalesAggregation(db) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const transactionResult = await client.query(
      `
        SELECT produk_id, tanggal, jumlah
        FROM transaksi
        WHERE jenis_transaksi = 'keluar'
        ORDER BY produk_id, tanggal, id
      `,
    );

    const monthlyRows = aggregateMonthlySalesRows(transactionResult.rows);
    await client.query("DELETE FROM penjualan_bulanan");
    await insertMonthlyRows(client, monthlyRows);
    await client.query("COMMIT");

    return {
      message: "Agregasi transaksi keluar bulanan selesai",
      target: "monthly_sales",
      source: "actual_outgoing_transactions",
      source_transactions: transactionResult.rows.length,
      monthly_records: monthlyRows.length,
      legacy_weekly_updated: false,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function runSalesAggregation(db) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const transactionResult = await client.query(
      `
        SELECT produk_id, tanggal, jumlah
        FROM transaksi
        WHERE jenis_transaksi = 'keluar'
        ORDER BY produk_id, tanggal, id
      `,
    );

    const weeklyRows = aggregateWeeklySalesRows(transactionResult.rows);
    const monthlyRows = aggregateMonthlySalesRows(transactionResult.rows);

    await client.query("DELETE FROM dataset_mingguan");
    await client.query("DELETE FROM penjualan_bulanan");
    await insertWeeklyRows(client, weeklyRows);
    await insertMonthlyRows(client, monthlyRows);

    await client.query("COMMIT");

    return {
      message: "Agregasi penjualan selesai",
      source_transactions: transactionResult.rows.length,
      weekly_records: weeklyRows.length,
      monthly_records: monthlyRows.length,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  aggregateMonthlySalesRows,
  aggregateWeeklySalesRows,
  getPeriodLabel,
  getWeekNumber,
  getWeeklyDateRange,
  normalizeAffectedSalesPeriods,
  parseDateParts,
  refreshSalesAggregationForChanges,
  runMonthlySalesAggregation,
  runSalesAggregation,
};
