import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  const result = await sql`DELETE FROM agent_learning_log WHERE query ILIKE '%Penyajian Tabel%'`;
  console.log('Cleared old learning log entries for Penyajian Tabel');
}

main().catch(console.error);
