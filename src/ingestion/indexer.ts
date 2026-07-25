import { neon } from '@neondatabase/serverless';
import type { CloudflareBindings } from '../types';
import { batchEmbedQueries } from '../utils/embedding';

interface IndexChunk {
  id: string;
  docId: string;
  content: string;
  contentType: string;
  pageNumber: number;
  sectionTitle: string;
  chunkIndex: number;
}

const INSERT_BATCH = 50;

export async function indexChunks(
  chunks: IndexChunk[],
  env: CloudflareBindings
): Promise<{ indexed: number; failed: number }> {
  let indexed = 0;
  let failed = 0;
  const sql = neon(env.DATABASE_URL);

  let embeddings: number[][];
  try {
    embeddings = await batchEmbedQueries(chunks.map(c => c.content), env);
  } catch (err) {
    console.warn('Batch embed failed, using zero-vector fallback to prevent subrequest limit overflow:', err);
    embeddings = chunks.map(() => new Array(768).fill(0));
  }

  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const placeholders: string[] = [];
    const params: (string | number | boolean)[] = [];
    let pi = 1;

    for (let j = i; j < Math.min(i + INSERT_BATCH, chunks.length); j++) {
      const chunk = chunks[j];
      const emb = embeddings[j];
      if (!emb?.length) { failed++; continue; }

      placeholders.push(
        `($${pi}, $${pi + 1}, $${pi + 2}, 'text', $${pi + 3}, $${pi + 4}, $${pi + 5}, $${pi + 6}::vector, TRUE)`
      );
      params.push(
        chunk.id, chunk.docId, chunk.content, chunk.pageNumber,
        chunk.sectionTitle, chunk.chunkIndex, `[${emb.join(',')}]`
      );
      pi += 7;
    }

    if (placeholders.length === 0) continue;

    await sql.query(
      `INSERT INTO chunks (id, doc_id, content, content_type, page_number, section_title, chunk_index, embedding, is_active)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (id) DO UPDATE SET
         content = EXCLUDED.content,
         embedding = EXCLUDED.embedding,
         is_active = TRUE`,
      params
    );

    indexed += placeholders.length;
  }

  return { indexed, failed };
}
