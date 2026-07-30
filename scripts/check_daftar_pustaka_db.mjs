import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  console.log('=== NEON DB RAW CHUNKS: DAFTAR PUSTAKA (PAGES 46-50) ===');
  const rows = await sql`
    SELECT id, page_number, content FROM chunks WHERE page_number BETWEEN 46 AND 50 ORDER BY page_number ASC
  `;
  for (const r of rows) {
    console.log(`\n--- PAGE ${r.page_number} | ID ${r.id} ---`);
    console.log(r.content);
  }
}

main().catch(console.error);
