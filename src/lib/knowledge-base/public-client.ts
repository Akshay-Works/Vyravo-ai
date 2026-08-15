// Public Knowledge Client
// Used by customer-facing systems (website chatbot, voice receptionist).
// ONLY retrieves PUBLIC + PUBLISHED/APPROVED knowledge. Internal,
// confidential, client-specific and restricted content is NEVER exposed.

import { pool } from "@/db";
import { searchVectors, ensureVectorInfrastructure } from "./vector-store";
import { isEmbeddingConfigured } from "./embeddings";

export interface PublicKnowledgeHit {
  chunkId: number;
  documentId: number;
  documentTitle: string;
  content: string;
  heading: string | null;
  section: string | null;
  pageNumber: number | null;
  category: string | null;
  score: number;
}

export interface PublicSearchOptions {
  query: string;
  topK?: number;
  threshold?: number;
  categoryId?: number;
}

/**
 * Search only PUBLIC + PUBLISHED/APPROVED knowledge.
 * This is the ONLY retrieval path customer-facing AI systems may use.
 */
export async function searchPublicKnowledge(
  opts: PublicSearchOptions
): Promise<PublicKnowledgeHit[]> {
  const topK = opts.topK || 5;
  const threshold = opts.threshold ?? 0.2;

  let vectorHits: { chunkId: number; documentId: number; score: number }[] = [];
  if (isEmbeddingConfigured()) {
    try {
      await ensureVectorInfrastructure();
      vectorHits = await searchVectors(opts.query, {
        accessLevels: ["public"],
        statuses: ["published", "approved"],
        categoryId: opts.categoryId,
        topK: topK * 2,
        threshold,
      });
    } catch (e) {
      console.warn("Public vector search failed:", e);
    }
  }

  // Keyword path — always available, strict PUBLIC + APPROVED/PUBLISHED filter
  const terms = opts.query
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 8);

  let keywordHits: { chunkId: number; documentId: number; score: number }[] = [];
  if (terms.length > 0) {
    try {
      const res = await pool.query(
        `SELECT c.id AS chunk_id, c.document_id,
                (${terms.map((_, i) => `(length(c.content) - length(replace(lower(c.content), $${i + 1}, ''))) / length($${i + 1})`).join(" + ")}) AS score
         FROM kb_chunks c
         JOIN kb_documents d ON d.id = c.document_id
         WHERE lower(c.access_level) = 'public'
           AND d.is_archived = false
           AND d.status IN ('published', 'approved')
           AND (${terms.map((_, i) => `lower(c.content) LIKE '%' || $${i + 1} || '%'`).join(" OR ")})
         ORDER BY score DESC
         LIMIT ${topK * 2}`,
        terms
      );
      keywordHits = (res.rows as any[]).map((r) => ({
        chunkId: Number(r.chunk_id),
        documentId: Number(r.document_id),
        score: Number(r.score),
      }));
    } catch (e) {
      console.warn("Public keyword search failed:", e);
    }
  }

  // Merge (hybrid): 0.7 vector + 0.3 keyword (keyword normalized 0..1 so
  // term-frequency counts can't swamp semantic scores)
  const maxKw = Math.max(...keywordHits.map((k) => k.score), 0.0001);
  const merged = new Map<number, { chunkId: number; documentId: number; score: number }>();
  for (const v of vectorHits) {
    merged.set(v.chunkId, { chunkId: v.chunkId, documentId: v.documentId, score: v.score * 0.7 });
  }
  for (const k of keywordHits) {
    const kw = k.score / maxKw;
    const existing = merged.get(k.chunkId);
    if (existing) existing.score += kw * 0.3;
    else merged.set(k.chunkId, { chunkId: k.chunkId, documentId: k.documentId, score: kw * 0.3 });
  }

  const sorted = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, topK);
  if (sorted.length === 0) return [];

  // Fetch chunk + doc details
  const results: PublicKnowledgeHit[] = [];
  for (const hit of sorted) {
    const rows = await pool.query(
      `SELECT c.id AS chunk_id, c.document_id, c.content, c.heading, c.section_path, c.page_number,
              d.title AS document_title, cat.name AS category
       FROM kb_chunks c
       JOIN kb_documents d ON d.id = c.document_id
       LEFT JOIN kb_categories cat ON cat.id = c.category_id
       WHERE c.id = $1 AND lower(c.access_level) = 'public'
         AND d.is_archived = false
         AND d.status IN ('published', 'approved')`,
      [hit.chunkId]
    );
    if (rows.rowCount === 0) continue;
    const r = rows.rows[0];
    results.push({
      chunkId: Number(r.chunk_id),
      documentId: Number(r.document_id),
      documentTitle: r.document_title || "Untitled",
      content: String(r.content || ""),
      heading: r.heading,
      section: r.section_path,
      pageNumber: r.page_number != null ? Number(r.page_number) : null,
      category: r.category || null,
      score: hit.score,
    });
  }

  return results;
}

/** True if any public knowledge exists at all (used to skip KB when empty). */
export async function hasPublicKnowledge(): Promise<boolean> {
  try {
    const res = await pool.query(
      `SELECT 1 FROM kb_documents d
       JOIN kb_chunks c ON c.document_id = d.id
       WHERE lower(c.access_level) = 'public'
         AND d.is_archived = false
         AND d.status IN ('published','approved')
       LIMIT 1`
    );
    return (res.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Build a compact, citation-friendly context block for LLM prompts. */
export function buildPublicContext(hits: PublicKnowledgeHit[]): string {
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] (${h.documentTitle}${h.section ? `, ${h.section}` : ""}${h.pageNumber != null ? `, p.${h.pageNumber}` : ""})\n${h.content}`
    )
    .join("\n\n---\n\n");
}
