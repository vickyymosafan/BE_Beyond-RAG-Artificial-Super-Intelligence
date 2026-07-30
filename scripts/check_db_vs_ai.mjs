import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  console.log('=== NEON DB RAW CONTENT: PENYAJIAN GAMBAR (PAGES 49-50) ===');
  const gambarRows = await sql`
    SELECT page_number, content FROM chunks WHERE page_number BETWEEN 49 AND 50 ORDER BY page_number ASC
  `;
  for (const r of gambarRows) {
    console.log(`\n--- PAGE ${r.page_number} ---`);
    console.log(r.content);
  }

  console.log('\n\n=== NEON DB RAW CONTENT: PENYAJIAN TABEL (PAGES 51-52) ===');
  const tabelRows = await sql`
    SELECT page_number, content FROM chunks WHERE page_number BETWEEN 51 AND 52 ORDER BY page_number ASC
  `;
  for (const r of tabelRows) {
    console.log(`\n--- PAGE ${r.page_number} ---`);
    console.log(r.content);
  }
}

main().catch(console.error);
