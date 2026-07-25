import { neon } from '@neondatabase/serverless';

const DATABASE_URL = "postgresql://neondb_owner:npg_lEOpJQo9k1hI@ep-falling-math-az6bbxl3-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const GEMINI_API_KEY = "AIzaSyAoMOURZcIwxfOwfby-wwaqFrd3xp7_Ua0";

async function embedGemini(query) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text: query }] },
      outputDimensionality: 768,
    }),
  });
  const data = await res.json();
  return data.embedding.values;
}

async function main() {
  const sql = neon(DATABASE_URL);
  const userQuery = "berapa batas margin atas bawah kiri kanan pada panduan ta ?";

  console.log('User query:', userQuery);
  console.log('Generating embedding...');
  const emb = await embedGemini(userQuery);
  const embStr = `[${emb.join(',')}]`;

  console.log('\n=== Testing Fixed Vector Search ===');
  const rows = await sql`
    SELECT id, doc_id, page_number, content, 1 - (embedding <=> ${embStr}::vector) AS score
    FROM chunks
    WHERE embedding IS NOT NULL AND is_active = TRUE
    ORDER BY embedding <=> ${embStr}::vector
    LIMIT 5
  `;
  
  console.log(`Found ${rows.length} vector search results:`);
  for (const r of rows) {
    console.log(`\nScore: ${r.score.toFixed(4)} | Doc: ${r.doc_id} | Page: ${r.page_number}`);
    console.log(r.content.slice(0, 300) + '...');
  }
}

main().catch(console.error);
