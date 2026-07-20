import fs from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("./Dashboard.jsx", import.meta.url), "utf8");

test("Dashboard uses backend summary endpoint and forecast warning title", () => {
  assert.match(source, /ENDPOINTS\.dashboardSummary/);
  assert.match(source, /Peringatan Prediksi Persediaan Bulan Berikutnya/);
  assert.match(source, /Belum tersedia hasil prediksi persediaan/);
  assert.match(source, /forecast_risk|forecast_period|forecast_value|model_used|produk_id/);
});

test("Dashboard does not present local ARIMA restock or purchase quantity recommendation", () => {
  assert.doesNotMatch(source, /restockArima|Restock ARIMA|ARIMA/i);
  assert.doesNotMatch(source, /jumlah pembelian|jumlah.*dibeli|harus dibeli|disarankan/i);
  assert.doesNotMatch(source, /id_produk/);
  assert.doesNotMatch(source, /W1|W2|W3|W4/);
});


test("Dashboard shows forecast freshness and indicative range", () => {
  assert.match(source, /stale_count/);
  assert.match(source, /Kedaluwarsa/);
  assert.match(source, /Rentang indikatif/);
  assert.match(source, /lower_bound/);
  assert.match(source, /upper_bound/);
  assert.match(source, /data_cutoff/);
  assert.match(source, /latest_snapshot_period/);
  assert.match(source, /stale_by_months/);
});
