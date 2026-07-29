import { neon } from '@neondatabase/serverless';

const dbUrl = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(dbUrl);

async function main() {
  console.log('=== DUMPING ALL CHUNKS FROM PAGE 56 TO 64 IN NEON DB ===');
  const chunks = await sql`
    SELECT id, doc_id, page_number, section_title, content
    FROM chunks
    WHERE doc_id = 'doc-panduan-ta' AND page_number BETWEEN 56 AND 64
    ORDER BY page_number ASC
  `;

  for (const c of chunks) {
    console.log(`\n========================================`);
    console.log(`CHUNK ID: ${c.id} | DB PAGE_NUMBER: ${c.page_number} | TITLE: ${c.section_title}`);
    console.log(`========================================`);
    console.log(c.content);
  }
}

main().catch(console.error);
