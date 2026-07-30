import { neon } from '@neondatabase/serverless';

const DATABASE_URL = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function testParallelAgentClean() {
  const query = 'Apa saja syarat pendaftaran seminar proposal TA SI?';
  
  console.log('================================================================');
  console.log('🚀 STEP 1: SENDING CHAT API REQUEST TO LIVE WORKERS API');
  console.log('Query: ' + query);
  console.log('================================================================');
  
  const t1 = Date.now();
  const res = await fetch('https://rag-ai-agentic.mvickymosafan.workers.dev/api/rag/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, userId: 'parallel-agent-clean-test' })
  }).then(r => r.json());
  const dur = Date.now() - t1;
  
  console.log('\n✅ MAIN RAG RESPONSE RECEIVED IN ' + dur + ' ms');
  console.log('Answer Preview: ' + (res.answer ? res.answer.slice(0, 120) + '...' : 'No answer'));
  console.log('ASI Score:      ' + res.asiScore);
  console.log('Citations:      ' + (res.citations ? res.citations.map(c => 'Hal ' + c.page).join(', ') : 'None'));

  console.log('\n================================================================');
  console.log('⏳ STEP 2: WAITING 8 SECONDS FOR PARALLEL AGENT (waitUntil) IN NEON DB');
  console.log('================================================================');
  await new Promise(r => setTimeout(r, 8000));

  console.log('\n================================================================');
  console.log('🔍 STEP 3: FETCHING LATEST LEARNING LOGS FROM NEON DB (agent_learning_log)');
  console.log('================================================================');
  
  const sql = neon(DATABASE_URL);
  const logs = await sql`
    SELECT id, query, original_score, was_improved, provider_used, created_at
    FROM agent_learning_log
    ORDER BY id DESC
    LIMIT 6
  `;

  console.table(logs);
}

testParallelAgentClean().catch(console.error);
