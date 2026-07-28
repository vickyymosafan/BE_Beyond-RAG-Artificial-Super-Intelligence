const WORKER_URL = 'https://rag-ai-agentic.mvickymosafan.workers.dev/api/rag/query';

async function testTable() {
  console.log('--- Testing query: "tampilkan tabel 5.6 keterangan dan format penulisan tiap bagian laporan tugas akhir" ---');
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'tampilkan tabel 5.6 keterangan dan format penulisan tiap bagian laporan tugas akhir',
      userId: 'test_user_table',
    }),
  });

  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Answer:\n', data.answer);
  console.log('\nReasoning:', data.reasoningPath);
}

testTable().catch(console.error);
