import { neon } from '@neondatabase/serverless';

const dbUrl = 'postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const sql = neon(dbUrl);

async function main() {
  console.log('=== 1. Searching chunks with term "penomoran" ===');
  const penomoranChunks = await sql`
    SELECT id, doc_id, page_number, section_title, content
    FROM chunks
    WHERE content ILIKE '%penomoran%' OR section_title ILIKE '%penomoran%'
    ORDER BY page_number
    LIMIT 10
  `;
  console.log('Found', penomoranChunks.length, 'chunks with "penomoran":');
  for (const c of penomoranChunks) {
    console.log(`\n--- Doc: ${c.doc_id} | Page: ${c.page_number} | Title: ${c.section_title} ---`);
    console.log(c.content);
  }

  console.log('\n=== 2. Searching chunks with term "nomor" ===');
  const nomorChunks = await sql`
    SELECT id, doc_id, page_number, section_title, content
    FROM chunks
    WHERE content ILIKE '%nomor%'
    ORDER BY page_number
    LIMIT 5
  `;
  for (const c of nomorChunks) {
    console.log(`\n--- Doc: ${c.doc_id} | Page: ${c.page_number} | Title: ${c.section_title} ---`);
    console.log(c.content.slice(0, 300));
  }

  console.log('\n=== 3. Checking Page 45 contents ===');
  const page45 = await sql`
    SELECT id, doc_id, page_number, section_title, content
    FROM chunks
    WHERE page_number = 45
    LIMIT 5
  `;
  for (const c of page45) {
    console.log(`\n--- Doc: ${c.doc_id} | Page: ${c.page_number} | Title: ${c.section_title} ---`);
    console.log(c.content);
  }
}

main().catch(console.error);
