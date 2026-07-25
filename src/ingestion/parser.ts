import { neon } from '@neondatabase/serverless';
import type { CloudflareBindings } from '../types';

interface ParseResult {
  text: string;
  pages: Array<{ pageNumber: number; text: string; images: string[]; tables: string[] }>;
  metadata: Record<string, unknown>;
}

export async function parseDocument(
  file: File,
  docId: string,
  env: CloudflareBindings
): Promise<ParseResult> {
  const filename = file.name.toLowerCase();

  if (filename.endsWith('.docx')) {
    return parseDocx(file, docId, env);
  }
  if (filename.endsWith('.pdf')) {
    return parsePdf(file, docId, env);
  }
  throw new Error(`Unsupported file type: ${filename}`);
}

async function parseDocx(file: File, docId: string, env: CloudflareBindings): Promise<ParseResult> {
  const { extractRawText, convertToHtml } = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const result = await extractRawText({ arrayBuffer: buffer });

  const pages = result.value.split(/\f|\n{3,}/).filter(Boolean).map((text, i) => ({
    pageNumber: i + 1,
    text: text.trim(),
    images: [] as string[],
    tables: [] as string[],
  }));

  const images = await extractDocxImages(buffer, docId, env);
  const tables = await extractDocxTables(buffer, docId, env, pages);

  if (images.length > 0 && pages.length > 0) {
    pages[0].images.push(...images);
  }

  return {
    text: result.value,
    pages,
    metadata: { format: 'docx', warnings: (result as any).warnings || [], imageCount: images.length, tableCount: tables.length },
  };
}

async function parsePdf(file: File, docId: string, env: CloudflareBindings): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const text = await extractTextFromPdf(buffer);
  const images = detectPdfImages(buffer, docId);

  const pages = text.split(/\f/).filter(Boolean).map((text, i) => ({
    pageNumber: i + 1,
    text: text.trim(),
    images: [] as string[],
    tables: [] as string[],
  }));

  if (images.length > 0 && pages.length > 0) {
    pages[0].images.push(...images);
  }

  return {
    text,
    pages,
    metadata: { format: 'pdf', pageCount: pages.length, imageCount: images.length },
  };
}

async function extractDocxImages(buffer: ArrayBuffer, docId: string, env: CloudflareBindings): Promise<string[]> {
  const { convertToHtml } = await import('mammoth');
  const images: string[] = [];
  let imgIndex = 0;

  await (convertToHtml as any)({
    arrayBuffer: buffer,
    convertImage: async () => {
      const imgId = `${docId}:img:${imgIndex++}`;
      images.push(imgId);
      return { src: '' };
    },
  });

  return images;
}

async function extractDocxTables(buffer: ArrayBuffer, docId: string, env: CloudflareBindings, pages: ParseResult['pages']): Promise<string[]> {
  const sql = neon(env.DATABASE_URL);
  const { convertToHtml } = await import('mammoth');
  const tableIds: string[] = [];
  try {
    const htmlResult = await convertToHtml({ arrayBuffer: buffer });
    const html = htmlResult.value || '';
    const tableMatches = html.match(/<table[\s\S]*?<\/table>/gi) || [];

    const tablesToInsert: { id: string; markdown: string }[] = [];

    for (let i = 0; i < tableMatches.length; i++) {
      const tableHtml = tableMatches[i];
      const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
      const mdRows: string[] = [];
      for (const row of rows) {
        const cells = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
        const cellTexts = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
        if (cellTexts.length > 0) {
          mdRows.push(`| ${cellTexts.join(' | ')} |`);
        }
      }
      if (mdRows.length >= 1) {
        const tableMarkdown = mdRows.join('\n');
        const tableId = `${docId}:tbl:${Date.now()}:${i}`;
        tablesToInsert.push({ id: tableId, markdown: tableMarkdown });
        tableIds.push(tableId);
        if (pages[0]) pages[0].tables.push(tableId);
      }
    }

    if (tablesToInsert.length > 0) {
      const placeholders: string[] = [];
      const params: string[] = [];
      let pi = 1;
      for (const t of tablesToInsert) {
        placeholders.push(`($${pi}, $${pi + 1}, 1, $${pi + 2}, $${pi + 3})`);
        params.push(t.id, docId, t.markdown, t.markdown);
        pi += 4;
      }
      await sql.query(
        `INSERT INTO extracted_tables (id, doc_id, page_number, table_data, table_markdown)
         VALUES ${placeholders.join(',')}`,
        params
      );
    }
  } catch (err) {
    console.warn('Docx table extraction skipped:', err);
  }

  return tableIds;
}

function detectPdfImages(buffer: ArrayBuffer, docId: string): string[] {
  const slice = buffer.byteLength > 500000 ? buffer.slice(0, 500000) : buffer;
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(slice);
  const images: string[] = [];
  const imgRefs = raw.match(/\/Im\d+/g) || [];
  const uniqueCount = Math.min(new Set(imgRefs).size, 20);
  for (let i = 0; i < uniqueCount; i++) {
    images.push(`${docId}:img:pdf:${i}`);
  }
  return images;
}

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const { extractText } = await import('unpdf');
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).filter(Boolean).map(t => t.trim());
  return pages.join('\f') || 'PDF text extraction returned empty content.';
}
