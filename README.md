# ⚡ Agentic RAG Backend Service

Sistem **Backend Agentic Retrieval-Augmented Generation (RAG)** cerdas berbasis kecerdasan buatan (AI) yang dirancang untuk menyajikan pencarian dan pemrosesan dokumen akademik secara cepat, presisi, dan terverifikasi.

---

## 📄 Deskripsi Sistem

Backend ini bertindak sebagai otak pemroses utama (*core AI engine*) dalam arsitektur RAG Agentic. Sistem memanfaatkan kombinasi pencarian keserupaan vektor (*vector similarity search*) dan pemrosesan bahasa alami cerdas (*Natural Language Processing*) untuk memahami konteks pertanyaan pengguna, mencari informasi yang paling relevan dari basis pengetahuan dokumen, serta memvalidasi kebenaran jawaban guna mencegah halusinasi informasi.

---

## ✨ Fitur-Fitur Utama

- **Agentic Multi-Step Reasoning**:
  - Pemrosesan dan perbaikan otomatis terhadap kalimat pertanyaan (*Query Expansion & Rewriting*).
  - Pencarian kontekstual bertingkat (*Multi-Hop Retrieval*) untuk menangani pertanyaan yang kompleks dan membutuhkan penalaran mendalam.
  - Penilaian ulang relevansi (*Reranking*) guna memastikan chunk informasi berakurasi tertinggi yang digunakan oleh AI.

- **Self-Critic & Corrective RAG**:
  - Evaluasi mandiri terhadap validitas konteks dokumen (*Grounding Validation*).
  - Mekanisme perbaikan otomatis (*Auto-Correction & Regeneration*) jika jawaban awal belum memenuhi standar akurasi yang ketat.

- **Pencarian Keserupaan Vektor Berpresisi Tinggi**:
  - Pengubahan teks dokumen menjadi representasi vektor berdimensi tinggi (768-dimensi) untuk mendukung pencarian semantik instan.

- **Respon Instan dengan Caching Berlapis**:
  - Sistem pencarian berbasis *Cache* cerdas untuk memberikan jawaban dalam hitungan detik untuk pertanyaan yang sering diajukan.

- **Multi-LLM Fallback Architecture**:
  - Integrasi dengan berbagai penyedia model kecerdasan buatan (*Large Language Models*) terkemuka untuk menjamin ketersediaan sistem tanpa henti (*high availability*).

- **Keamanan & Pengelolaan Dokumen**:
  - Pemrosesan dan ekstraksi teks dari berbagai format dokumen (PDF & DOCX).
  - Proteksi otentikasi ketat dan pembatasan laju lalu lintas (*Rate Limiting*) untuk menjaga stabilitas server.

---

## 🛠️ Teknologi Utama

- **Runtime & Architecture**: Cloudflare Workers (Serverless Edge Computing)
- **Framework**: Hono Framework
- **Vector Database**: Neon PostgreSQL (pgvector)
- **AI Models**: Google Gemini, Groq LLaMA, Cohere, OpenRouter
