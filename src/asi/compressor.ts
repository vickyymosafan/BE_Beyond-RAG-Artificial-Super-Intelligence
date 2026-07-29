import type { RetrievalResult } from '../types';

/**
 * Sentence-Level Context Compressor (Token Optimization & Noise Removal)
 * Safely removes header/footer boilerplate while preserving lists, tables, and document structures.
 */
export function compressContext(
  results: RetrievalResult[],
  query: string
): RetrievalResult[] {
  if (results.length === 0) return results;

  const queryTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  return results.map((r) => {
    // If the chunk contains structured lists, tables, or systematika sections, preserve it intact!
    const isStructuredContent = /^[•\-*]\s+|\n[•\-*]\s+|\n\d+[.)]\s+|^\||\||Tabel\s+\d+|Format Penulisan|Sistematika|Bab\s+\d+/i.test(r.content);
    if (isStructuredContent) {
      return r;
    }

    // Split content into clean sentences or lines
    const sentences = r.content
      .split(/(?<=[.!?\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    // Filter out true page header/footer noise (e.g. standalone page numbers)
    const cleanSentences = sentences.filter((s) => {
      const lower = s.toLowerCase();
      // Only remove if it's purely a standalone page number or header margin line
      if (/^halaman\s+\d+$/i.test(lower)) return false;
      if (/^dokumen\s+panduan\s+ta/i.test(lower) && lower.length < 30) return false;
      return true;
    });

    if (cleanSentences.length === 0) return r;

    // Rank sentences by term density
    const scoredSentences = cleanSentences.map((s) => {
      const lower = s.toLowerCase();
      let matches = 0;
      for (const term of queryTerms) {
        if (lower.includes(term)) matches++;
      }
      return { sentence: s, matches };
    });

    // Pick matching sentences or clean sentences up to 6 to preserve full context
    const topSentences = scoredSentences
      .filter((item) => item.matches > 0)
      .slice(0, 6)
      .map((item) => item.sentence);

    const compressedContent = topSentences.length > 0
      ? topSentences.join('\n')
      : cleanSentences.slice(0, 6).join('\n');

    return {
      ...r,
      content: compressedContent,
    };
  });
}
