import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';
import { extractText } from 'unpdf';

// Load .dev.vars or .env automatically if present
if (fs.existsSync('.dev.vars')) {
  const envContent = fs.readFileSync('.dev.vars', 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

const DATABASE_URL = process.env.DATABASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!DATABASE_URL || !GEMINI_API_KEY) {
  console.error('ERROR: DATABASE_URL or GEMINI_API_KEY is missing from environment variables / .dev.vars!');
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function chunkText(text, docId, pageNumber, startIndex) {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let currentChunk = '';
  let index = startIndex;

  for (const para of paragraphs) {
    if ((currentChunk + '\n' + para).length > 800) {
      if (currentChunk) {
        chunks.push({
          id: `${docId}:chunk:${index}`,
          docId,
          content: currentChunk,
          pageNumber,
          sectionTitle: `Halaman ${pageNumber}`,
          chunkIndex: index++,
        });
      }
      currentChunk = para;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n${para}` : para;
    }
  }
  if (currentChunk) {
    chunks.push({
      id: `${docId}:chunk:${index}`,
      docId,
      content: currentChunk,
      pageNumber,
      sectionTitle: `Halaman ${pageNumber}`,
      chunkIndex: index++,
    });
  }
  return chunks;
}

async function embedBatch(queries) {
  while (true) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: queries.map(text => ({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text }] },
            outputDimensionality: 768,
          })),
        }),
      });

      if (res.status === 429) {
        console.warn('Gemini API Rate limit (429), cooling down for 10 seconds...');
        await sleep(10000);
        continue;
      }

      if (!res.ok) {
        const err = await res.text();
        console.error(`Gemini Embedding error (${res.status}): ${err}`);
        await sleep(5000);
        continue;
      }

      const data = await res.json();
      if (data.embeddings && Array.isArray(data.embeddings)) {
        return data.embeddings.map(e => e.values);
      }
      await sleep(3000);
    } catch (err) {
      console.warn(`Embedding request error: ${err.message}, retrying in 5s...`);
      await sleep(5000);
    }
  }
}

async function main() {
  const sql = neon(DATABASE_URL);
  const pdfPath = path.resolve('..', 'Panduan TA SI - 2026.pdf');
  console.log('Reading PDF:', pdfPath);
  const buffer = fs.readFileSync(pdfPath);
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).filter(Boolean).map(t => t.trim());

  const docId = 'doc-panduan-ta';
  const title = 'Panduan TA SI 2026';

  await sql`
    INSERT INTO documents (id, title, filename, type, status, is_active)
    VALUES (${docId}, ${title}, 'Panduan TA SI - 2026.pdf', 'pdf', 'processing', TRUE)
    ON CONFLICT (id) DO UPDATE SET is_active = TRUE, status = 'processing'
  `;

  console.log(`Parsing ${pages.length} pages...`);

  let runningIndex = 0;
  const allChunks = pages.flatMap((pageText, i) => {
    const pageChunks = chunkText(pageText, docId, i + 1, runningIndex);
    runningIndex += pageChunks.length;
    return pageChunks;
  });

  console.log(`Generated ${allChunks.length} chunks. Generating real embeddings via Gemini API...`);

  const embeddings = [];
  const BATCH_SIZE = 15;
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const sub = allChunks.slice(i, i + BATCH_SIZE);
    console.log(`Embedding sub-batch ${i} to ${i + sub.length}...`);
    const embs = await embedBatch(sub.map(c => c.content));
    embeddings.push(...embs);
    await sleep(4000);
  }

  console.log(`Received ${embeddings.length} real vector embeddings! Updating Neon DB...`);

  await sql`DELETE FROM chunks WHERE doc_id = ${docId}`;

  const INSERT_BATCH = 20;
  for (let i = 0; i < allChunks.length; i += INSERT_BATCH) {
    const placeholders = [];
    const params = [];
    let pi = 1;

    for (let j = i; j < Math.min(i + INSERT_BATCH, allChunks.length); j++) {
      const chunk = allChunks[j];
      const emb = embeddings[j];
      placeholders.push(`($${pi}, $${pi + 1}, $${pi + 2}, 'text', $${pi + 3}, $${pi + 4}, $${pi + 5}, $${pi + 6}::vector, TRUE)`);
      params.push(chunk.id, chunk.docId, chunk.content, chunk.pageNumber, chunk.sectionTitle, chunk.chunkIndex, `[${emb.join(',')}]`);
      pi += 7;
    }

    await sql.query(
      `INSERT INTO chunks (id, doc_id, content, content_type, page_number, section_title, chunk_index, embedding, is_active)
       VALUES ${placeholders.join(',')}`,
      params
    );
  }

  await sql`UPDATE documents SET status = 'ready', updated_at = NOW() WHERE id = ${docId}`;

  console.log('SUCCESS: All 83 chunks with real Gemini embeddings stored in Neon DB!');
}

main().catch(console.error);
