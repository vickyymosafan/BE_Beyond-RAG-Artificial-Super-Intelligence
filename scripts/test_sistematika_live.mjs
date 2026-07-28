const WORKER_URL = 'https://rag-ai-agentic.mvickymosafan.workers.dev/api/rag/query';

async function testSistematika() {
  console.log('--- Testing query: "berikan sistematika penulisan laporan tugas akhir" ---');
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'berikan sistematika penulisan laporan tugas akhir',
      userId: 'test_user_sistematika',
    }),
  });

  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Answer:\n', data.answer);
  console.log('\nReasoning:', data.reasoningPath);
}

testSistematika().catch(console.error);
