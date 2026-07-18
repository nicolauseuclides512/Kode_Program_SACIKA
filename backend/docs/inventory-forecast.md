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
