const WORKER_URL = 'https://rag-ai-agentic.mvickymosafan.workers.dev/api/rag/query';

async function testPenomoran() {
  console.log('--- Testing query: "berikan detail penomoran halaman di panduan ta" ---');
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'berikan detail penomoran halaman di panduan ta',
      userId: 'test_user_penomoran',
    }),
  });

  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Answer:\n', data.answer);
  console.log('\nReasoning:', data.reasoningPath);
}

testPenomoran().catch(console.error);
