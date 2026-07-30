import { neon } from '@neondatabase/serverless';

const DATABASE_URL = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function testInsert() {
  const sql = neon(DATABASE_URL);
  try {
    const rows = await sql`
      INSERT INTO agent_learning_log (
        query, original_answer, gap_score, gaps_found, missing_keywords,
        was_improved, improvement_reason, provider_used, original_score
      ) VALUES (
        'Test Swarm Direct Insert',
        'Original answer text',
        0.0,
        ARRAY['gap1', 'gap2']::text[],
        ARRAY['kw1']::text[],
        TRUE,
        'Swarm Consensus: 2A+2B+2C+2D',
        'swarm-matrix-4x',
        0.9
      )
      RETURNING id
    `;
    console.log('Insert Success! Created Log ID:', rows[0].id);
  } catch(e) {
    console.error('Insert Failed:', e.message);
  }
}

testInsert().catch(console.error);
