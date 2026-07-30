async function testGuardFix() {
  const query = 'apa syarat minimal kelulusan tugas akhir';

  console.log('================================================================');
  console.log('🛡️ TESTING TRUNCATION GUARD FIX ON LIVE WORKER API');
  console.log('Query: ' + query);
  console.log('================================================================');

  const res = await fetch('https://rag-ai-agentic.mvickymosafan.workers.dev/api/rag/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, userId: 'truncation-guard-tester' })
  }).then(r => r.json());

  console.log('\n✅ ANSWER RECEIVED:');
  console.log(res.answer);
  console.log('\nIs Truncated at "Berikut"?: ' + res.answer.trim().endsWith('Berikut'));
}

testGuardFix().catch(console.error);
