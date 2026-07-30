import { neon } from '@neondatabase/serverless';
import type { CloudflareBindings, QueryType, RetrievalResult } from '../types';
import { embedQuery } from '../utils/embedding';
import { vectorSearch, bm25Search } from '../db/queries';
import { TOP_K_RESULTS } from '../constants';

const QUERY_STRATEGIES: Record<QueryType, { vector: number; bm25: number; topK: number }> = {
  text: { vector: 0.7, bm25: 0.3, topK: 5 },
  table: { vector: 0.4, bm25: 0.6, topK: 10 },
  image: { vector: 0.8, bm25: 0.2, topK: 3 },
  complex: { vector: 0.6, bm25: 0.4, topK: 7 },
  hybrid: { vector: 0.5, bm25: 0.5, topK: 5 },
};

const DOC_TYPE_RANGES: Record<string, { topKBoost: number }> = {
  pdf: { topKBoost: 1.5 },
  docx: { topKBoost: 1.2 },
};

export async function adaptiveRetrieve(
  query: string,
  type: QueryType,
  env: CloudflareBindings,
  docFilter?: string[],
  docTypes?: string[]
): Promise<RetrievalResult[]> {
  const strategy = QUERY_STRATEGIES[type];

  let adjustedTopK = strategy.topK;
  if (docTypes) {
    for (const dt of docTypes) {
      const range = DOC_TYPE_RANGES[dt];
      if (range) adjustedTopK = Math.round(adjustedTopK * range.topKBoost);
    }
  }

  const embedding = await embedQuery(query, env);
  const [vectorResults, bm25Results, domainResults] = await Promise.all([
    vectorSearch(embedding, adjustedTopK, env, docFilter),
    bm25Search(query, adjustedTopK, env),
    retrieveDomainSpecific(query, type, env, docFilter),
  ]);

  const fused = fusionWeighted(vectorResults, bm25Results, strategy);
  return [...fused, ...domainResults].sort((a, b) => b.score - a.score);
}

async function retrieveDomainSpecific(
  query: string,
  type: QueryType,
  env: CloudflareBindings,
  docFilter?: string[]
): Promise<RetrievalResult[]> {
  if (type === 'image') return retrieveImages(query, env, docFilter);
  if (type === 'table') return retrieveTables(query, env, docFilter);
  return [];
}

async function retrieveImages(
  query: string,
  env: CloudflareBindings,
  docFilter?: string[]
): Promise<RetrievalResult[]> {
  const sql = neon(env.DATABASE_URL);
  let rows: Array<Record<string, unknown>>;
  if (docFilter && docFilter.length > 0) {
    rows = await sql`
      SELECT id, doc_id, r2_key, mime_type, page_number, caption
      FROM extracted_images
      WHERE doc_id = ANY(${docFilter}::text[])
      ORDER BY page_number LIMIT ${TOP_K_RESULTS}
    ` as Array<Record<string, unknown>>;
  } else {
    rows = await sql`
      SELECT id, doc_id, r2_key, mime_type, page_number, caption
      FROM extracted_images
      ORDER BY page_number LIMIT ${TOP_K_RESULTS}
    ` as Array<Record<string, unknown>>;
  }

  return rows.map((r, i) => ({
    chunkId: `${r.id}`,
    docId: `${r.doc_id}`,
    content: `${r.caption || 'Gambar'} — ${r.mime_type || 'image/png'} (Hal ${r.page_number || 1})`,
    contentType: 'image_ref',
    pageNumber: (r.page_number as number) || 1,
    sectionTitle: r.caption as string || 'Gambar',
    score: 0.7 - (i * 0.05),
    source: 'fusion' as const,
  }));
}

async function retrieveTables(
  query: string,
  env: CloudflareBindings,
  docFilter?: string[]
): Promise<RetrievalResult[]> {
  const sql = neon(env.DATABASE_URL);
  const lowerQuery = query.toLowerCase();
  const tableKeywords = lowerQuery.split(/\s+/).filter(w => w.length > 3);

  let rows: Array<Record<string, unknown>>;
  if (tableKeywords.length === 0) {
    if (docFilter && docFilter.length > 0) {
      rows = await sql`
        SELECT id, doc_id, page_number, caption, table_markdown
        FROM extracted_tables
        WHERE doc_id = ANY(${docFilter}::text[])
        ORDER BY page_number LIMIT ${TOP_K_RESULTS}
      ` as Array<Record<string, unknown>>;
    } else {
      rows = await sql`
        SELECT id, doc_id, page_number, caption, table_markdown
        FROM extracted_tables
        ORDER BY page_number LIMIT ${TOP_K_RESULTS}
      ` as Array<Record<string, unknown>>;
    }
  } else {
    if (docFilter && docFilter.length > 0) {
      rows = await sql`
        SELECT id, doc_id, page_number, caption, table_markdown
        FROM extracted_tables
        WHERE doc_id = ANY(${docFilter}::text[])
          AND (${tableKeywords.map(kw => sql`(table_markdown ILIKE ${'%' + kw + '%'} OR caption ILIKE ${'%' + kw + '%'})`).reduce((a, b) => sql`${a} OR ${b}`)})
        ORDER BY page_number LIMIT ${TOP_K_RESULTS}
      ` as Array<Record<string, unknown>>;
    } else {
      rows = await sql`
        SELECT id, doc_id, page_number, caption, table_markdown
        FROM extracted_tables
        WHERE ${tableKeywords.map(kw => sql`(table_markdown ILIKE ${'%' + kw + '%'} OR caption ILIKE ${'%' + kw + '%'})`).reduce((a, b) => sql`${a} OR ${b}`)}
        ORDER BY page_number LIMIT ${TOP_K_RESULTS}
      ` as Array<Record<string, unknown>>;
    }
  }

  return rows.map((r, i) => ({
    chunkId: `${r.id}`,
    docId: `${r.doc_id}`,
    content: `\n[TABEL ${r.caption || ''}]\n${r.table_markdown || ''}`,
    contentType: 'table',
    pageNumber: (r.page_number as number) || 1,
    sectionTitle: (r.caption as string) || 'Tabel',
    score: 0.75 - (i * 0.05),
    source: 'fusion' as const,
  }));
}

function fusionWeighted(
  vector: RetrievalResult[],
  bm25: RetrievalResult[],
  strategy: { vector: number; bm25: number; topK: number }
): RetrievalResult[] {
  const seen = new Set<string>();
  const fused: RetrievalResult[] = [];

  const hasVector = vector.length > 0;
  const vectorW = hasVector ? strategy.vector : 0;
  const bm25W = hasVector ? strategy.bm25 : 1.0;

  for (const v of vector) {
    fused.push({ ...v, score: v.score * vectorW, source: 'fusion' as const });
    seen.add(v.chunkId);
  }

  for (const b of bm25) {
    if (!seen.has(b.chunkId)) {
      const score = b.score < 0 ? 1.0 / (1 + Math.abs(b.score)) : b.score;
      fused.push({ ...b, score: score * bm25W, source: 'fusion' as const });
    }
  }

  return fused
    .sort((a, b) => b.score - a.score)
    .slice(0, strategy.topK * 2);
}

export async function expandContiguousChunks(
  results: RetrievalResult[],
  env: CloudflareBindings,
  windowSize: number = 4
): Promise<RetrievalResult[]> {
  if (results.length === 0) return results;

  const sql = neon(env.DATABASE_URL);
  const expanded: RetrievalResult[] = [...results];
  const seenPages = new Set(results.map(r => `${r.docId}:${r.pageNumber}`));

  for (const item of results.slice(0, 3)) {
    const startPage = Math.max(1, item.pageNumber - 1);
    const endPage = item.pageNumber + windowSize;

    const adjacent = await sql`
      SELECT id, doc_id, page_number, section_title, content
      FROM chunks
      WHERE doc_id = ${item.docId}
        AND page_number >= ${startPage}
        AND page_number <= ${endPage}
      ORDER BY page_number ASC
    ` as Array<Record<string, unknown>>;

    for (const r of adjacent) {
      const pageNum = (r.page_number as number) || 1;
      const key = `${r.doc_id}:${pageNum}`;
      if (!seenPages.has(key)) {
        seenPages.add(key);
        expanded.push({
          chunkId: `${r.id}`,
          docId: `${r.doc_id}`,
          content: r.content as string,
          contentType: (item.contentType || 'text') as any,
          pageNumber: pageNum,
          sectionTitle: (r.section_title as string) || 'Halaman ' + pageNum,
          score: item.score * 0.95,
          source: 'fusion' as const,
        });
      }
    }
  }

  return expanded.sort((a, b) => a.pageNumber - b.pageNumber);
}

