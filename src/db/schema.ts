export const DB_SCHEMA_PG = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('pdf', 'docx')),
    total_pages INTEGER DEFAULT 0,
    total_images INTEGER DEFAULT 0,
    total_tables INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'ready', 'error', 'deleted')),
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES chunks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK(content_type IN ('text', 'table', 'image_ref', 'hybrid')),
    page_number INTEGER,
    section_title TEXT,
    section_hierarchy TEXT,
    chunk_index INTEGER NOT NULL,
    embedding vector(768),
    chunk_hash TEXT,
    metadata TEXT DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tsv_content tsvector GENERATED ALWAYS AS (to_tsvector('indonesian', coalesce(content, ''))) STORED
  )`,
  `CREATE TABLE IF NOT EXISTS extracted_tables (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_id TEXT REFERENCES chunks(id) ON DELETE SET NULL,
    page_number INTEGER,
    caption TEXT,
    table_data TEXT NOT NULL,
    table_markdown TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS extracted_images (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_id TEXT REFERENCES chunks(id) ON DELETE SET NULL,
    page_number INTEGER,
    caption TEXT,
    r2_key TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/png',
    width INTEGER,
    height INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS document_versions (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    filename TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    change_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_content_type ON chunks(content_type)`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_page ON chunks(doc_id, page_number)`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON chunks USING GIN(tsv_content)`,
  // ─── [PERF-2 FIX] Upgraded from ivfflat to hnsw for dynamic table vector search.
  // ivfflat requires centroid clustering at index-creation time; recall degrades for rows
  // inserted after index build. HNSW is always-accurate and requires no rebuild.
  // For existing deployments, run:
  //   DROP INDEX IF EXISTS idx_chunks_embedding;
  //   CREATE INDEX idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);
  `CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_tables_doc_id ON extracted_tables(doc_id)`,
  `CREATE INDEX IF NOT EXISTS idx_images_doc_id ON extracted_images(doc_id)`,
  `CREATE INDEX IF NOT EXISTS idx_doc_versions_doc_id ON document_versions(doc_id)`,
  // ─── GRAPHRAG KNOWLEDGE GRAPH TABLES ──────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS graph_entities (
    id TEXT PRIMARY KEY,
    doc_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
    entity_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS graph_relationships (
    id TEXT PRIMARY KEY,
    source_entity_id TEXT REFERENCES graph_entities(id) ON DELETE CASCADE,
    target_entity_id TEXT REFERENCES graph_entities(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS graph_community_summaries (
    id TEXT PRIMARY KEY,
    community_level INTEGER NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    findings JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_graph_entities_doc ON graph_entities(doc_id)`,
  `CREATE INDEX IF NOT EXISTS idx_graph_rel_source ON graph_relationships(source_entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_graph_rel_target ON graph_relationships(target_entity_id)`,
  // ─── AUTONOMOUS SELF-EVOLVING ENGINE TABLES ────────────────────────────────
  `CREATE TABLE IF NOT EXISTS agent_system_metrics (
    id SERIAL PRIMARY KEY,
    metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_queries INTEGER DEFAULT 0,
    avg_grounding_score FLOAT DEFAULT 0.0,
    avg_asi_score FLOAT DEFAULT 0.0,
    cache_hit_rate FLOAT DEFAULT 0.0,
    auto_improvements_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS agent_prompt_versions (
    id SERIAL PRIMARY KEY,
    prompt_name TEXT NOT NULL,
    version INTEGER NOT NULL,
    system_prompt TEXT NOT NULL,
    benchmark_score FLOAT DEFAULT 0.0,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS agent_auto_benchmarks (
    id SERIAL PRIMARY KEY,
    test_name TEXT NOT NULL,
    passed_count INTEGER NOT NULL,
    failed_count INTEGER NOT NULL,
    accuracy_rate FLOAT NOT NULL,
    execution_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];
