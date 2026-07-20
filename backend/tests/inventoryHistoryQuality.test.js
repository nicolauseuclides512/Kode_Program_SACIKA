const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildInventoryHistoryResponse,
  calculateProductQuality,
  getInventoryHistory,
  getQualitySummary,
  parsePeriodParam,
} = require("../services/inventoryHistoryQualityService");
const {
  createInventoryHistoryController,
} = require("../controllers/inventoryHistoryController");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("calculateProductQuality detects gaps and does not treat scattered observations as continuous", () => {
  const quality = calculateProductQuality(
    { id: 1, nama_produk: "Aqua Botol 600 ml" },
    [
      { periode: "2024-01-01", stok_akhir: 10, status_data: "observed" },
      { periode: "2024-02-01", stok_akhir: 0, status_data: "observed" },
      { periode: "2024-04-01", stok_akhir: 15, status_data: "corrected" },
    ],
    [{ periode: "2024-04-01", jumlah: 2 }],
    {
      expectedPeriods: ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"],
      minObservationCount: 3,
      highZeroRatioThreshold: 0.5,
    },
  );

  assert.equal(quality.observation_count, 3);
  assert.deepEqual(quality.missing_months, ["2024-03-01"]);
  assert.equal(quality.zero_month_count, 1);
  assert.equal(quality.zero_ratio, 0.3333);
  assert.equal(quality.average_stock, 8.3333);
  assert.equal(quality.min_stock, 0);
  assert.equal(quality.max_stock, 15);
  assert.equal(quality.stock_change_count, 2);
  assert.equal(quality.has_duplicate_periods, true);
  assert.equal(quality.latest_contiguous_observation_count, 1);
  assert.equal(quality.eligible, false);
  assert.equal(quality.status, "not_eligible");
});

test("calculateProductQuality marks products with fewer than 18 observations as not eligible", () => {
  const quality = calculateProductQuality(
    { id: 2, nama_produk: "Coffemix 20 g" },
    [{ periode: "2024-01-01", stok_akhir: 4, status_data: "observed" }],
    [],
  );

  assert.equal(quality.observation_count, 1);
  assert.equal(quality.eligible, false);
  assert.equal(quality.status, "not_eligible");
});

test("buildInventoryHistoryResponse keeps monthly ordering and missing values as null", () => {
  const response = buildInventoryHistoryResponse(
    {
      id: 1,
      nama_produk: "Aqua Botol 600 ml",
      stok: 20,
      stok_minimum: 5,
    },
    [
      { periode: "2024-01-01", stok_akhir: 10, status_data: "observed" },
      { periode: "2024-03-01", stok_akhir: null, status_data: "missing" },
    ],
    {
      startPeriod: "2024-01-01",
      endPeriod: "2024-03-01",
    },
  );

  assert.deepEqual(response.periods, ["2024-01", "2024-02", "2024-03"]);
  assert.deepEqual(response.values, [10, null, null]);
  assert.equal(response.observation_count, 1);
  assert.deepEqual(response.missing_periods, ["2024-02", "2024-03"]);
});

test("parsePeriodParam accepts YYYY-MM and normalizes to first day", () => {
  assert.equal(parsePeriodParam("2024-02", "start_period"), "2024-02-01");
  assert.equal(parsePeriodParam("2024-02-21", "end_period"), "2024-02-01");
  assert.throws(
    () => parsePeriodParam("2024-99", "start_period"),
    /bulan tidak valid/,
  );
});

test("getInventoryHistory returns product history from inventory_snapshot_monthly", async () => {
  const executedSql = [];
  const fakeDb = {
    async query(sql) {
      executedSql.push(sql);

      if (sql.includes("FROM produk")) {
        return {
          rows: [{
            id: 1,
            nama_produk: "Aqua Botol 600 ml",
            stok: 20,
            stok_minimum: 5,
          }],
        };
      }

      return {
        rows: [
          {
            id: 1,
            produk_id: 1,
            periode: "2024-01-01",
            stok_akhir: 10,
            status_data: "observed",
          },
          {
            id: 2,
            produk_id: 1,
            periode: "2024-02-01",
            stok_akhir: null,
            status_data: "missing",
          },
        ],
      };
    },
  };

  const result = await getInventoryHistory(fakeDb, 1, {
    start_period: "2024-01",
    end_period: "2024-02",
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.data.periods, ["2024-01", "2024-02"]);
  assert.deepEqual(result.data.values, [10, null]);
  assert.equal(
    executedSql.some((sql) => sql.includes("inventory_snapshot_monthly")),
    true,
  );
  assert.equal(
    executedSql.some((sql) => sql.includes("dataset_mingguan")),
    false,
  );
});

test("getInventoryHistory validates product not found and empty history", async () => {
  const missingProductDb = {
    async query(sql) {
      if (sql.includes("FROM produk")) return { rows: [] };
      return { rows: [] };
    },
  };
  const emptyHistoryDb = {
    async query(sql) {
      if (sql.includes("FROM produk")) {
        return {
          rows: [{ id: 1, nama_produk: "Aqua Botol 600 ml", stok: 0, stok_minimum: 0 }],
        };
      }
      return { rows: [] };
    },
  };

  assert.deepEqual(
    await getInventoryHistory(missingProductDb, 999),
    { status: "product_not_found" },
  );
  assert.deepEqual(
    await getInventoryHistory(emptyHistoryDb, 1),
    { status: "history_not_found" },
  );
});

test("getQualitySummary groups products by eligibility status", async () => {
  const fakeDb = {
    async query(sql) {
      if (sql.includes("FROM produk")) {
        return {
          rows: [
            { id: 1, nama_produk: "Aqua Botol 600 ml" },
            { id: 2, nama_produk: "Coffemix 20 g" },
          ],
        };
      }

      if (sql.includes("GROUP BY produk_id, periode")) {
        return { rows: [] };
      }

      return {
        rows: [
          { produk_id: 1, periode: "2024-01-01", stok_akhir: 5, status_data: "observed" },
          { produk_id: 1, periode: "2024-02-01", stok_akhir: 6, status_data: "observed" },
          { produk_id: 2, periode: "2024-01-01", stok_akhir: 0, status_data: "observed" },
        ],
      };
    },
  };

  const summary = await getQualitySummary(fakeDb, {
    expectedPeriods: ["2024-01-01", "2024-02-01"],
    minObservationCount: 2,
  });

  assert.equal(summary.total_products, 2);
  assert.equal(summary.status_counts.eligible, 1);
  assert.equal(summary.status_counts.not_eligible, 1);
});

test("inventory history controller returns product quality response", async () => {
  const fakeDb = {
    async query(sql) {
      if (sql.includes("FROM produk WHERE id=$1")) {
        return { rows: [{ id: 1, nama_produk: "Aqua Botol 600 ml" }] };
      }

      if (sql.includes("GROUP BY periode")) {
        return { rows: [] };
      }

      return {
        rows: [
          { id: 1, produk_id: 1, periode: "2024-01-01", stok_akhir: 5, status_data: "observed" },
        ],
      };
    },
  };
  const controller = createInventoryHistoryController(fakeDb);
  const res = createResponse();

  await controller.getProductQuality({ params: { produk_id: "1" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.produk_id, 1);
  assert.equal(res.body.observation_count, 1);
  assert.equal(Array.isArray(res.body.missing_months), true);
});

test("inventory history controller returns monthly history response", async () => {
  const fakeDb = {
    async query(sql) {
      if (sql.includes("FROM produk")) {
        return {
          rows: [{
            id: 1,
            nama_produk: "Aqua Botol 600 ml",
            stok: 20,
            stok_minimum: 5,
          }],
        };
      }

      return {
        rows: [
          {
            id: 1,
            produk_id: 1,
            periode: "2024-01-01",
            stok_akhir: 10,
            status_data: "observed",
          },
        ],
      };
    },
  };
  const controller = createInventoryHistoryController(fakeDb);
  const res = createResponse();

  await controller.getInventoryHistory(
    {
      params: { produk_id: "1" },
      query: { start_period: "2024-01", end_period: "2024-01" },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.target, "ending_inventory");
  assert.deepEqual(res.body.periods, ["2024-01"]);
  assert.deepEqual(res.body.values, [10]);
});

test("calculateProductQuality excludes months before active_from and reports not_listed separately", () => {
  const product = {
    id: 10,
    nama_produk: "Produk Baru",
    is_active: true,
    active_from: "2024-03-01",
    active_until: null,
  };
  const rows = [
    { periode: "2024-01-01", stok_akhir: null, status_data: "not_active" },
    { periode: "2024-02-01", stok_akhir: null, status_data: "not_active" },
    { periode: "2024-03-01", stok_akhir: 5, status_data: "observed" },
    { periode: "2024-04-01", stok_akhir: null, status_data: "not_listed" },
  ];

  const quality = calculateProductQuality(product, rows, [], {
    expectedPeriods: [
      "2024-01-01",
      "2024-02-01",
      "2024-03-01",
      "2024-04-01",
    ],
    minObservationCount: 1,
  });

  assert.equal(quality.expected_period_count, 2);
  assert.equal(quality.missing_month_count, 0);
  assert.equal(quality.not_listed_month_count, 1);
  assert.equal(quality.not_active_month_count, 2);
  assert.equal(quality.status, "warning");
});

test("calculateProductQuality marks inactive product as not eligible", () => {
  const quality = calculateProductQuality(
    {
      id: 11,
      nama_produk: "Produk Lama",
      is_active: false,
      active_from: "2024-01-01",
      active_until: "2024-02-01",
    },
    [
      { periode: "2024-01-01", stok_akhir: 5, status_data: "observed" },
      { periode: "2024-02-01", stok_akhir: 4, status_data: "observed" },
    ],
    [],
    { minObservationCount: 2 },
  );

  assert.equal(quality.eligible, false);
  assert.equal(quality.status, "not_eligible");
  assert.ok(quality.messages.includes("Produk berstatus tidak aktif"));
});
