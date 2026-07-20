import fs from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("./Prediksi.jsx", import.meta.url), "utf8");

test("Prediksi page uses monthly inventory forecast labels and API periods", () => {
  assert.match(source, /Prediksi Posisi Persediaan Bulanan/);
  assert.match(source, /Tren Posisi Persediaan/);
  assert.match(source, /Estimasi Persediaan Akhir/);
  assert.match(source, /Prediksi Model Terpilih/);
  assert.match(source, /Evaluasi Model/);
  assert.match(source, /ENDPOINTS\.inventoryForecast/);
  assert.match(source, /forecast\.forecast_periods/);
  assert.match(source, /Periode prediksi: \{selectedForecastPeriod\}/);
});

test("Prediksi page exposes success metrics, warning, and failure states", () => {
  assert.match(source, /Nama Produk/);
  assert.match(source, /Jumlah observasi/);
  assert.match(source, /model_used/);
  assert.match(source, /MAE/);
  assert.match(source, /RMSE/);
  assert.match(source, /WAPE/);
  assert.match(source, /Warning kualitas data/);
  assert.match(source, /Produk tidak eligible untuk forecasting/);
  assert.match(source, /Worker forecasting tidak tersedia/);
  assert.match(source, /Data histori belum lengkap/);
  assert.match(source, /Gagal melakukan prediksi/);
});

test("Prediksi page does not show purchase recommendation calculations", () => {
  assert.doesNotMatch(source, /stok_dibutuhkan|stokDibutuhkan|jumlah.*dibeli|harus dibeli/i);
  assert.doesNotMatch(source, /rekomendasi pengadaan|jumlah pengadaan yang disarankan/i);
  assert.doesNotMatch(source, /1 Minggu|4 Minggu|12 Minggu|Proyeksi ARIMA|Kebutuhan Stok|Prediksi Permintaan Penjualan/);
  assert.match(source, /Prediksi persediaan berada di bawah batas minimum/);
  assert.match(source, /Prediksi persediaan masih berada di atas batas minimum/);
  assert.match(source, /tidak menghitung permintaan atau jumlah pengadaan otomatis/);
});


test("Prediksi page displays forecast freshness, model candidates, backtest and indicative range", () => {
  assert.match(source, /Status hasil/);
  assert.match(source, /Kedaluwarsa/);
  assert.match(source, /Perbandingan Kandidat Model/);
  assert.match(source, /Hasil Backtesting/);
  assert.match(source, /Rentang indikatif/);
  assert.match(source, /bukan confidence interval statistik/);
});
