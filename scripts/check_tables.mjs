import { neon } from '@neondatabase/serverless';

const dbUrl = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(dbUrl);

async function main() {
  console.log('=== 1. Searching extracted_tables for "Tabel 5.6" ===');
  const tables = await sql`
    SELECT id, doc_id, page_number, caption, table_markdown
    FROM extracted_tables
    WHERE caption ILIKE '%5.6%' OR table_markdown ILIKE '%Halaman Sampul%'
    LIMIT 5
  `;
  console.log('Found', tables.length, 'tables:');
  for (const t of tables) {
    console.log(`\n--- Doc: ${t.doc_id} | Page: ${t.page_number} | Caption: ${t.caption} ---`);
    console.log(t.table_markdown);
  }

  console.log('\n=== 2. Searching chunks for "Tabel 5.6" ===');
  const chunks = await sql`
    SELECT id, doc_id, page_number, section_title, content
    FROM chunks
    WHERE content ILIKE '%Tabel 5.6%' OR content ILIKE '%Format Penulisan Tiap Bagian%'
    LIMIT 5
  `;
  console.log('Found', chunks.length, 'chunks:');
  for (const c of chunks) {
    console.log(`\n--- Doc: ${c.doc_id} | Page: ${c.page_number} | Title: ${c.section_title} ---`);
    console.log(c.content);
  }
}

main().catch(console.error);
