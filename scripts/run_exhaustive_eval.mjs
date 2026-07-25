import fs from 'fs';
import path from 'path';

const BACKEND = 'https://rag-ai-agentic.mvickymosafan.workers.dev';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TEST_QUESTIONS = [
  {
    id: 1,
    topic: 'Margin Kertas',
    query: 'Berapa batas margin atas, bawah, kiri, dan kanan pada panduan TA?',
    expectedKeywords: ['4 cm', '3 cm', 'kiri', 'kanan', 'atas', 'bawah'],
  },
  {
    id: 2,
    topic: 'Kertas & Font',
    query: 'Berapa ukuran kertas dan jenis font yang digunakan untuk laporan TA?',
    expectedKeywords: ['A4', 'Times New Roman', '12pt', '12 pt'],
  },
  {
    id: 3,
    topic: 'Spasi Tulisan',
    query: 'Berapa spasi antarbaris untuk pengetikan uraian bab dan subbab TA?',
    expectedKeywords: ['1,5', '1.5', 'spasi'],
  },
  {
    id: 4,
    topic: 'Jumlah Bimbingan',
    query: 'Berapa minimal jumlah bimbingan dengan dosen pembimbing sebelum sidang TA?',
    expectedKeywords: ['8', 'bimbingan'],
  },
  {
    id: 5,
    topic: 'Syarat Minimal SKS TA',
    query: 'Berapa minimal SKS yang harus ditempuh mahasiswa untuk syarat menempuh TA dan Yudisium?',
    expectedKeywords: ['144', 'SKS'],
  },
  {
    id: 6,
    topic: 'Nilai Minimal Sidang',
    query: 'Berapa nilai rata-rata minimal dari dosen pembimbing dan penguji untuk lulus sidang TA?',
    expectedKeywords: ['70', 'nilai'],
  },
  {
    id: 7,
    topic: 'Batas Waktu Revisi Sempro',
    query: 'Berapa batas waktu pengerjaan revisi proposal TA setelah sempro?',
    expectedKeywords: ['1 bulan', 'bulan'],
  },
  {
    id: 8,
    topic: 'Batas Waktu Semhas ke Sidang',
    query: 'Berapa batas waktu maksimal antara pelaksanaan seminar hasil TA ke sidang TA?',
    expectedKeywords: ['1 bulan', 'bulan'],
  },
  {
    id: 9,
    topic: 'Peserta Seminar Proposal',
    query: 'Berapa minimal mahasiswa audience yang wajib hadir pada seminar proposal TA?',
    expectedKeywords: ['10', 'mahasiswa', 'peserta'],
  },
  {
    id: 10,
    topic: 'Peserta Seminar Hasil',
    query: 'Berapa minimal mahasiswa audience yang wajib hadir pada seminar hasil TA?',
    expectedKeywords: ['10', 'mahasiswa', 'peserta'],
  },
  {
    id: 11,
    topic: 'Durasi Presentasi Sempro',
    query: 'Berapa maksimal durasi waktu presentasi mahasiswa saat seminar proposal TA?',
    expectedKeywords: ['15', 'menit'],
  },
  {
    id: 12,
    topic: 'Durasi Presentasi Semhas',
    query: 'Berapa maksimal durasi waktu presentasi mahasiswa saat seminar hasil TA?',
    expectedKeywords: ['15', 'menit'],
  },
  {
    id: 13,
    topic: 'Penggantian Pembimbing',
    query: 'Apa saja alasan yang membolehkan penggantian dosen pembimbing TA?',
    expectedKeywords: ['berhalangan', '1 bulan', 'bimbingan', 'konflik'],
  },
  {
    id: 14,
    topic: 'Format Judul Gambar',
    query: 'Berapa ukuran font dan jenis font yang digunakan untuk nomor dan judul gambar pada TA?',
    expectedKeywords: ['Times New Roman', '11'],
  },
  {
    id: 15,
    topic: 'Format Judul Tabel',
    query: 'Berapa ukuran font dan jenis font yang digunakan untuk nomor dan judul tabel pada TA?',
    expectedKeywords: ['Times New Roman', '11'],
  },
  {
    id: 16,
    topic: 'Posisi Judul Tabel',
    query: 'Di mana posisi nomor dan judul tabel diletakkan?',
    expectedKeywords: ['atas', 'tabel'],
  },
  {
    id: 17,
    topic: 'Posisi Judul Gambar',
    query: 'Di mana posisi nomor dan judul gambar diletakkan?',
    expectedKeywords: ['bawah', 'gambar'],
  },
  {
    id: 18,
    topic: 'Sampul Laporan TA',
    query: 'Warna sampul atau cover apa yang digunakan untuk penjilidan laporan akhir TA?',
    expectedKeywords: ['hardcover', 'putih'],
  },
  {
    id: 19,
    topic: 'Sampul Proposal TA',
    query: 'Warna sampul apa yang digunakan untuk proposal TA?',
    expectedKeywords: ['mika', 'putih', 'softcover'],
  },
  {
    id: 20,
    topic: 'Syarat Yudisium',
    query: 'Apa saja persyaratan yang harus dipenuhi mahasiswa untuk dapat mengikuti yudisium?',
    expectedKeywords: ['144', 'lulus', 'SKS', 'foto'],
  },
  {
    id: 21,
    topic: 'Peran Pembimbing 1 vs 2',
    query: 'Apa perbedaan fokus tanggung jawab antara Pembimbing 1 dan Pembimbing 2 pada TA?',
    expectedKeywords: ['pembimbing 1', 'pembimbing 2', 'rumusan', 'sistematika'],
  },
  {
    id: 22,
    topic: 'Pakaian Seminar',
    query: 'Bagaimana pakaian yang wajib dikenakan mahasiswa saat seminar proposal atau hasil TA?',
    expectedKeywords: ['putih', 'hitam', 'almamater'],
  },
  {
    id: 23,
    topic: 'Hasil Keputusan Sempro',
    query: 'Apa saja hasil keputusan yang mungkin diberikan pada seminar proposal TA?',
    expectedKeywords: ['disetujui', 'revisi', 'tidak disetujui'],
  },
  {
    id: 24,
    topic: 'Font Halaman Sampul',
    query: 'Berapa ukuran font yang digunakan untuk jenis dokumen dan judul pada halaman sampul?',
    expectedKeywords: ['14', 'Times New Roman'],
  },
  {
    id: 25,
    topic: 'Spasi Halaman Sampul',
    query: 'Berapa jarak antarbaris pada halaman sampul?',
    expectedKeywords: ['1', 'spasi'],
  },
];

async function testSingleQuery(item) {
  console.log(`\n==================================================`);
  console.log(`Test #${item.id} [${item.topic}]: "${item.query}"`);
  
  try {
    const start = Date.now();
    const res = await fetch(`${BACKEND}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: item.query, userId: `eval-user-${item.id}` }),
    });

    const elapsed = Date.now() - start;
    if (!res.ok) {
      console.error(`HTTP Error ${res.status}`);
      return { ...item, status: 'FAIL_HTTP', elapsed, answer: 'HTTP Error', isAccurate: false };
    }

    const data = await res.json();
    const answer = data.answer || '';
    const citations = data.citations || [];
    const reasoningPath = data.reasoningPath || [];

    // Check if expected keywords are present in answer
    const answerLower = answer.toLowerCase();
    const matchedKeywords = item.expectedKeywords.filter(kw => answerLower.includes(kw.toLowerCase()));
    const matchRatio = matchedKeywords.length / item.expectedKeywords.length;
    const isAccurate = matchRatio >= 0.5 && !answer.includes('Maaf');

    console.log(`Time: ${elapsed}ms | Accurate: ${isAccurate ? '✅ YES' : '❌ NO'} (Match: ${matchedKeywords.length}/${item.expectedKeywords.length})`);
    console.log(`Answer:\n${answer.slice(0, 300)}...`);
    if (citations.length > 0) {
      console.log(`Citations: Page ${citations.map(c => c.page).join(', ')}`);
    }

    return {
      ...item,
      status: isAccurate ? 'PASS' : 'FAIL',
      elapsed,
      answer,
      citations,
      matchedKeywords,
      isAccurate,
    };
  } catch (err) {
    console.error('Error:', err.message);
    return { ...item, status: 'FAIL_ERROR', elapsed: 0, answer: err.message, isAccurate: false };
  }
}

async function main() {
  console.log(`Starting Exhaustive Evaluation of ${TEST_QUESTIONS.length} Questions against Panduan TA SI 2026 RAG System...`);
  
  const results = [];
  for (const q of TEST_QUESTIONS) {
    const res = await testSingleQuery(q);
    results.push(res);
    await sleep(3000); // 3s delay between queries to respect API rate limits
  }

  const passedCount = results.filter(r => r.isAccurate).length;
  const totalCount = results.length;
  const accuracyPercentage = ((passedCount / totalCount) * 100).toFixed(1);

  console.log(`\n==================================================`);
  console.log(`EXHAUSTIVE EVALUATION COMPLETED`);
  console.log(`Total Questions Tested: ${totalCount}`);
  console.log(`Passed / Accurate: ${passedCount}`);
  console.log(`Failed / Abstain: ${totalCount - passedCount}`);
  console.log(`Accuracy Score: ${accuracyPercentage}%`);

  const reportPath = path.join(process.cwd(), 'evaluation_results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ summary: { total: totalCount, passed: passedCount, accuracyPercentage }, results }, null, 2));
  console.log(`Saved evaluation results to ${reportPath}`);
}

main().catch(console.error);
