import fs from 'fs';

const devVars = fs.readFileSync('d:\\portfolio-project-2026\\rag-ai-agentic\\backend\\.dev.vars', 'utf8');
const groqKey = devVars.match(/GROQ_API_KEY=(.+)/)?.[1]?.trim();

async function testTableColumns() {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const systemPrompt = `Anda adalah asisten akademik.
ATURAN KETAT TABEL 5.6:
Setiap baris WAJIB memiliki 4 KOLOM (| No | Bagian | Keterangan | Format Penulisan |).
- Kolom 'Keterangan': HANYA berisi deskripsi/tujuan/fungsi bagian tersebut.
- Kolom 'Format Penulisan': WAJIB memuat aturan font, ukuran, spasi, marjin, atau gaya penulisan (seperti Times New Roman, 12pt, 1 spasi, bold, dll).
DILARANG KERAS membiarkan kolom 'Format Penulisan' kosong, dan DILARANG menggabungkan aturan format penulisan ke dalam kolom Keterangan!`;

  const sampleChunk = `
18 Daftar Pustaka Berisi semua referensi yang diacu dalam proposal tugas akhir. Judul halaman diketik menggunakan huruf kapital, bold, font Times New Roman, ukuran 12pt dan tidak diakhiri dengan titik. Jarak antara judul halaman dengan baris pertama isi halaman adalah 1x enter. Jarak antar baris pada isi halaman adalah 1 spasi. Penulisan daftar pustaka diketik menggunakan APA style.
19 Lampiran Pada bagian lampiran dapat berisi biodata penulis, hasil-hasil perhitungan yang berkaitan dengan proyek. Diketik menggunakan huruf font Times New Roman, ukuran 12pt.
  `;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Sajikan data berikut dalam tabel 4 kolom (No, Bagian, Keterangan, Format Penulisan):\n${sampleChunk}` },
      ],
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });

  const data = await res.json();
  console.log('Result:\n', data.choices?.[0]?.message?.content);
}

testTableColumns().catch(console.error);
