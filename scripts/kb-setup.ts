/**
 * Vyravo AI — Internal Knowledge Base setup & seed script.
 *
 * The core KB tables (kb_categories, kb_documents, kb_chunks, kb_embeddings,
 * kb_document_versions, kb_document_blobs, kb_users, kb_sessions,
 * kb_audit_logs) ALREADY EXIST in the database — they are reused as-is.
 * This script only:
 *   1. Applies additive columns (doc_type on kb_documents, embedding_json fallback)
 *   2. Creates the genuinely new tables (kb_knowledge_gaps, kb_queries)
 *   3. Seeds default categories
 *   4. Seeds the existing chatbot company knowledge as PUBLIC + APPROVED docs
 *      so the website chatbot / voice receptionist can answer immediately.
 *
 * Run: npm run kb:setup  (idempotent — safe to run multiple times)
 */
import { pool } from "../src/db/index";
import {
  COMPANY_KNOWLEDGE,
  INDUSTRY_RECOMMENDATIONS,
  OBJECTION_RESPONSES,
} from "../src/lib/chatbot/knowledge";
import { chunkText } from "../src/lib/knowledge-base/chunker";
import { createHash } from "crypto";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function ensurePgvector(): Promise<boolean> {
  try {
    const res = await pool.query(
      "SELECT 1 FROM pg_available_extensions WHERE name = 'vector'"
    );
    const avail = (res.rowCount ?? 0) > 0;
    if (avail) {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    }
    return avail;
  } catch {
    return false;
  }
}

async function applyMigrations(usePgvector: boolean) {
  console.log(`Applying additive migrations (pgvector: ${usePgvector ? "yes" : "no"})…`);

  await pool.query(
    `ALTER TABLE kb_documents ADD COLUMN IF NOT EXISTS doc_type VARCHAR(50) DEFAULT 'document'`
  );
  await pool.query(`ALTER TABLE kb_embeddings ADD COLUMN IF NOT EXISTS embedding_json JSONB`);

  if (usePgvector) {
    await pool.query(`ALTER TABLE kb_embeddings ADD COLUMN IF NOT EXISTS embedding vector(1536)`);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS kb_emb_embedding_idx ON kb_embeddings
       USING hnsw (embedding vector_cosine_ops)`
    );
  }

  // New tables (do not exist yet)
  await pool.query(`CREATE TABLE IF NOT EXISTS kb_knowledge_gaps (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    frequency INTEGER DEFAULT 1,
    category TEXT,
    source VARCHAR(50),
    status VARCHAR(30) DEFAULT 'open',
    suggested_action TEXT,
    resolved_by_document_id INTEGER,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now() NOT NULL,
    updated_at TIMESTAMP DEFAULT now() NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS kb_queries (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    query_type VARCHAR(20) NOT NULL,
    results_count INTEGER DEFAULT 0,
    confidence DECIMAL(5,4),
    answered BOOLEAN DEFAULT false,
    answer_satisfactory BOOLEAN,
    gap_created BOOLEAN DEFAULT false,
    source_documents JSONB,
    metadata JSONB,
    session_id TEXT,
    created_at TIMESTAMP DEFAULT now() NOT NULL
  )`);

  console.log("Migrations applied ✓");
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
const DEFAULT_CATEGORIES = [
  { name: "Company Information", slug: "company-information", icon: "🏢", description: "About Vyravo AI, mission, team, contact details", color: "#3B82F6" },
  { name: "Services", slug: "services", icon: "⚡", description: "AI Chatbots, Voice Agents, Workflow Automation and more", color: "#06B6D4" },
  { name: "Pricing", slug: "pricing", icon: "💰", description: "Approved pricing guidelines and proposal information", color: "#10B981" },
  { name: "FAQs", slug: "faqs", icon: "❓", description: "Frequently asked questions and answers", color: "#F59E0B" },
  { name: "Industries", slug: "industries", icon: "🏭", description: "Industry-specific solutions and examples", color: "#8B5CF6" },
  { name: "Case Studies", slug: "case-studies", icon: "📊", description: "Client success stories and implementations", color: "#EC4899" },
  { name: "Testimonials", slug: "testimonials", icon: "⭐", description: "Client testimonials and reviews", color: "#F43F5E" },
  { name: "Policies", slug: "policies", icon: "📜", description: "Company policies and guidelines", color: "#64748B" },
  { name: "Terms & Conditions", slug: "terms-conditions", icon: "⚖️", description: "Legal terms and conditions", color: "#6B7280" },
  { name: "Privacy Policy", slug: "privacy-policy", icon: "🔒", description: "Privacy policy and data handling", color: "#6B7280" },
  { name: "Sales Playbooks", slug: "sales-playbooks", icon: "🎯", description: "Internal sales scripts and qualification rules", color: "#F97316" },
  { name: "SOPs", slug: "sops", icon: "📋", description: "Standard operating procedures", color: "#14B8A6" },
  { name: "Internal Documentation", slug: "internal-documentation", icon: "🗂️", description: "Internal team documentation", color: "#6366F1" },
  { name: "Technical Documentation", slug: "technical-documentation", icon: "🔧", description: "Technical specs and architecture docs", color: "#0EA5E9" },
  { name: "Marketing Content", slug: "marketing-content", icon: "📣", description: "Marketing copy and content guidelines", color: "#D946EF" },
  { name: "Email Templates", slug: "email-templates", icon: "✉️", description: "Approved email templates", color: "#84CC16" },
  { name: "Proposal Information", slug: "proposal-information", icon: "📄", description: "Proposal structure and approved content", color: "#FACC15" },
  { name: "Meeting Scripts", slug: "meeting-scripts", icon: "🗣️", description: "Discovery call and meeting scripts", color: "#22C55E" },
  { name: "Support Documentation", slug: "support-documentation", icon: "🛟", description: "Support and troubleshooting docs", color: "#E879F9" },
];

async function seedCategories(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const cat of DEFAULT_CATEGORIES) {
    const exists = await pool.query(`SELECT id FROM kb_categories WHERE slug = $1`, [cat.slug]);
    if ((exists.rowCount ?? 0) > 0) {
      map.set(cat.slug, exists.rows[0].id);
      continue;
    }
    const res = await pool.query(
      `INSERT INTO kb_categories (name, slug, description, icon, color, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [cat.name, cat.slug, cat.description, cat.icon, cat.color, map.size]
    );
    map.set(cat.slug, res.rows[0].id);
  }
  console.log(`Categories seeded (${map.size}) ✓`);
  return map;
}

// ---------------------------------------------------------------------------
// Seed documents from existing chatbot knowledge
// ---------------------------------------------------------------------------
interface SeedDoc {
  title: string;
  type: string;
  categorySlug: string;
  accessLevel: "public" | "internal";
  content: string;
}

function buildSeedDocs(): SeedDoc[] {
  const docs: SeedDoc[] = [];

  docs.push({
    title: "Vyravo AI — Company Overview",
    type: "document",
    categorySlug: "company-information",
    accessLevel: "public",
    content: `# Vyravo AI — Company Overview

**Company:** ${COMPANY_KNOWLEDGE.name}
**Tagline:** ${COMPANY_KNOWLEDGE.tagline}

## Mission
${COMPANY_KNOWLEDGE.mission}

## Contact
- Phone: ${COMPANY_KNOWLEDGE.contact.phone}
- Email: ${COMPANY_KNOWLEDGE.contact.email}
- LinkedIn: ${COMPANY_KNOWLEDGE.contact.linkedin}
- Hours: ${COMPANY_KNOWLEDGE.contact.hours}

## What Makes Us Different
${COMPANY_KNOWLEDGE.differentiators.map((d) => `- ${d}`).join("\n")}

## Technologies
${COMPANY_KNOWLEDGE.technologies.map((t) => `- ${t}`).join("\n")}`,
  });

  const servicesContent = COMPANY_KNOWLEDGE.services
    .map(
      (s) => `## ${s.name}

${s.description}

### Benefits
${s.benefits.map((b) => `- ${b}`).join("\n")}

### Use Cases
${s.useCases.map((u) => `- ${u}`).join("\n")}`
    )
    .join("\n\n");
  docs.push({
    title: "Our Services",
    type: "service_doc",
    categorySlug: "services",
    accessLevel: "public",
    content: `# Vyravo AI Services\n\n${servicesContent}`,
  });

  const industriesContent = COMPANY_KNOWLEDGE.industries
    .map((i) => `## ${i.name}\n\n${i.examples.map((e) => `- ${e}`).join("\n")}`)
    .join("\n\n");
  docs.push({
    title: "Industries We Serve",
    type: "document",
    categorySlug: "industries",
    accessLevel: "public",
    content: `# Industries We Serve\n\n${industriesContent}`,
  });

  docs.push({
    title: "Our Engagement Process",
    type: "sop",
    categorySlug: "proposal-information",
    accessLevel: "public",
    content: `# Our Process

${COMPANY_KNOWLEDGE.process
  .map((p) => `## Step ${p.step}: ${p.name}\n\n${p.description}`)
  .join("\n\n")}`,
  });

  docs.push({
    title: "Discovery Call — What to Expect",
    type: "service_doc",
    categorySlug: "meeting-scripts",
    accessLevel: "public",
    content: `# Discovery Call

**Duration:** ${COMPANY_KNOWLEDGE.discoveryCall.duration}
**Cost:** ${COMPANY_KNOWLEDGE.discoveryCall.cost}

## What's Included
${COMPANY_KNOWLEDGE.discoveryCall.includes.map((i) => `- ${i}`).join("\n")}

## Next Steps
${COMPANY_KNOWLEDGE.discoveryCall.nextSteps}`,
  });

  COMPANY_KNOWLEDGE.faqs.forEach((faq) => {
    docs.push({
      title: `FAQ: ${faq.q}`,
      type: "faq",
      categorySlug: "faqs",
      accessLevel: "public",
      content: `# ${faq.q}\n\n${faq.a}`,
    });
  });

  const recsContent = Object.entries(INDUSTRY_RECOMMENDATIONS)
    .map(
      ([industry, rec]) => `## ${industry}\n\n### Recommended Services\n${rec.services
        .map((s) => `- ${s}`)
        .join("\n")}\n\n### Example Automations\n${rec.examples.map((e) => `- ${e}`).join("\n")}`
    )
    .join("\n\n");
  docs.push({
    title: "Sales Playbook — Industry Recommendations",
    type: "sop",
    categorySlug: "sales-playbooks",
    accessLevel: "internal",
    content: `# Industry Recommendations (Internal)\n\n${recsContent}`,
  });

  docs.push({
    title: "Sales Playbook — Objection Handling",
    type: "sop",
    categorySlug: "sales-playbooks",
    accessLevel: "internal",
    content: `# Objection Handling Scripts (Internal)

${Object.entries(OBJECTION_RESPONSES)
  .map(([key, response]) => `## ${key}\n\n${response}`)
  .join("\n\n")}`,
  });

  return docs;
}

async function seedDocuments(
  docs: SeedDoc[],
  categories: Map<string, number>,
  usePgvector: boolean,
  spaceId: number
) {
  let created = 0;
  for (const doc of docs) {
    const exists = await pool.query(
      `SELECT id FROM kb_documents WHERE title = $1 AND space_id = $2 LIMIT 1`,
      [doc.title, spaceId]
    );
    if ((exists.rowCount ?? 0) > 0) continue;

    const categoryId = categories.get(doc.categorySlug) ?? null;
    const docRes = await pool.query(
      `INSERT INTO kb_documents
        (space_id, title, doc_type, category_id, status, access_level, version, source_type,
         processing_status, chunk_count, indexed_at, published_at, summary)
       VALUES ($1, $2, $3, $4, 'published', $5, 1, 'manual', 'ready', 0, now(), now(), $6)
       RETURNING id`,
      [spaceId, doc.title, doc.type, categoryId, doc.accessLevel.toUpperCase(), doc.content.slice(0, 300)]
    );
    const documentId = docRes.rows[0].id;

    // Version 1 content row
    const verRes = await pool.query(
      `INSERT INTO kb_document_versions
        (document_id, version, title, content, content_hash, status, access_level, category_id, change_summary)
       VALUES ($1, 1, $2, $3, $4, 'published', $5, $6, 'Initial seed from website knowledge')
       RETURNING id`,
      [documentId, doc.title, doc.content, sha256(doc.content), doc.accessLevel.toUpperCase(), categoryId]
    );
    await pool.query(`UPDATE kb_documents SET current_version_id = $1 WHERE id = $2`, [
      verRes.rows[0].id,
      documentId,
    ]);

    // Chunk + store chunks
    const chunks = chunkText(doc.content);
    const chunkIds: number[] = [];
    for (const chunk of chunks) {
      const chunkRes = await pool.query(
        `INSERT INTO kb_chunks
          (document_id, version_id, space_id, chunk_index, content, content_hash, heading, section_path, page_number,
           chunk_type, document_title, category_id, category_slug, access_level, status, doc_version, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'text', $10, $11, $12, $13, 'published', 1, $14::jsonb)
         RETURNING id`,
        [
          documentId,
          verRes.rows[0].id,
          spaceId,
          chunk.chunkIndex,
          chunk.content,
          sha256(chunk.content),
          chunk.heading,
          chunk.section,
          chunk.pageNumber,
          doc.title,
          categoryId,
          categories.get(doc.categorySlug) ? doc.categorySlug : null,
          doc.accessLevel.toUpperCase(),
          JSON.stringify({ documentTitle: doc.title, version: 1 }),
        ]
      );
      chunkIds.push(chunkRes.rows[0].id);
    }
    await pool.query(`UPDATE kb_documents SET chunk_count = $1 WHERE id = $2`, [
      chunkIds.length,
      documentId,
    ]);

    // Embeddings (only if a provider is configured — else keyword search covers it)
    const provider = process.env.EMBEDDING_PROVIDER || "local";
    const hasKey =
      (provider === "openai" && process.env.OPENAI_API_KEY) ||
      (provider === "cohere" && process.env.COHERE_API_KEY) ||
      (provider === "google" && (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)) ||
      provider === "local";

    if (hasKey) {
      try {
        const { embedTexts, getEmbeddingModelName, getEmbeddingDimensions } = await import(
          "../src/lib/knowledge-base/embeddings"
        );
        const vectors = await embedTexts(chunks.map((c) => c.content));
        const model = getEmbeddingModelName();
        const dims = getEmbeddingDimensions();
        for (let i = 0; i < chunkIds.length; i++) {
          const vec = vectors[i];
          if (!vec) continue;
          if (usePgvector) {
            const padded = vec.length === 1536 ? vec : [...vec, ...new Array(1536 - vec.length).fill(0)];
            await pool.query(
              `INSERT INTO kb_embeddings (chunk_id, document_id, space_id, provider, model, dim, embedding)
               VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
              [chunkIds[i], documentId, spaceId, provider, model, dims, `[${padded.join(",")}]`]
            );
          } else {
            await pool.query(
              `INSERT INTO kb_embeddings (chunk_id, document_id, space_id, provider, model, dim, embedding_json)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
              [chunkIds[i], documentId, spaceId, provider, model, dims, JSON.stringify(vec)]
            );
          }
        }
      } catch (e) {
        console.warn(`Embeddings skipped for "${doc.title}":`, e);
      }
    }

    created++;
    console.log(`  ✓ ${doc.accessLevel.toUpperCase()}: ${doc.title} (${chunks.length} chunks)`);
  }
  console.log(`Documents seeded: ${created} created, ${docs.length - created} already existed ✓`);
}

async function main() {
  console.log("\n=== Vyravo AI Knowledge Base Setup ===\n");

  const usePgvector = await ensurePgvector();
  await applyMigrations(usePgvector);

  // Resolve the default space (existing knowledge_spaces table)
  const spaceRes = await pool.query(
    `SELECT id FROM knowledge_spaces WHERE is_default = true OR slug = 'vyravo-ai' ORDER BY is_default DESC LIMIT 1`
  );
  const spaceId = (spaceRes.rowCount ?? 0) > 0 ? Number(spaceRes.rows[0].id) : 1;
  console.log(`Using space_id = ${spaceId} (default Vyravo AI space)`);

  const categories = await seedCategories();
  const docs = buildSeedDocs();
  await seedDocuments(docs, categories, usePgvector, spaceId);

  console.log("\n=== Setup complete ===\n");
  console.log("Next steps:");
  console.log("  1. Set KB_ADMIN_PASSWORD (and optionally KB_JWT_SECRET) in your environment");
  console.log("  2. Set EMBEDDING_PROVIDER=openai + OPENAI_API_KEY for semantic search");
  console.log("  3. Visit /admin/login to access the Knowledge Base\n");

  await pool.end();
}

main().catch((e) => {
  console.error("Setup failed:", e);
  process.exit(1);
});
