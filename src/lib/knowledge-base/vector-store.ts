// Vector Store — pgvector (PostgreSQL) with JSONB fallback.
//
// Uses the EXISTING kb_embeddings table (space_id, provider, model, dim,
// embedding vector). When pgvector is unavailable, a JSONB fallback column
// (embedding_json, added by setup) stores the vectors and cosine similarity
// is computed in JavaScript.
//
// The interface is provider-agnostic so it can later be swapped for
// Pinecone / Qdrant / Weaviate with minimal changes.

import { pool } from "@/db";
import { embedTexts } from "./embeddings";

export interface VectorSearchHit {
  chunkId: number;
  documentId: number;
  score: number; // cosine similarity 0..1 (higher = better)
}

// ---------------------------------------------------------------------------
// Feature detection — does the DB have pgvector?
// ---------------------------------------------------------------------------
let pgvectorAvailable: boolean | null = null;

export async function isPgvectorAvailable(): Promise<boolean> {
  if (pgvectorAvailable !== null) return pgvectorAvailable;
  try {
    const res = await pool.query(
      "SELECT 1 FROM pg_available_extensions WHERE name = 'vector'"
    );
    pgvectorAvailable = (res.rowCount ?? 0) > 0;
  } catch {
    pgvectorAvailable = false;
  }
  return pgvectorAvailable;
}

/** Create extension + fallback column if needed. Called lazily on first use. */
export async function ensureVectorInfrastructure(): Promise<void> {
  const avail = await isPgvectorAvailable();
  if (avail) {
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
      await pool.query(
        `ALTER TABLE kb_embeddings ADD COLUMN IF NOT EXISTS embedding vector(1536)`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS kb_emb_embedding_idx
         ON kb_embeddings USING hnsw (embedding vector_cosine_ops)`
      );
    } catch (e) {
      console.warn("pgvector setup failed — falling back to JSONB mode:", e);
      pgvectorAvailable = false;
    }
  }
  try {
    await pool.query(
      `ALTER TABLE kb_embeddings ADD COLUMN IF NOT EXISTS embedding_json JSONB`
    );
    await pool.query(
      `ALTER TABLE kb_embeddings ALTER COLUMN embedding DROP NOT NULL`
    );
  } catch {
    // ignore — may already exist
  }
}

// ---------------------------------------------------------------------------
// Store embeddings for a document's chunks
// ---------------------------------------------------------------------------
export async function storeEmbeddings(
  documentId: number,
  spaceId: number | null,
  chunkIds: number[],
  chunkTexts: string[],
  model: string,
  dimensions: number
): Promise<void> {
  if (chunkIds.length === 0) return;

  const vectors = await embedTexts(chunkTexts);
  const usePgvector = await isPgvectorAvailable();
  const provider = process.env.EMBEDDING_PROVIDER || "local";

  for (let i = 0; i < chunkIds.length; i++) {
    const vec = vectors[i];
    if (!vec || vec.length === 0) continue;

    if (usePgvector) {
      const padded = padVector(vec, 1536);
      await pool.query(
        `INSERT INTO kb_embeddings (chunk_id, document_id, space_id, provider, model, dim, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
         ON CONFLICT (chunk_id) DO UPDATE
           SET embedding = EXCLUDED.embedding, provider = EXCLUDED.provider,
               model = EXCLUDED.model, dim = EXCLUDED.dim`,
        [chunkIds[i], documentId, spaceId, provider, model, dimensions, `[${padded.join(",")}]`]
      );
    } else {
      await pool.query(
        `INSERT INTO kb_embeddings (chunk_id, document_id, space_id, provider, model, dim, embedding_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (chunk_id) DO UPDATE
           SET embedding_json = EXCLUDED.embedding_json, provider = EXCLUDED.provider,
               model = EXCLUDED.model, dim = EXCLUDED.dim`,
        [chunkIds[i], documentId, spaceId, provider, model, dimensions, JSON.stringify(vec)]
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
export interface VectorSearchOptions {
  accessLevels: string[];
  categoryId?: number;
  spaceId?: number;
  topK?: number;
  threshold?: number; // minimum similarity (0..1)
  excludeArchived?: boolean;
  statuses?: string[]; // restrict to document statuses (e.g. ['published','approved'])
}

export async function searchVectors(
  query: string,
  opts: VectorSearchOptions
): Promise<VectorSearchHit[]> {
  const topK = opts.topK || 8;
  const threshold = opts.threshold ?? 0.0;
  const usePgvector = await isPgvectorAvailable();

  const queryVector = (await embedTexts([query]))[0];
  if (!queryVector) return [];

  if (usePgvector) {
    return searchPgvector(queryVector, opts, topK, threshold);
  }
  return searchJsonb(queryVector, opts, topK, threshold);
}

async function searchPgvector(
  queryVector: number[],
  opts: VectorSearchOptions,
  topK: number,
  threshold: number
): Promise<VectorSearchHit[]> {
  const padded = padVector(queryVector, 1536);
  const params: unknown[] = [`[${padded.join(",")}]`];
  let where = `1=1`;
  let paramIdx = 2;

  if (opts.accessLevels?.length) {
    where += ` AND lower(c.access_level) = ANY($${paramIdx++}::text[])`;
    params.push(opts.accessLevels);
  }
  if (opts.categoryId != null) {
    where += ` AND c.category_id = $${paramIdx++}`;
    params.push(opts.categoryId);
  }
  if (opts.spaceId != null) {
    where += ` AND e.space_id = $${paramIdx++}`;
    params.push(opts.spaceId);
  }
  if (opts.excludeArchived) {
    where += ` AND d.is_archived = false`;
  }
  if (opts.statuses?.length) {
    where += ` AND d.status = ANY($${paramIdx++}::text[])`;
    params.push(opts.statuses);
  }

  const res = await pool.query(
    `SELECT c.id AS chunk_id, c.document_id, 1 - (e.embedding <=> $1::vector) AS score
     FROM kb_embeddings e
     JOIN kb_chunks c ON c.id = e.chunk_id
     JOIN kb_documents d ON d.id = c.document_id
     WHERE ${where} AND e.embedding IS NOT NULL
       AND 1 - (e.embedding <=> $1::vector) >= $${paramIdx}
     ORDER BY e.embedding <=> $1::vector
     LIMIT ${topK}`,
    [...params, threshold]
  );

  return (res.rows as any[]).map((r) => ({
    chunkId: Number(r.chunk_id),
    documentId: Number(r.document_id),
    score: Number(r.score),
  }));
}

async function searchJsonb(
  queryVector: number[],
  opts: VectorSearchOptions,
  topK: number,
  threshold: number
): Promise<VectorSearchHit[]> {
  const params: unknown[] = [opts.accessLevels || []];
  let where = `lower(c.access_level) = ANY($1::text[])`;
  let paramIdx = 2;
  if (opts.categoryId != null) {
    where += ` AND c.category_id = $${paramIdx++}`;
    params.push(opts.categoryId);
  }
  if (opts.spaceId != null) {
    where += ` AND e.space_id = $${paramIdx++}`;
    params.push(opts.spaceId);
  }
  if (opts.excludeArchived) {
    where += ` AND d.is_archived = false`;
  }
  if (opts.statuses?.length) {
    where += ` AND d.status = ANY($${paramIdx++}::text[])`;
    params.push(opts.statuses);
  }
  params.push(topK * 4); // oversample, filter in JS

  const res = await pool.query(
    `SELECT c.id AS chunk_id, c.document_id, e.embedding_json
     FROM kb_embeddings e
     JOIN kb_chunks c ON c.id = e.chunk_id
     JOIN kb_documents d ON d.id = c.document_id
     WHERE ${where} AND e.embedding_json IS NOT NULL
     ORDER BY e.id DESC
     LIMIT $${paramIdx}`,
    params
  );

  const hits: VectorSearchHit[] = [];
  for (const row of res.rows as any[]) {
    const vec: number[] = row.embedding_json;
    if (!Array.isArray(vec) || vec.length === 0) continue;
    const score = cosineSimilarity(queryVector, vec);
    if (score >= threshold) {
      hits.push({
        chunkId: Number(row.chunk_id),
        documentId: Number(row.document_id),
        score,
      });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}

// ---------------------------------------------------------------------------
// Deletion / cleanup
// ---------------------------------------------------------------------------
export async function deleteEmbeddingsForDocument(documentId: number): Promise<void> {
  await pool.query(`DELETE FROM kb_embeddings WHERE document_id = $1`, [documentId]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function padVector(vec: number[], dims: number): number[] {
  if (vec.length === dims) return vec;
  if (vec.length > dims) return vec.slice(0, dims);
  return [...vec, ...new Array(dims - vec.length).fill(0)];
}
