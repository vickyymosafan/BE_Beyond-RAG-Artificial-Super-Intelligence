# ⚡ Agentic RAG Backend Service

Sistem **Backend Agentic Retrieval-Augmented Generation (RAG)** berkinerja tinggi yang dibangun menggunakan **Cloudflare Workers**, **Hono Framework**, **Neon PostgreSQL (pgvector)**, dan arsitektur *Multi-LLM Fallback* (Google Gemini 2.0 Flash, Groq LLaMA 3.3, Cohere, OpenRouter).

---

## 🌟 Fitur Utama

- **Agentic RAG Pipeline**:
  - **HyDE & Query Expansion**: Merestrukturisasi dan memperluas varian query pengguna.
  - **Hybrid Vector & Keyword Search**: Pencarian keserupaan vektor (768-dimensi) di Neon Postgres dengan pgvector.
  - **Rerank & Multi-hop Retrieval**: Penilaian ulang chunk relevan untuk pertanyaan kompleks.
  - **Self-Critic & Corrective RAG**: Evaluasi mandiri validitas konteks dengan mekanisme *retry/regeneration* otomatis.
- **Cache Berlapis (Cloudflare KV Cache)**:
  - Cache L1 Exact & L2 Semantic untuk respon instan (~1.5 detik per query).
- **Manajemen Rate Limit (RPD & RPM)**:
  - Pelacakan kuota harian (Request Per Day) per penyedia AI menggunakan Cloudflare Durable Objects (`RateLimiterDO`).
- **Admin Management & Document Ingestion**:
  - Ekstraksi teks PDF (`unpdf`) & DOCX (`mammoth`), pembuatan chunking otomatis, dan penyimpanan vektor.
  - Otentikasi Admin terproteksi JWT (HMAC SHA-256).

---

## 🏗️ Struktur Proyek

```text
backend/
├── src/
│   ├── index.ts               # Inisialisasi utama Hono & Worker entry point
│   ├── routes/
│   │   ├── rag.ts             # Endpoints /api/rag/query & /api/rag/feedback
│   │   └── admin.ts           # Endpoints /api/admin/* (Login, Upload, Docs, Cache)
│   ├── asi/                   # Modul Pipeline Agentic Intelligence (Retrieval, Rerank, Critic)
│   ├── db/                    # Handler Database Neon Postgres & Schema Vektor
│   ├── ingestion/             # Parser Dokumen PDF/DOCX & Chunker
│   ├── middleware/            # Auth JWT & Rate Limiter Durable Objects
│   └── utils/                 # Utility Response, Embedding, & RPD Tracking
├── scripts/
│   ├── reingest_doc.mjs       # Script re-ingestion dokumen dengan vektor Gemini
│   ├── run_exhaustive_eval.mjs # Suite pengujian evaluasi otomatis 25 skenario
│   └── call_clear_cache.mjs   # Utility pembersihan KV Cache
├── wrangler.jsonc             # Konfigurasi Cloudflare Workers & Bindings
└── README.md
```

---

## 🚀 Panduan Memulai

### 1. Prasyarat
- Node.js v20+ & npm / pnpm
- Cloudflare Wrangler CLI (`npm i -g wrangler`)
- Akun Neon PostgreSQL dengan ekstensi `pgvector` aktif

### 2. Konfigurasi Environment Variables
Salin berkas `.dev.vars.example` menjadi `.dev.vars` untuk pengujian lokal:
```bash
cp .dev.vars.example .dev.vars
```

Isi kunci API yang diperlukan di `.dev.vars`:
```env
DATABASE_URL="postgresql://username:password@ep-example.neon.tech/neondb?sslmode=require"
GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"
GROQ_API_KEY="gsk_yourGroqApiKeyHere"
COHERE_API_KEY="yourCohereApiKeyHere"
OPENROUTER_API_KEY="sk-or-yourOpenRouterApiKeyHere"
JWT_SECRET="your-strong-jwt-secret-here"
```

### 3. Jalankan Server Lokal
```bash
npm run dev
```

### 4. Deploy ke Cloudflare Workers
```bash
npm run deploy
```

---

## 📑 API Endpoints Utama

### Public RAG Endpoints
- **`POST /api/rag/query`**: Mengirim pertanyaan ke RAG Agent.
- **`POST /api/rag/feedback`**: Memberikan umpan balik rating (up/down).

### Admin Endpoints (Terproteksi JWT)
- **`POST /api/admin/login`**: Otentikasi admin.
- **`GET /api/admin/documents`**: Menampilkan daftar dokumen terdaftar.
- **`POST /api/admin/documents/upload`**: Mengunggah dan melakukan *chunking/embedding* PDF/DOCX baru.
- **`DELETE /api/admin/documents/:id`**: Soft delete dokumen & pembersihan cache terkait.
- **`POST /api/admin/cache/clear`**: Membersihkan seluruh KV Cache.

---

## 🧪 Script Evaluasi & Ingestion

### Re-ingest Dokumen Pedoman
```bash
node scripts/reingest_doc.mjs
```

### Jalankan Suite Pengujian Evaluasi Komprehensif (25 Pertanyaan)
```bash
node scripts/run_exhaustive_eval.mjs
```

---

## 🔒 Lisensi & Hak Cipta
© 2026 - Portfolio Project RAG AI Agentic. All Rights Reserved.
