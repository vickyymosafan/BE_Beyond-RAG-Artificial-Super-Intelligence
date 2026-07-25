import { neon } from '@neondatabase/serverless';
import type { CloudflareBindings } from '../types';

export async function listDocuments(env: CloudflareBindings): Promise<Array<Record<string, unknown>>> {
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`
    SELECT id, title, filename, type, total_pages, total_images, total_tables, status, version, created_at, updated_at
    FROM documents
    WHERE is_active = TRUE
    ORDER BY updated_at DESC
  `;
  return rows as Array<Record<string, unknown>>;
}

export async function getDocument(id: string, env: CloudflareBindings): Promise<Record<string, unknown> | null> {
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`
    SELECT * FROM documents WHERE id = ${id} AND is_active = TRUE LIMIT 1
  `;
  return (rows as Record<string, unknown>[])[0] || null;
}

export async function createDocument(
  doc: { id: string; title: string; filename: string; type: string },
  env: CloudflareBindings
): Promise<void> {
  const sql = neon(env.DATABASE_URL);
  await sql`
    INSERT INTO documents (id, title, filename, type, status)
    VALUES (${doc.id}, ${doc.title}, ${doc.filename}, ${doc.type}, 'pending')
  `;
}

export async function updateDocumentStatus(
  id: string,
  status: string,
  env: CloudflareBindings
): Promise<void> {
  const sql = neon(env.DATABASE_URL);
  await sql`
    UPDATE documents SET status = ${status}, updated_at = NOW() WHERE id = ${id}
  `;
}

export async function softDeleteDocument(id: string, env: CloudflareBindings): Promise<void> {
  const sql = neon(env.DATABASE_URL);
  await sql`UPDATE documents SET is_active = FALSE, status = 'deleted' WHERE id = ${id}`;
  await sql`UPDATE chunks SET is_active = FALSE WHERE doc_id = ${id}`;
}

export async function createDocumentVersion(
  ver: { id: string; docId: string; version: number; filename: string; fileHash: string; changeSummary?: string },
  env: CloudflareBindings
): Promise<void> {
  const sql = neon(env.DATABASE_URL);
  await sql`
    INSERT INTO document_versions (id, doc_id, version, filename, file_hash, change_summary)
    VALUES (${ver.id}, ${ver.docId}, ${ver.version}, ${ver.filename}, ${ver.fileHash}, ${ver.changeSummary || null})
  `;
  await sql`
    UPDATE documents SET version = ${ver.version}, updated_at = NOW() WHERE id = ${ver.docId}
  `;
}

export async function getDocumentVersions(docId: string, env: CloudflareBindings): Promise<Array<Record<string, unknown>>> {
  const sql = neon(env.DATABASE_URL);
  const rows = await sql`
    SELECT * FROM document_versions WHERE doc_id = ${docId} ORDER BY version DESC
  `;
  return rows as Array<Record<string, unknown>>;
}

export async function getPopularFAQ(env: CloudflareBindings, limit: number = 10): Promise<Array<Record<string, unknown>>> {
  try {
    const sql = neon(env.DATABASE_URL);
    const rows = await sql`
      SELECT query as question, COUNT(*) as hit_count
      FROM search_logs
      GROUP BY query
      ORDER BY hit_count DESC
      LIMIT ${limit}
    `;
    return rows as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}
