# Backend storage setup: Neon + R2

Project ini sudah diposisikan agar database dan file besar tidak disimpan permanen di disk lokal.

## 1. Upload/PDF lokal

Upload diproses dari `File`/memory di Worker. Audit kode backend menemukan tidak ada pemakaian `fs.writeFile` atau `createWriteStream` untuk menyimpan PDF/upload permanen ke local disk.

File asli disimpan ke R2 kalau binding `R2_IMAGES` tersedia:

- raw upload: `raw/<docId>/<filename>`
- gambar DOCX: `images/<docId>/<imageId>`

Kalau R2 belum tersedia, backend tetap jalan tetapi file asli/gambar dilewati dan tidak disimpan lokal.

## 2. Neon database

Backend sudah memakai Neon driver:

```ts
import { neon } from '@neondatabase/serverless';
const sql = neon(env.DATABASE_URL);
```

Schema `migrations/001_init.sql` adalah PostgreSQL + pgvector, cocok untuk Neon:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
embedding vector(768);
tsvector;
GIN;
ivfflat;
```

Buat `.dev.vars` dari contoh:

```cmd
copy .dev.vars.example .dev.vars
```

Isi `DATABASE_URL` dengan pooled connection string dari Neon:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require"
```

Jalankan migration ke Neon memakai connection string kamu, contoh jika punya `psql`:

```cmd
psql "postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require" -f migrations/001_init.sql
```

## 3. Cloud storage untuk file asli/gambar

Untuk sekarang R2 dinonaktifkan karena belum di-enable di akun Cloudflare. `wrangler.jsonc` memakai:

```jsonc
"r2_buckets": []
```

Backend tetap aman: kalau `R2_IMAGES` tidak ada, file asli/gambar dilewati dan tidak disimpan lokal.

Kalau nanti mau aktifkan R2, ubah `wrangler.jsonc` menjadi:

```jsonc
"r2_buckets": [
  {
    "binding": "R2_IMAGES",
    "bucket_name": "rag-ai-agentic-images"
  }
]
```

Lalu buat bucket sekali saja:

```cmd
npx wrangler r2 bucket create rag-ai-agentic-images
```

Untuk deploy:

```cmd
npx wrangler secret put DATABASE_URL
npx wrangler deploy
```

## 4. Validasi lokal

```cmd
cd /d D:\portfolio-project-2026\rag-ai-agentic\backend
npx tsc --noEmit
npx wrangler dev
```

Catatan: `.dev.vars` berisi secret, jangan commit file itu.
