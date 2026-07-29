import { neon } from '@neondatabase/serverless';

const dbUrl = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(dbUrl);

async function main() {
  console.log('=== CHECKING NEON DB FOR ROWS 4 AND 5 OF TABEL 5.6 ===');
  const chunks = await sql`
    SELECT id, doc_id, page_number, content
    FROM chunks
    WHERE doc_id = 'doc-panduan-ta' AND page_number = 58
  `;

  if (chunks.length > 0) {
    console.log('Page 58 Content:\n', chunks[0].content);
  }
}

main().catch(console.error);
