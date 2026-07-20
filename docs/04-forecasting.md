# Forecasting SACIKA

## Target 1: posisi persediaan akhir bulan

Target `ending_inventory` memakai `inventory_snapshot_monthly`. Hasilnya adalah estimasi posisi persediaan akhir bulan dan hanya menjadi peringatan risiko terhadap `stok_minimum`.

Syarat utama:

- sekurang-kurangnya 18 bulan kontinu;
- periode berurutan tanpa gap;
- horizon 1–3 bulan;
- model kandidat Naive, SES, Damped Holt, dan ARIMA sederhana.

```http
POST /api/forecast/inventory/:produk_id
GET  /api/forecast/inventory/:produk_id/latest
POST /api/forecast/inventory/batch
GET  /api/forecast/inventory-risk
```

Model selain Naive dipilih hanya jika peningkatan MAE memenuhi ambang minimum. Hasil menyimpan `data_cutoff`, status `current/stale/superseded`, kandidat model, backtest, dan rentang indikatif berbasis MAE.

Hasil tidak menghitung jumlah pengadaan. Keputusan pembelian tetap membutuhkan kebijakan stok, lead time, pesanan berjalan, anggaran, dan validasi pengelola.

## Target 2: transaksi keluar bulanan aktual

Target `monthly_sales` terpisah dari histori persediaan. Data dibangun dari transaksi `jenis_transaksi='keluar'` yang benar-benar tercatat di aplikasi.

```http
GET  /api/forecast/sales/:produk_id/history
GET  /api/forecast/sales/:produk_id/readiness
POST /api/forecast/sales/:produk_id/preview
```

Pratinjau hanya tersedia untuk administrator dan diberi status eksperimental. Minimum awal adalah 12 bulan lengkap; 24 bulan atau lebih dikategorikan siap evaluasi penuh. Bulan tanpa transaksi di antara awal dan akhir histori diperlakukan sebagai penjualan 0, sedangkan bulan berjalan dikeluarkan secara default karena belum lengkap.

Pratinjau `monthly_sales` tidak ditampilkan sebagai rekomendasi pengadaan dan belum menjadi fitur operasional utama.

## Worker

Worker menerima `periods` dan `values` langsung dari backend. Shared API key wajib sama pada backend dan worker.

```env
FORECAST_WORKER_API_KEY=
FORECAST_MIN_OBSERVATIONS=18
FORECAST_MIN_SALES_OBSERVATIONS=12
FORECAST_MAX_HORIZON=3
```
