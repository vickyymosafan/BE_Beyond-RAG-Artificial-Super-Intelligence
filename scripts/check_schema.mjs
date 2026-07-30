import { neon } from '@neondatabase/serverless';

const DATABASE_URL = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function checkSchema() {
  const sql = neon(DATABASE_URL);
  const cols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'agent_learning_log'
  `;
  console.log('Columns in agent_learning_log:');
  console.table(cols);
}

checkSchema().catch(console.error);
