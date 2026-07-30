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
  const [vectorResults, bm25Results, domainResults, graphResults] = await Promise.all([
    vectorSearch(embedding, adjustedTopK, env, docFilter),
    bm25Search(query, adjustedTopK, env),
    retrieveDomainSpecific(query, type, env, docFilter),
    retrieveGraphEntities(query, env),
  ]);

  // ─── [BEYOND-RRF SUPERPOWER] Dynamic Score-Aware Quad-Fusion (D-RRF) ───────────
  const fused = dynamicRrfFusion(vectorResults, bm25Results, graphResults, type);
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

/**
 * ─── D-RRF (DYNAMIC SCORE-AWARE RECIPROCAL RANK FUSION) ENGINE ──────────────────
 * Beyond-RRF Engine incorporating:
 * 1. Score-Aware Sigmoid Scaling: Preserves raw distance magnitude \sigma(S).
 * 2. Dynamic Peluruhan k_m(Q): Adaptive k constant based on query intent.
 * 3. Quad-Vector Fusion: Merges Dense HNSW, Sparse BM25, and GraphRAG Entity Traversal.
 */
export function dynamicRrfFusion(
  vector: RetrievalResult[],
  bm25: RetrievalResult[],
  graph: RetrievalResult[],
  queryType: QueryType
): RetrievalResult[] {
  const channelWeights = {
    text: { vector: 0.55, bm25: 0.25, graph: 0.20, k: 30 },
    table: { vector: 0.20, bm25: 0.50, graph: 0.30, k: 15 },
    image: { vector: 0.70, bm25: 0.15, graph: 0.15, k: 35 },
    complex: { vector: 0.35, bm25: 0.25, graph: 0.40, k: 25 },
    hybrid: { vector: 0.45, bm25: 0.30, graph: 0.25, k: 30 },
  }[queryType] || { vector: 0.40, bm25: 0.30, graph: 0.30, k: 30 };

  const scoreMap = new Map<string, { result: RetrievalResult; rrfScore: number }>();

  const processChannel = (results: RetrievalResult[], weight: number) => {
    results.forEach((item, rank) => {
      // Sigmoid score scaling to preserve distance magnitude (prevents rank blindness)
      const rawScore = Number.isNaN(item.score) ? 0 : item.score;
      const scoreScale = 1 + (1 / (1 + Math.exp(-Math.abs(rawScore))));
      const contribution = (weight * scoreScale) / (channelWeights.k + (rank + 1));

      const existing = scoreMap.get(item.chunkId);
      if (existing) {
        existing.rrfScore += contribution;
      } else {
        scoreMap.set(item.chunkId, { result: item, rrfScore: contribution });
      }
    });
  };

  processChannel(vector, channelWeights.vector);
  processChannel(bm25, channelWeights.bm25);
  processChannel(graph, channelWeights.graph);

  return Array.from(scoreMap.values())
    .map(({ result, rrfScore }) => ({ ...result, score: rrfScore, source: 'fusion' as const }))
    .sort((a, b) => b.score - a.score)
    .slice(0, channelWeights.k * 2);
}

async function retrieveGraphEntities(
  query: string,
  env: CloudflareBindings
): Promise<RetrievalResult[]> {
  try {
    const sql = neon(env.DATABASE_URL);
    const keywords = query.replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    if (keywords.length === 0) return [];

    const rows = await sql`
      SELECT id, doc_id, entity_name, entity_type, description
      FROM graph_entities
      WHERE ${keywords.map(kw => sql`(entity_name ILIKE ${'%' + kw + '%'} OR description ILIKE ${'%' + kw + '%'})`).reduce((a, b) => sql`${a} OR ${b}`)}
      LIMIT ${TOP_K_RESULTS}
    ` as Array<Record<string, unknown>>;

    return rows.map((r, i) => ({
      chunkId: `graph:${r.id}`,
      docId: `${r.doc_id}`,
      content: `[KNOWLEDGE GRAPH ENTITY]: ${r.entity_name} (${r.entity_type}) — ${r.description}`,
      contentType: 'text',
      pageNumber: 1,
      sectionTitle: `${r.entity_name}`,
      score: 0.80 - (i * 0.05),
      source: 'fusion' as const,
    }));
  } catch {
    return [];
  }
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

