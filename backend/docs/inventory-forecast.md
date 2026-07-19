# Inventory Forecast API

Forecast inventory memprediksi posisi persediaan akhir bulan berikutnya.
Hasilnya bukan prediksi penjualan, bukan prediksi permintaan, dan bukan
rekomendasi jumlah pembelian.

## POST /api/forecast/inventory/:produk_id

Membuat forecast persediaan bulanan dari `inventory_snapshot_monthly`.
Endpoint ini tidak membaca `dataset_mingguan` dan tidak menghitung rekomendasi pembelian.

Request body opsional:

```json
{
  "horizon": 1
}
```

Ketentuan:

- `target` selalu `ending_inventory`.
- `frequency` selalu `monthly`.
- `horizon` default `1` dan maksimum sementara `3`;
- histori valid minimal 18 observasi, jika kurang response `422`;
- backend mengirim `periods` dan `values` langsung ke worker Flask `POST /predict`;
- URL worker dibaca dari `FORECAST_WORKER_URL` atau `WORKER_URL`;
- timeout worker dibaca dari `FORECAST_WORKER_TIMEOUT_MS`.

Contoh response:

```json
{
  "product_id": 1,
  "target": "ending_inventory",
  "frequency": "monthly",
  "model_used": "SES",
  "forecast_periods": ["2026-01"],
  "forecast_values": [85],
  "evaluation": {
    "mae": 10.2,
    "rmse": 12.4,
    "wape": 15.6,
    "test_points": 6
  },
  "candidate_models": [
    {
      "model": "Naive",
      "status": "success",
      "mae": 12
    }
  ],
  "backtest": [
    {
      "period": "2025-07",
      "actual": 100,
      "predicted": 95
    }
  ],
  "warning": null
}
```

## GET /api/forecast/inventory/:produk_id/latest

Mengambil hasil forecast inventory terbaru dari `forecast_result`.

## GET /api/forecast/inventory-risk

Mengambil ringkasan risiko prediksi persediaan bulan berikutnya dari hasil
`forecast_result` terbaru yang valid. Endpoint ini tidak menghitung rata-rata
transaksi dan tidak membaca `dataset_mingguan`.

Contoh response:

```json
[
  {
    "produk_id": 1,
    "nama_produk": "Aqua Botol 600 ml",
    "forecast_period": "2026-01",
    "forecast_value": 45,
    "stok_minimum": 60,
    "risk": "high",
    "model_used": "SES"
  }
]
```

## GET /api/forecast/sales/:produk_id/readiness

Mengambil status kesiapan data untuk target `monthly_sales`. Sumber data hanya
`penjualan_bulanan`, yaitu agregasi transaksi keluar aktual. Endpoint ini tidak
menjalankan model forecasting dan tidak mencampur target dengan
`ending_inventory`.

Aturan status:

- `< 6` bulan: `insufficient_data`;
- `6-11` bulan: `experimental`;
- `12-23` bulan: `eligible_basic`;
- `>= 24` bulan: `eligible_full`.

Contoh response:

```json
{
  "target": "monthly_sales",
  "observation_count": 8,
  "status": "experimental",
  "message": "Prediksi penjualan belum diaktifkan karena histori belum mencukupi."
}
```

## Model dan Evaluasi

Worker membandingkan Naive, Single Exponential Smoothing, Damped Holt, dan
ARIMA sederhana dengan order terbatas. Evaluasi memakai rolling-origin
validation dengan MAE, RMSE, dan WAPE. Sistem tidak memakai `100 - MAPE`
sebagai akurasi.
