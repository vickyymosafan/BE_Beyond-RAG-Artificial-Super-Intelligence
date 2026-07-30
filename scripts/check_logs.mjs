import { neon } from '@neondatabase/serverless';

const DATABASE_URL = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function checkNeonLogs() {
  const sql = neon(DATABASE_URL);
  const logs = await sql`
    SELECT id, query, original_score, was_improved, provider_used, created_at
    FROM agent_learning_log
    ORDER BY id DESC
    LIMIT 10
  `;

  console.log('================================================================');
  console.log('📊 LATEST AGENT LEARNING LOGS IN NEON DB (AGENT KE-2 ASYNC)');
  console.log('================================================================');
  console.table(logs);
}

checkNeonLogs().catch(console.error);
