# Instalasi SACIKA di Windows

## 1. Prasyarat

- Windows 10/11 64-bit.
- Git.
- Node.js LTS dan npm.
- Python 3.11–3.13.
- PostgreSQL 16 atau 17 beserta `psql`.

Verifikasi melalui PowerShell:

```powershell
node --version
npm --version
python --version
psql --version
git --version
```

Jika PowerShell memblokir `npm.ps1`, jalankan `npm.cmd` atau atur kebijakan untuk pengguna saat ini:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 2. Clone repository

```powershell
git clone https://github.com/nicolauseuclides512/Kode_Program_SACIKA.git
cd Kode_Program_SACIKA
```

## 3. Buat database

```powershell
psql -U postgres -h localhost -p 5432 -d postgres
```

```sql
CREATE DATABASE sacika;
CREATE DATABASE sacika_test;
\q
```

Database `sacika_test` hanya untuk integration test. Jangan mengarahkannya ke database utama.

## 4. Konfigurasi backend

```powershell
Copy-Item backend\.env.example backend\.env
```

Isi sekurang-kurangnya:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/sacika
TEST_DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/sacika_test
JWT_SECRET=SECRET_ACAK_MINIMAL_32_KARAKTER
JWT_EXPIRES_IN=1d
CORS_ALLOWED_ORIGINS=http://localhost:5173
FORECAST_WORKER_URL=http://localhost:5000
FORECAST_WORKER_API_KEY=SHARED_SECRET_WORKER
ADMIN_NAME=Administrator SACIKA
ADMIN_USERNAME=admin
ADMIN_PASSWORD=PASSWORD_ADMIN_KUAT
```

Buat secret acak:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 5. Konfigurasi worker

```powershell
Copy-Item sacika-worker\.env.example sacika-worker\.env
```

Gunakan `FORECAST_WORKER_API_KEY` yang sama dengan backend.

## 6. Instal dependency

```powershell
cd backend
npm install
cd ..\frontend
npm install
cd ..\sacika-worker
python -m pip install -r requirements.txt
```

## 7. Siapkan database aplikasi

```powershell
cd ..\backend
npm run db:migrate
npm run db:seed
npm run db:check
```

## 8. Jalankan tiga layanan

Terminal 1:

```powershell
cd sacika-worker
python app.py
```

Terminal 2:

```powershell
cd backend
npm run dev
```

Terminal 3:

```powershell
cd frontend
npm run dev
```

Akses frontend di `http://localhost:5173`.
