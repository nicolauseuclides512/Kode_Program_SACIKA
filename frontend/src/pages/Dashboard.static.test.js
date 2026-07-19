import fs from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("./Dashboard.jsx", import.meta.url), "utf8");

test("Dashboard uses latest inventory-risk endpoint and forecast warning title", () => {
  assert.match(source, /ENDPOINTS\.inventoryRisk/);
  assert.match(source, /Peringatan Prediksi Persediaan Bulan Berikutnya/);
  assert.match(source, /Belum tersedia hasil prediksi persediaan/);
  assert.match(source, /forecast_result|forecast_period|forecast_value|model_used|produk_id/);
});

test("Dashboard does not present local ARIMA restock or purchase quantity recommendation", () => {
  assert.doesNotMatch(source, /restockArima|Restock ARIMA|ARIMA/i);
  assert.doesNotMatch(source, /jumlah pembelian|jumlah.*dibeli|harus dibeli|disarankan/i);
  assert.doesNotMatch(source, /id_produk/);
});
