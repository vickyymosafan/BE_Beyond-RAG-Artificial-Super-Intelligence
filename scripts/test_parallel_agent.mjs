import { neon } from '@neondatabase/serverless';

const DATABASE_URL = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function testParallelAgent() {
  const query = 'Apa saja syarat pendaftaran seminar proposal Tugas Akhir SI? (Parallel Agent Check ' + Date.now() + ')';
  
  console.log('================================================================');
  console.log('🚀 STEP 1: SENDING REQUEST TO LIVE CHAT API ENDPOINT');
  console.log('Endpoint: https://rag-ai-agentic.mvickymosafan.workers.dev/api/rag/query');
  console.log('Query:    ' + query);
  console.log('================================================================');
  
  const t1 = Date.now();
  const res = await fetch('https://rag-ai-agentic.mvickymosafan.workers.dev/api/rag/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, userId: 'parallel-agent-checker' })
  }).then(r => r.json());
  const dur = Date.now() - t1;
  
  console.log('\n✅ MAIN RAG RESPONSE RECEIVED IN ' + dur + ' ms');
  console.log('Answer:      ' + (res.answer ? res.answer.slice(0, 120) + '...' : 'No answer'));
  console.log('ASI Score:   ' + res.asiScore);
  console.log('Citations:   ' + (res.citations ? res.citations.map(c => 'Hal ' + c.page).join(', ') : 'None'));
  console.log('Reasoning:   ' + JSON.stringify(res.reasoningPath));

  console.log('\n================================================================');
  console.log('⏳ STEP 2: WAITING 4 SECONDS FOR PARALLEL AGENT (c.executionCtx.waitUntil)');
  console.log('Parallel Agent (Agent ke-2) runs asynchronously in the background');
  console.log('================================================================');
  await new Promise(r => setTimeout(r, 4000));

  console.log('\n================================================================');
  console.log('🔍 STEP 3: CHECKING NEON DB LEARNING LOGS (agent_learning_log)');
  console.log('================================================================');
  
  const sql = neon(DATABASE_URL);
  const logs = await sql`
    SELECT id, query, original_score, was_improved, provider_used, created_at
    FROM agent_learning_log
    ORDER BY created_at DESC
    LIMIT 5
  `;

  console.log('\n📊 RECENT PARALLEL AGENT LEARNING LOGS IN NEON DB:');
  console.table(logs);

  const matchedLog = logs.find(l => l.query.includes('Parallel Agent Check'));
  if (matchedLog) {
    console.log('\n🎉 SUCCESS! Parallel Agent (Agent ke-2) executed successfully in the background!');
    console.log('Log ID:         ' + matchedLog.id);
    console.log('Query:          ' + matchedLog.query);
    console.log('Original Score: ' + matchedLog.original_score);
    console.log('Was Improved:   ' + matchedLog.was_improved);
    console.log('Provider Used:  ' + matchedLog.provider_used);
  } else {
    console.log('\n⚠️ Matched log not found in top 5, showing latest entries above.');
  }
}

testParallelAgent().catch(console.error);
