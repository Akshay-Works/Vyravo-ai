/**
 * Re-embed all knowledge chunks with the configured embedding provider.
 * Fixes mixed vector spaces (old rows used vyravo-hash-v1; this rewrites them
 * with the same provider the search uses).
 *
 * Run: npm run kb:reembed
 */
import { pool } from "../src/db/index";
import { embedTexts } from "../src/lib/knowledge-base/embeddings";

async function main() {
  const provider = process.env.EMBEDDING_PROVIDER || "local";
  const model = process.env.EMBEDDING_MODEL || "";
  console.log(`Re-embedding with provider=${provider} model=${model || "(default)"}…`);

  const pgvector = await pool
    .query("SELECT 1 FROM pg_available_extensions WHERE name='vector'")
    .then((r) => (r.rowCount ?? 0) > 0);

  const chunks = await pool.query(
    `SELECT c.id AS chunk_id, c.document_id, c.space_id, c.content
     FROM kb_chunks c
     WHERE c.content IS NOT NULL AND length(c.content) > 0
     ORDER BY c.id`
  );
  console.log(`Found ${chunks.rows.length} chunks`);

  const texts = chunks.rows.map((r: any) => r.content);
  let vectors: number[][] = [];
  const batchSize = 50;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    vectors.push(...(await embedTexts(batch)));
    console.log(`  embedded ${Math.min(i + batchSize, texts.length)}/${texts.length}`);
  }

  // Resolve model name from embeddings module for the record
  const { getEmbeddingModelName, getEmbeddingDimensions } = await import(
    "../src/lib/knowledge-base/embeddings"
  );
  const modelName = model || getEmbeddingModelName();
  const dims = getEmbeddingDimensions();

  let updated = 0;
  for (let i = 0; i < chunks.rows.length; i++) {
    const row = chunks.rows[i] as any;
    const vec = vectors[i];
    if (!vec) continue;
    if (pgvector) {
      const padded = vec.length === 1536 ? vec : [...vec, ...new Array(1536 - vec.length).fill(0)];
      await pool.query(
        `INSERT INTO kb_embeddings (chunk_id, document_id, space_id, provider, model, dim, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
         ON CONFLICT (chunk_id) DO UPDATE
           SET embedding = EXCLUDED.embedding, provider = EXCLUDED.provider,
               model = EXCLUDED.model, dim = EXCLUDED.dim`,
        [row.chunk_id, row.document_id, row.space_id, provider, modelName, dims, `[${padded.join(",")}]`]
      );
    } else {
      await pool.query(
        `INSERT INTO kb_embeddings (chunk_id, document_id, space_id, provider, model, dim, embedding_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (chunk_id) DO UPDATE
           SET embedding_json = EXCLUDED.embedding_json, provider = EXCLUDED.provider,
               model = EXCLUDED.model, dim = EXCLUDED.dim`,
        [row.chunk_id, row.document_id, row.space_id, provider, modelName, dims, JSON.stringify(vec)]
      );
    }
    updated++;
  }
  console.log(`Done — ${updated} chunks re-embedded with ${modelName} (${dims} dims)`);
  await pool.end();
}

main().catch((e) => {
  console.error("Re-embed failed:", e);
  process.exit(1);
});
