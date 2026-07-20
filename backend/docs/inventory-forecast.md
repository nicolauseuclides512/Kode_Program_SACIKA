# Inventory Forecast API

Forecast inventory memprediksi posisi persediaan akhir bulan. Hasilnya bukan
prediksi penjualan, bukan prediksi permintaan, dan bukan rekomendasi jumlah
pembelian.

## Struktur penyimpanan

Metadata satu proses pemodelan disimpan pada `forecast_run`:

- produk dan target;
- model terpilih;
- cutoff data;
- MAE, RMSE, WAPE, dan jumlah titik uji;
- seluruh kandidat model;
- warning;
- status freshness: `current`, `stale`, atau `superseded`.

Nilai per periode disimpan pada `forecast_result`. Fold rolling-origin disimpan
pada `forecast_backtest`. Ketika snapshot aktual untuk periode prediksi tersedia,
`forecast_result` menyimpan nilai aktual dan realized error.

## POST /api/forecast/inventory/:produk_id

Membuat forecast persediaan bulanan dari `inventory_snapshot_monthly`.

```json
{
  "horizon": 1
}
```

Ketentuan:

- `target` selalu `ending_inventory`;
- `frequency` selalu `monthly`;
- horizon default 1 dan maksimum 3;
- minimal 18 observasi bulanan kontinu;
- worker menerima `periods` dan `values` secara langsung;
- hasil sebelumnya berstatus `current` atau `stale` diubah menjadi `superseded`;
- hasil baru disimpan sebagai satu `forecast_run`.

Contoh bagian response:

```json
{
  "forecast_run_id": 50,
  "product_id": 1,
  "target": "ending_inventory",
  "frequency": "monthly",
  "model_used": "SES",
  "data_cutoff": "2025-12",
  "freshness": "current",
  "forecast_periods": ["2026-01"],
  "forecast_values": [85],
  "forecast_ranges": [
    {
      "period": "2026-01",
      "lower_bound": 74.8,
      "upper_bound": 95.2
    }
  ],
  "evaluation": {
    "mae": 10.2,
    "rmse": 12.4,
    "wape": 15.6,
    "test_points": 6
  },
  "candidate_models": [],
  "backtest": [],
  "warning": null
}
```

`forecast_ranges` dihitung dari nilai prediksi ± MAE historis. Nilai tersebut
adalah rentang indikatif, bukan confidence interval statistik.

## POST /api/forecast/inventory/batch

Khusus administrator. Menjalankan forecast untuk semua produk aktif yang
eligible atau subset `product_ids`.

```json
{
  "horizon": 1,
  "concurrency": 2,
  "product_ids": [1, 2, 3]
}
```

Batas concurrency adalah 5 dan maksimum produk dalam satu batch adalah 500.
Kegagalan satu produk tidak membatalkan hasil produk lain.

Perintah CLI setara:

```powershell
npm run forecast:eligible-products -- --horizon 1 --concurrency 2
```

Subset produk:

```powershell
npm run forecast:eligible-products -- --product-ids "1,2,3"
```

## GET /api/forecast/inventory/:produk_id/latest

Mengambil `forecast_run` terbaru beserta:

- nilai forecast;
- rentang indikatif;
- kandidat model;
- backtest;
- jumlah titik uji;
- realized evaluation jika data aktual sudah tersedia;
- freshness hasil.

Status freshness:

- `current`: cutoff sama dengan snapshot valid terbaru;
- `stale`: terdapat snapshot lebih baru daripada cutoff;
- `superseded`: hasil telah digantikan forecast run baru.

## GET /api/forecast/inventory-risk

Mengambil risiko produk dari run `current`, atau run `stale` terbaru ketika
belum ada run current. Response mencantumkan freshness, cutoff, dan rentang
indikatif agar dashboard tidak menampilkan hasil lama seolah-olah masih baru.

## POST /api/forecast/inventory/evaluate-actuals

Khusus administrator. Membandingkan hasil forecast yang tersimpan dengan
snapshot aktual pada periode yang sama.

```json
{
  "period": "2026-01",
  "recalculate": false
}
```

Default hanya mengevaluasi hasil yang belum pernah dievaluasi. Gunakan
`recalculate=true` untuk menghitung ulang.

Perintah CLI:

```powershell
npm run forecast:evaluate-actuals -- --period 2026-01
```

Proses snapshot bulanan dengan `--commit` juga menjalankan evaluasi pending
untuk periode snapshot tersebut.

## GET /api/forecast/sales/:produk_id/readiness

Mengambil status kesiapan target `monthly_sales`. Sumbernya hanya
`penjualan_bulanan` dari transaksi keluar aktual. Target ini tetap terpisah dari
`ending_inventory`.

## Model dan evaluasi

Worker membandingkan Naive, SES, Damped Holt, dan ARIMA sederhana menggunakan
rolling-origin validation. Pemilihan menggunakan MAE, dengan RMSE sebagai
pembanding ketika MAE sangat dekat. WAPE tetap dilaporkan. Sistem tidak memakai
`100 - MAPE` sebagai akurasi.
