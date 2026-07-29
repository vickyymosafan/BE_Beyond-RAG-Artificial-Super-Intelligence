import fs from 'fs';

const devVars = fs.readFileSync('d:\\portfolio-project-2026\\rag-ai-agentic\\backend\\.dev.vars', 'utf8');
const groqKey = devVars.match(/GROQ_API_KEY=(.+)/)?.[1]?.trim();

console.log('Testing GROQ_API_KEY:', groqKey?.slice(0, 10) + '...');

async function testGroqGenerate() {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Anda adalah asisten akademik. Buat tabel markdown lengkap untuk 19 bagian laporan Tugas Akhir (Tabel 5.6).' },
        { role: 'user', content: 'Tampilkan tabel 5.6 lengkap 19 baris (Halaman Sampul, Halaman Judul, Lembar Persetujuan, Lembar Pengesahan Penguji, Lembar Pengesahan TA, Lembar Pernyataan, Prakata, Daftar Isi, Daftar Gambar, Daftar Tabel, Daftar Lampiran, Abstrak, Bab 1-5, Daftar Pustaka, Lampiran, Biodata Penulis) dengan kolom No, Bagian, Keterangan, Format Penulisan.' },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });

  console.log('Status:', res.status);
  const data = await res.json();
  if (res.ok) {
    const text = data.choices?.[0]?.message?.content;
    console.log('Generated text length:', text?.length);
    console.log('Generated text preview:\n', text?.slice(0, 1000));
    console.log('\nGenerated text end:\n', text?.slice(-500));
  } else {
    console.error('Error:', data);
  }
}

testGroqGenerate().catch(console.error);
