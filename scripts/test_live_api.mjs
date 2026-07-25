const BACKEND = 'https://rag-ai-agentic.mvickymosafan.workers.dev';

async function main() {
  const query = "berapa batas margin atas bawah kiri kanan pada panduan ta ?";
  console.log('Sending live query to backend:', query);

  const res = await fetch(`${BACKEND}/api/rag/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      userId: 'test-user-live-verify',
    }),
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('\n=== Live API Response ===');
  console.log('Answer:\n', data.answer);
  console.log('\nConfidence:', data.confidence);
  console.log('ASI Score:', data.asiScore);
  console.log('\nReasoning Path:');
  data.reasoningPath.forEach(p => console.log('  -', p));
  console.log('\nCitations:', data.citations);
}

main().catch(console.error);
