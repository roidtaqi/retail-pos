# Retail POS Cloud Dashboard

Server ini menerima sync dari aplikasi kasir dan menyediakan dashboard online.

## Environment

Set variabel berikut di Railway:

```bash
DATABASE_URL=postgresql://...
SYNC_TOKEN=token-rahasia-yang-sama-dengan-aplikasi-kasir
PORT=3000
```

Railway biasanya mengisi `DATABASE_URL` dan `PORT` otomatis jika service PostgreSQL sudah ditambahkan.

## Endpoint

- `GET /health`
- `GET /?token=SYNC_TOKEN`
- `GET /api/dashboard?date=YYYY-MM-DD&shift=1&token=SYNC_TOKEN`
- `POST /api/sync/events` dengan header `Authorization: Bearer SYNC_TOKEN`

## Setelah Deploy

Isi di aplikasi kasir:

- `Pengaturan > Cloud Sync URL`: URL Railway, misalnya `https://nama-app.up.railway.app`
- `Pengaturan > Cloud Sync Token`: nilai yang sama dengan `SYNC_TOKEN`

Setelah itu tekan `Sync Queue` atau tunggu sync otomatis.
