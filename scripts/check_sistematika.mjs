import { neon } from '@neondatabase/serverless';

const dbUrl = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(dbUrl);

async function main() {
  console.log('=== 1. Searching chunks with term "Sistematika Penulisan Laporan" ===');
  const chunks = await sql`
    SELECT id, doc_id, page_number, section_title, content
    FROM chunks
    WHERE content ILIKE '%Sistematika Penulisan%' OR content ILIKE '%Sistematika%'
    ORDER BY page_number
  `;
  console.log('Found', chunks.length, 'chunks with "Sistematika":');
  for (const c of chunks) {
    console.log(`\n--- Doc: ${c.doc_id} | Page: ${c.page_number} | Title: ${c.section_title} ---`);
    console.log(c.content);
  }

  console.log('\n=== 2. Searching chunks with "Biodata Penulis" ===');
  const biodataChunks = await sql`
    SELECT id, doc_id, page_number, section_title, content
    FROM chunks
    WHERE content ILIKE '%Biodata Penulis%'
  `;
  console.log('Found', biodataChunks.length, 'chunks with "Biodata Penulis":');
  for (const c of biodataChunks) {
    console.log(`\n--- Doc: ${c.doc_id} | Page: ${c.page_number} | Title: ${c.section_title} ---`);
    console.log(c.content);
  }
}

main().catch(console.error);
