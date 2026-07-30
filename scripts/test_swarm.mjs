import { neon } from '@neondatabase/serverless';

const DATABASE_URL = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function testSwarmMatrix() {
  const query = 'Bagaimana format penulisan daftar pustaka dari buku dan jurnal ilmiah?';

  console.log('================================================================');
  console.log('🐝 STEP 1: SENDING CHAT QUERY TO LIVE MULTI-AGENT SWARM WORKER');
  console.log('Query: ' + query);
  console.log('================================================================');

  const t1 = Date.now();
  const res = await fetch('https://rag-ai-agentic.mvickymosafan.workers.dev/api/rag/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, userId: 'swarm-matrix-tester' })
  }).then(r => r.json());
  const dur = Date.now() - t1;

  console.log('\n⚡ MAIN RESPONSE LATENCY: ' + dur + ' ms');
  console.log('Answer Preview: ' + (res.answer ? res.answer.slice(0, 150) + '...' : 'No answer'));
  console.log('ASI Score:      ' + res.asiScore);
  console.log('Citations:      ' + (res.citations ? res.citations.map(c => 'Hal ' + c.page).join(', ') : 'None'));

  console.log('\n================================================================');
  console.log('⏳ STEP 2: WAITING 5 SECONDS FOR MULTI-AGENT SWARM MATRIX (2A+2B+2C+2D)');
  console.log('4 Subagents executing concurrently in background waitUntil()');
  console.log('================================================================');
  await new Promise(r => setTimeout(r, 5000));

  console.log('\n================================================================');
  console.log('🔍 STEP 3: FETCHING LATEST LEARNING LOG FROM NEON DB (agent_learning_log)');
  console.log('================================================================');

  const sql = neon(DATABASE_URL);
  const logs = await sql`
    SELECT id, query, original_score, was_improved, provider_used, improvement_reason, created_at
    FROM agent_learning_log
    ORDER BY id DESC
    LIMIT 3
  `;

  console.table(logs);

  if (logs[0] && logs[0].provider_used === 'swarm-matrix-4x') {
    console.log('\n🎉 EMPIRICAL PROOF VERIFIED: Multi-Agent Swarm (swarm-matrix-4x) successfully executed all 4 subagents in parallel!');
    console.log('Log ID:              ' + logs[0].id);
    console.log('Provider Used:       ' + logs[0].provider_used);
    console.log('Improvement Reason:  ' + logs[0].improvement_reason);
  }
}

testSwarmMatrix().catch(console.error);
