const BACKEND = 'https://rag-ai-agentic.mvickymosafan.workers.dev';

async function main() {
  console.log('--- Step 1: Sending Query 1 ---');
  const q1 = "siapa nanda ?";
  const t1Start = Date.now();
  const res1 = await fetch(`${BACKEND}/api/rag/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q1, userId: 'test-superpowers' }),
  });
  const data1 = await res1.json();
  const t1End = Date.now();

  console.log(`Q1 Status: ${res1.status} | Duration: ${t1End - t1Start}ms`);
  console.log('Q1 Answer:\n', data1.answer);
  console.log('Q1 Reasoning:', data1.reasoningPath);

  console.log('\n--- Step 2: Sending Query 2 (Semantically Equivalent) ---');
  const q2 = "siapa nih nanda kepo aku";
  const t2Start = Date.now();
  const res2 = await fetch(`${BACKEND}/api/rag/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: q2,
      userId: 'test-superpowers',
      history: [
        { role: 'user', content: q1 },
        { role: 'assistant', content: data1.answer },
      ],
    }),
  });
  const data2 = await res2.json();
  const t2End = Date.now();

  console.log(`\nQ2 Status: ${res2.status} | Duration: ${t2End - t2Start}ms`);
  console.log('Q2 Answer:\n', data2.answer);
  console.log('Q2 Reasoning:', data2.reasoningPath);

  if (data2.reasoningPath.some(r => r.includes('Cache hit'))) {
    console.log('\nSUCCESS! L2 SEMANTIC CACHE HIT IN', t2End - t2Start, 'ms!');
  } else {
    console.log('\nProcessed via RAG pipeline in', t2End - t2Start, 'ms');
  }
}

main().catch(console.error);
