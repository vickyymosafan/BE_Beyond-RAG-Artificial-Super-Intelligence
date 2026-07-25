import type { CloudflareBindings } from '../types';
import { parseDocument } from './parser';
import { chunkDocument } from './chunker';
import { indexChunks } from './indexer';
import { createDocument, updateDocumentStatus, createDocumentVersion } from '../db/admin-queries';
import { hashQuery } from '../utils/hash';

interface IngestionResult {
  docId: string;
  title: string;
  chunksCount: number;
  indexedCount: number;
  failedCount: number;
  pageCount: number;
}

export async function ingestDocument(
  file: File,
  docId: string,
  title: string,
  userId: string,
  env: CloudflareBindings
): Promise<IngestionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const fileHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  const docType = file.name.endsWith('.pdf') ? 'pdf' : 'docx';

  await createDocument({ id: docId, title, filename: file.name, type: docType }, env);
  await updateDocumentStatus(docId, 'processing', env);

  try {

    const parseResult = await parseDocument(file, docId, env);
    let runningIndex = 0;
    const allChunks = parseResult.pages.flatMap(page => {
      const pageChunks = chunkDocument(page.text, docId, page.pageNumber, runningIndex);
      runningIndex += pageChunks.length;
      return pageChunks;
    });

    const indexResult = await indexChunks(
      allChunks.map(chunk => ({
        id: chunk.id,
        docId: chunk.docId,
        content: chunk.content,
        contentType: 'text',
        pageNumber: chunk.pageNumber,
        sectionTitle: chunk.sectionTitle,
        chunkIndex: chunk.chunkIndex,
      })),
      env
    );

    await createDocumentVersion({
      id: `${docId}:v1`,
      docId,
      version: 1,
      filename: file.name,
      fileHash,
      changeSummary: `Initial import: ${allChunks.length} chunks from ${parseResult.pages.length} pages`,
    }, env);

    await updateDocumentStatus(docId, 'ready', env);

    return {
      docId,
      title,
      chunksCount: allChunks.length,
      indexedCount: indexResult.indexed,
      failedCount: indexResult.failed,
      pageCount: parseResult.pages.length,
    };
  } catch (err) {
    await updateDocumentStatus(docId, 'error', env);
    throw err;
  }
}
