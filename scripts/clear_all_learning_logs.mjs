import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const result = await sql`TRUNCATE TABLE agent_learning_log`;
  console.log('TRUNCATED ALL OLD AGENT LEARNING LOGS FROM NEON DB');
}

main().catch(console.error);
