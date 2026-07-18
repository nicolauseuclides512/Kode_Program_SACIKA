const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateProductQuality,
  getQualitySummary,
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

test("calculateProductQuality computes monthly metrics without filling missing as zero", () => {
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
  assert.equal(quality.eligible, true);
  assert.equal(quality.status, "warning");
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
