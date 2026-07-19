# Inventory Forecast API

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
