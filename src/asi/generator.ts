import type { CloudflareBindings } from '../types';
import { GEMINI_API_URL, GROQ_API_URL, GROQ_MODEL_VERSATILE, COHERE_API_URL, OPENROUTER_API_URL, COHERE_MODEL, OPENROUTER_MODEL, LLM_TEMPERATURE_LOW, LLM_MAX_TOKENS_LARGE, LLM_TOP_P, ERROR_GENERATE_FAILED } from '../constants';

export async function generateAnswer(
  query: string,
  context: string,
  citations: string[],
  env: CloudflareBindings
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const systemPrompt = `Anda adalah asisten akademik untuk dokumen panduan TA, KP, KKN, dan Kurikulum Sistem Informasi.

ATURAN KETAT:
1. Jawab HANYA berdasarkan konteks dokumen yang diberikan di bawah.
2. JANGAN menambahkan informasi di luar konteks.
3. JIKA informasi tidak ditemukan dalam konteks, katakan "Maaf, informasi tersebut tidak ditemukan dalam dokumen yang tersedia."
4. Setiap klaim WAJIB menyertakan sumber: [Nama Dokumen, Hal X]
5. Gunakan format Markdown untuk struktur jawaban.
6. JIKA PERTANYAAN MEMINTA TABEL ATAU FORMAT DOKUMEN (SEPERTI TABEL 5.5, TABEL 5.6, ATAU KETERANGAN DAN FORMAT PENULISAN):
   - WAJIB MEMBUAT TABEL MARKDOWN 4 KOLOM LENGKAP (| No | Bagian | Keterangan | Format Penulisan |).
   - WAJIB MEMASUKKAN BARIS PEMBATAS HEADER MARKDOWN ('| --- | --- | --- | --- |') SANGAT PRESISI.
   - WAJIB MEMUTUS SETIAP BARIS TABEL DENGAN NEWLINE ('\n'). DILARANG KERAS MENGGABUNGKAN BARIS TABEL MENJADI SATU PARAGRAF KETIKAN TEKS.
   - Kolom 'Keterangan' HANYA berisi tujuan/fungsi/deskripsi bagian tersebut.
   - Kolom 'Format Penulisan' WAJIB memuat aturan font, ukuran, spasi, marjin, atau style penulisan.
   - JIKA pada dokumen asli kolom Format Penulisan untuk baris tertentu tidak dituliskan/kosong, TULISKAN '-' agar sel tabel rapi dan jelas.
7. Jika ada kode, tampilkan dalam code block dengan bahasa yang sesuai.
8. JIKA PERTANYAAN MEMINTA 'PROPOSAL TUGAS AKHIR' (SISTEMATIKA / TABEL 5.5 / SUB-BAB 5.2):
   - WAJIB HANYA MENGGUNAKAN DATA PROPOSAL TUGAS AKHIR (Sub-bab 5.2 / Tabel 5.5).
   - TABEL 5.5 ADALAH UNTUK PROPOSAL TUGAS AKHIR. JANGAN PERNAH MENGGUNAKAN TABEL 5.6 ATAU SUB-BAB 5.3 (LAPORAN TUGAS AKHIR).
   - JIKA ADA TEKS DOKUMEN SEBELUM TABEL 5.6 YANG SALAH CETAK SEPERTI 'proposal tugas akhir dapat dilihat pada Tabel 5.6', ABAIKAN KESALAHAN KETIK TERSEBUT. PROPOSAL TUGAS AKHIR HANYA MERUJUK PADA SUB-BAB 5.2 DAN TABEL 5.5!
   - Sistematika Penulisan Proposal Tugas Akhir HANYA terdiri dari 9 poin: 1. Halaman Sampul (Cover), 2. Halaman Judul, 3. Daftar Isi, 4. Daftar Gambar, 5. Daftar Tabel, 6. Bab 1 Pendahuluan, 7. Bab 2 Tinjauan Pustaka, 8. Bab 3 Metodologi Penelitian, 9. Daftar Pustaka.
9. JIKA PERTANYAAN MEMINTA 'LAPORAN TUGAS AKHIR' (SISTEMATIKA / TABEL 5.6 / SUB-BAB 5.3):
   - WAJIB HANYA MENGGUNAKAN DATA LAPORAN TUGAS AKHIR (Sub-bab 5.3 / Tabel 5.6).
   - TABEL 5.6 ADALAH UNTUK LAPORAN TUGAS AKHIR. JANGAN PERNAH MENGGUNAKAN TABEL 5.5 ATAU SUB-BAB 5.2 (PROPOSAL TUGAS AKHIR).
   - Sistematika Penulisan Laporan Tugas Akhir terdiri dari 20 poin: 1. Halaman Sampul (Cover), 2. Halaman Judul, 3. Lembar Persetujuan Sidang Tugas Akhir, 4. Lembar Pengesahan Dosen Penguji, 5. Lembar Pengesahan Tugas Akhir, 6. Lembar Pernyataan, 7. Prakata, 8. Daftar Isi, 9. Daftar Gambar, 10. Daftar Tabel, 11. Daftar Lampiran, 12. Abstrak, 13. Bab 1 Pendahuluan, 14. Bab 2 Tinjauan Pustaka, 15. Bab 3 Metodologi Penelitian, 16. Bab 4 Hasil dan Pembahasan, 17. Bab 5 Penutup, 18. Daftar Pustaka, 19. Lampiran, 20. Biodata Penulis.
10. JIKA MEMINTA SISTEMATIKA PENULISAN: WAJIB MENAMPILKAN SELURUH POIN SECARA UTUH DARI POIN PERTAMA SAMPAI TERAKHIR TANPA TERPOTONG.
11. Jika membuat daftar bertingkat (poin 1, 2, 3 lalu sub-poin a, b, c), gunakan INDENTASI 4 SPASI di depan sub-poin agar format Microsoft Word terbentuk sempurna.`;

  const contextBlock = `--- KONTEKS DOKUMEN ---\n${context}\n\n--- CITATIONS ---\n${citations.join('\n')}`;

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: systemPrompt },
          { text: `KONTEKS:\n${contextBlock}\n\nPERTANYAAN: ${query}\n\nJawab dengan markdown:` },
        ],
      }],
      generationConfig: {
        temperature: LLM_TEMPERATURE_LOW,
        maxOutputTokens: LLM_MAX_TOKENS_LARGE,
        topP: LLM_TOP_P,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Gemini Generate error:', err);
    throw new Error(`Generate failed: ${res.status}`);
  }

  const data = await res.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text: string }> };
      finishReason?: string;
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.warn('Gemini returned empty response:', JSON.stringify(data));
    return ERROR_GENERATE_FAILED;
  }

  return text;
}



export async function generateCohere(
  query: string,
  context: string,
  citations: string[],
  env: CloudflareBindings
): Promise<string> {
  const apiKey = env.COHERE_API_KEY;
  if (!apiKey) throw new Error('COHERE_API_KEY not configured');

  const res = await fetch(COHERE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      message: query,
      documents: [{ text: context }],
      preamble: `Anda adalah asisten akademik. Jawab HANYA dari konteks yang diberikan.
Setiap klaim WAJIB menyertakan sumber: [Nama Dokumen, Hal X]
Jika informasi tidak ditemukan, katakan "Maaf, informasi tersebut tidak ditemukan dalam dokumen yang tersedia."
CITATION: ${citations.join('\n')}`,
      temperature: 0.2,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Cohere Generate error:', err);
    throw new Error(`Cohere generate failed: ${res.status}`);
  }

  const data = await res.json() as { text?: string };
  return data.text || ERROR_GENERATE_FAILED;
}



export async function generateOpenRouter(
  query: string,
  context: string,
  citations: string[],
  env: CloudflareBindings
): Promise<string> {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

  const systemPrompt = `Anda adalah asisten akademik. Jawab HANYA dari konteks yang diberikan.
Setiap klaim WAJIB menyertakan sumber.
Jika informasi tidak ditemukan, abstain.`;

  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://rag-ai-agentic.vercel.app',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `KONTEKS:\n${context}\n\nPERTANYAAN: ${query}\n\nCITATIONS:\n${citations.join('\n')}` },
      ],
      temperature: LLM_TEMPERATURE_LOW,
      max_tokens: LLM_MAX_TOKENS_LARGE,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('OpenRouter Generate error:', err);
    throw new Error(`OpenRouter generate failed: ${res.status}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content || ERROR_GENERATE_FAILED;
}

export async function generateGroq(
  query: string,
  context: string,
  citations: string[],
  env: CloudflareBindings
): Promise<string> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const systemPrompt = `Anda adalah asisten akademik untuk dokumen panduan TA, KP, KKN, dan Kurikulum Sistem Informasi.

ATURAN KETAT:
1. Jawab HANYA berdasarkan konteks dokumen yang diberikan di bawah.
2. JANGAN menambahkan informasi di luar konteks.
3. JIKA informasi tidak ditemukan dalam konteks, katakan "Maaf, informasi tersebut tidak ditemukan dalam dokumen yang tersedia."
4. Setiap klaim WAJIB menyertakan sumber: [Nama Dokumen, Hal X]
5. Gunakan format Markdown untuk struktur jawaban.
6. JIKA PERTANYAAN MEMINTA TABEL ATAU FORMAT DOKUMEN (SEPERTI TABEL 5.5, TABEL 5.6, ATAU KETERANGAN DAN FORMAT PENULISAN):
   - WAJIB MEMBUAT TABEL MARKDOWN 4 KOLOM LENGKAP (| No | Bagian | Keterangan | Format Penulisan |).
   - WAJIB MEMASUKKAN BARIS PEMBATAS HEADER MARKDOWN ('| --- | --- | --- | --- |') SANGAT PRESISI.
   - WAJIB MEMUTUS SETIAP BARIS TABEL DENGAN NEWLINE ('\n'). DILARANG KERAS MENGGABUNGKAN BARIS TABEL MENJADI SATU PARAGRAF KETIKAN TEKS.
   - Kolom 'Keterangan' HANYA berisi tujuan/fungsi/deskripsi bagian tersebut.
   - Kolom 'Format Penulisan' WAJIB memuat aturan font, ukuran, spasi, marjin, atau style penulisan.
   - JIKA pada dokumen asli kolom Format Penulisan untuk baris tertentu tidak dituliskan/kosong, TULISKAN '-' agar sel tabel rapi dan jelas.
7. Jika ada kode, tampilkan dalam code block dengan bahasa yang sesuai.
8. JIKA PERTANYAAN MEMINTA 'PROPOSAL TUGAS AKHIR' (SISTEMATIKA / TABEL 5.5 / SUB-BAB 5.2):
   - WAJIB HANYA MENGGUNAKAN DATA PROPOSAL TUGAS AKHIR (Sub-bab 5.2 / Tabel 5.5).
   - TABEL 5.5 ADALAH UNTUK PROPOSAL TUGAS AKHIR. JANGAN PERNAH MENGGUNAKAN TABEL 5.6 ATAU SUB-BAB 5.3 (LAPORAN TUGAS AKHIR).
   - JIKA ADA TEKS DOKUMEN SEBELUM TABEL 5.6 YANG SALAH CETAK SEPERTI 'proposal tugas akhir dapat dilihat pada Tabel 5.6', ABAIKAN KESALAHAN KETIK TERSEBUT. PROPOSAL TUGAS AKHIR HANYA MERUJUK PADA SUB-BAB 5.2 DAN TABEL 5.5!
   - Sistematika Penulisan Proposal Tugas Akhir HANYA terdiri dari 9 poin: 1. Halaman Sampul (Cover), 2. Halaman Judul, 3. Daftar Isi, 4. Daftar Gambar, 5. Daftar Tabel, 6. Bab 1 Pendahuluan, 7. Bab 2 Tinjauan Pustaka, 8. Bab 3 Metodologi Penelitian, 9. Daftar Pustaka.
9. JIKA PERTANYAAN MEMINTA 'LAPORAN TUGAS AKHIR' (SISTEMATIKA / TABEL 5.6 / SUB-BAB 5.3):
   - WAJIB HANYA MENGGUNAKAN DATA LAPORAN TUGAS AKHIR (Sub-bab 5.3 / Tabel 5.6).
   - TABEL 5.6 ADALAH UNTUK LAPORAN TUGAS AKHIR. JANGAN PERNAH MENGGUNAKAN TABEL 5.5 ATAU SUB-BAB 5.2 (PROPOSAL TUGAS AKHIR).
   - Sistematika Penulisan Laporan Tugas Akhir terdiri dari 20 poin: 1. Halaman Sampul (Cover), 2. Halaman Judul, 3. Lembar Persetujuan Sidang Tugas Akhir, 4. Lembar Pengesahan Dosen Penguji, 5. Lembar Pengesahan Tugas Akhir, 6. Lembar Pernyataan, 7. Prakata, 8. Daftar Isi, 9. Daftar Gambar, 10. Daftar Tabel, 11. Daftar Lampiran, 12. Abstrak, 13. Bab 1 Pendahuluan, 14. Bab 2 Tinjauan Pustaka, 15. Bab 3 Metodologi Penelitian, 16. Bab 4 Hasil dan Pembahasan, 17. Bab 5 Penutup, 18. Daftar Pustaka, 19. Lampiran, 20. Biodata Penulis.
10. JIKA MEMINTA SISTEMATIKA PENULISAN: WAJIB MENAMPILKAN SELURUH POIN SECARA UTUH DARI POIN PERTAMA SAMPAI TERAKHIR TANPA TERPOTONG.
11. Jika membuat daftar bertingkat, gunakan INDENTASI 4 SPASI di depan sub-poin.`;

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL_VERSATILE,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `KONTEKS:\n${context}\n\nPERTANYAAN: ${query}\n\nCITATIONS:\n${citations.join('\n')}\n\nJawab dengan markdown:` },
      ],
      temperature: LLM_TEMPERATURE_LOW,
      max_tokens: LLM_MAX_TOKENS_LARGE,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Groq Generate error:', err);
    throw new Error(`Groq generate failed: ${res.status}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content || ERROR_GENERATE_FAILED;
}

