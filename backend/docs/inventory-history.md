# Inventory History API

## GET /api/inventory-history/:produk_id

Mengambil histori persediaan bulanan dari tabel `inventory_snapshot_monthly`.
Endpoint ini tidak menggunakan `dataset_mingguan` dan tidak mengubah data hilang menjadi nol.

### Query Parameter

- `start_period` opsional, format `YYYY-MM` atau `YYYY-MM-DD`.
- `end_period` opsional, format `YYYY-MM` atau `YYYY-MM-DD`.

Contoh:

```http
GET /api/inventory-history/12?start_period=2024-01&end_period=2025-12
```

### Response

```json
{
  "produk": {
    "id": 12,
    "nama": "Aqua Botol 600 ml",
    "stok_saat_ini": 100,
    "stok_minimum": 10
  },
  "target": "ending_inventory",
  "frequency": "monthly",
  "periods": ["2024-01", "2024-02"],
  "values": [100, null],
  "observation_count": 1,
  "missing_periods": ["2024-02"]
}
```

`values` memakai `null` untuk periode hilang atau snapshot dengan `status_data = 'missing'`.

### Error

- `400` jika `produk_id`, `start_period`, atau `end_period` tidak valid.
- `404` jika produk tidak ditemukan.
- `404` jika produk tidak mempunyai histori pada rentang yang diminta.
