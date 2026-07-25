import { neon } from '@neondatabase/serverless';
import type { CloudflareBindings, RetrievalResult } from '../types';

export async function vectorSearch(
  embedding: number[],
  topK: number,
  env: CloudflareBindings,
  docFilter?: string[]
): Promise<RetrievalResult[]> {
  try {
    const sql = neon(env.DATABASE_URL);
    const embeddingStr = `[${embedding.join(',')}]`;

    let rows: Array<{
      id: string; doc_id: string; content: string;
      content_type: string; page_number: number; section_title: string; score: number;
    }>;

    if (docFilter && docFilter.length > 0) {
      rows = await sql`
        SELECT id, doc_id, content, content_type, page_number, section_title,
               1 - (embedding <=> ${embeddingStr}::vector) AS score
        FROM chunks
        WHERE embedding IS NOT NULL AND is_active = TRUE
          AND doc_id = ANY(${docFilter}::text[])
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT ${topK}
      ` as Array<{
        id: string; doc_id: string; content: string;
        content_type: string; page_number: number; section_title: string; score: number;
      }>;
    } else {
      rows = await sql`
        SELECT id, doc_id, content, content_type, page_number, section_title,
               1 - (embedding <=> ${embeddingStr}::vector) AS score
        FROM chunks
        WHERE embedding IS NOT NULL AND is_active = TRUE
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT ${topK}
      ` as Array<{
        id: string; doc_id: string; content: string;
        content_type: string; page_number: number; section_title: string; score: number;
      }>;
    }

    return rows.map(r => ({
      chunkId: r.id,
      docId: r.doc_id,
      content: r.content,
      contentType: r.content_type,
      pageNumber: r.page_number,
      sectionTitle: r.section_title,
      score: Number.isNaN(r.score) ? 0 : r.score,
      source: 'vector' as const,
    }));
  } catch (err) {
    console.warn('pgvector search failed:', err);
    return [];
  }
}

export async function bm25Search(
  query: string,
  topK: number,
  env: CloudflareBindings
): Promise<RetrievalResult[]> {
  try {
    const sql = neon(env.DATABASE_URL);
    const keywords = query.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    const searchPattern = keywords.length > 0 ? keywords.join(' | ') : query;

    const rows = await sql`
      SELECT id, doc_id, content, content_type, page_number, section_title,
             ts_rank(tsv_content, to_tsquery('simple', ${searchPattern})) AS score
      FROM chunks
      WHERE (tsv_content @@ to_tsquery('simple', ${searchPattern}) OR content ILIKE ${'%' + query + '%'})
        AND is_active = TRUE
      ORDER BY score DESC
      LIMIT ${topK}
    ` as Array<{
      id: string; doc_id: string; content: string;
      content_type: string; page_number: number; section_title: string; score: number;
    }>;

    return rows.map(r => ({
      chunkId: r.id,
      docId: r.doc_id,
      content: r.content,
      contentType: r.content_type,
      pageNumber: r.page_number,
      sectionTitle: r.section_title,
      score: r.score || 0.5,
      source: 'bm25' as const,
    }));
  } catch {
    return [];
  }
}

export async function getDocumentTitle(docId: string, env: CloudflareBindings): Promise<string> {
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`
    SELECT title FROM documents WHERE id = ${docId} AND is_active = TRUE LIMIT 1
  ` as { title: string }[];
  return rows[0]?.title || docId;
}
