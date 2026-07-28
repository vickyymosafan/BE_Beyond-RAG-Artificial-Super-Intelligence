import { neon } from '@neondatabase/serverless';

const dbUrl = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(dbUrl);

async function main() {
  console.log('=== Searching all chunks containing Tabel 5.6 or table rows ===');
  const chunks = await sql`
    SELECT id, doc_id, page_number, section_title, content
    FROM chunks
    WHERE doc_id = 'doc-panduan-ta' AND (page_number BETWEEN 56 AND 63)
    ORDER BY page_number
  `;
  console.log('Found', chunks.length, 'chunks from page 56 to 63:');
  for (const c of chunks) {
    console.log(`\n--- Doc: ${c.doc_id} | Page: ${c.page_number} | Title: ${c.section_title} ---`);
    console.log(c.content.slice(0, 300));
  }
}

main().catch(console.error);
