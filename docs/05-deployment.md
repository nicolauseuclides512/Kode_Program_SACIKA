# Deployment SACIKA

## Komponen

- Frontend React/Vite.
- Backend Express.
- Worker Flask/Python.
- PostgreSQL.

## Konfigurasi produksi

Backend:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/sacika
JWT_SECRET=SECRET_PRODUKSI
CORS_ALLOWED_ORIGINS=https://domain-frontend.example
FORECAST_WORKER_URL=http://worker-private:5000
FORECAST_WORKER_API_KEY=SHARED_SECRET
TRUST_PROXY=1
REQUEST_LOG_ENABLED=true
```

Worker:

```env
PORT=5000
FORECAST_WORKER_API_KEY=SHARED_SECRET_YANG_SAMA
FORECAST_MIN_OBSERVATIONS=18
FORECAST_MIN_SALES_OBSERVATIONS=12
FORECAST_MAX_HORIZON=3
```

Frontend:

```env
VITE_API_URL=https://api.example/api
```

## Build

```powershell
cd frontend
npm ci
npm run test:all
npm run lint
npm run build
npm start
```

```powershell
cd backend
npm ci
npm test
npm run db:migrate
npm run db:check
npm start
```

```powershell
cd sacika-worker
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python app.py
```

## Keamanan

- Jangan commit `.env`.
- Worker sebaiknya berada pada jaringan privat.
- Gunakan HTTPS pada reverse proxy.
- Batasi akses PostgreSQL hanya dari backend.
- Rotasi secret yang pernah terekspos.
- Backup database sebelum migration.
- Jalankan database dengan akun aplikasi non-superuser pada produksi.

## Operasi berkala

1. Catat transaksi setiap hari.
2. Bentuk snapshot akhir bulan dengan `snapshot:monthly`.
3. Jalankan evaluasi aktual forecast.
4. Jalankan batch forecast untuk produk eligible.
5. Periksa hasil stale dan `db:check`.
6. Backup database secara terjadwal.

## Pipeline legacy

Endpoint `/api/dataset/aggregate` dan tabel `dataset_mingguan` hanya dipertahankan untuk kompatibilitas. Gunakan `/api/sales/aggregate` dan `penjualan_bulanan` untuk agregasi bulanan baru.
