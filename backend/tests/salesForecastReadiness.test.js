const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMonthlySalesReadinessResponse,
  classifyMonthlySalesReadiness,
  getMonthlySalesForecastReadiness,
} = require("../services/salesForecastReadinessService");
const {
  createInventoryForecastController,
} = require("../controllers/inventoryForecastController");

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

function createFakeDb(options = {}) {
  const executedQueries = [];
  const productRows = options.productFound === false ? [] : [{ id: 1 }];

  return {
    executedQueries,
    async query(sql, params = []) {
      executedQueries.push({ sql, params });

      if (sql.includes("FROM produk")) {
        return { rows: productRows };
      }

      if (sql.includes("FROM penjualan_bulanan")) {
        return {
          rows: [{
            observation_count: options.observationCount ?? 0,
          }],
        };
      }

      return { rows: [] };
    },
  };
}

test("classifyMonthlySalesReadiness follows insufficient, experimental, basic, and full thresholds", () => {
  assert.equal(classifyMonthlySalesReadiness(0).status, "insufficient_data");
  assert.equal(classifyMonthlySalesReadiness(5).status, "insufficient_data");
  assert.equal(classifyMonthlySalesReadiness(6).status, "experimental");
  assert.equal(classifyMonthlySalesReadiness(11).status, "experimental");
  assert.equal(classifyMonthlySalesReadiness(12).status, "eligible_basic");
  assert.equal(classifyMonthlySalesReadiness(23).status, "eligible_basic");
  assert.equal(classifyMonthlySalesReadiness(24).status, "eligible_full");
});

test("buildMonthlySalesReadinessResponse keeps monthly_sales target separate from ending_inventory", () => {
  assert.deepEqual(buildMonthlySalesReadinessResponse(8), {
    target: "monthly_sales",
    observation_count: 8,
    status: "experimental",
    message: "Prediksi penjualan belum diaktifkan karena histori belum mencukupi.",
  });
});

test("getMonthlySalesForecastReadiness reads only actual monthly sales rows", async () => {
  const db = createFakeDb({ observationCount: 12 });

  const result = await getMonthlySalesForecastReadiness(db, 1);

  assert.equal(result.target, "monthly_sales");
  assert.equal(result.status, "eligible_basic");
  assert.equal(
    db.executedQueries.some(({ sql }) => sql.includes("FROM penjualan_bulanan")),
    true,
  );
  assert.equal(
    db.executedQueries.some(({ sql }) => sql.includes("inventory_snapshot_monthly")),
    false,
  );
  assert.equal(
    db.executedQueries.some(({ sql }) => sql.includes("dataset_mingguan")),
    false,
  );
});

test("getMonthlySalesForecastReadiness validates missing product", async () => {
  const db = createFakeDb({ productFound: false });

  await assert.rejects(
    () => getMonthlySalesForecastReadiness(db, 1),
    (error) => {
      assert.equal(error.statusCode, 404);
      assert.equal(error.message, "Produk tidak ditemukan");
      return true;
    },
  );
});

test("forecast controller returns sales readiness without activating sales forecast", async () => {
  const db = createFakeDb({ observationCount: 8 });
  const controller = createInventoryForecastController(db);
  const res = createResponse();

  await controller.getSalesForecastReadiness(
    { params: { produk_id: "1" } },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    target: "monthly_sales",
    observation_count: 8,
    status: "experimental",
    message: "Prediksi penjualan belum diaktifkan karena histori belum mencukupi.",
  });
});
